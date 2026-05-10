import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from './types'
import { createDefaultFalProfile, createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import type { TaskRecord } from './types'

const storageMock = vi.hoisted(() => {
  const adapter = {
    getAllTasks: vi.fn(),
    putTask: vi.fn(),
    deleteTask: vi.fn(),
    clearTasks: vi.fn(),
    getImage: vi.fn(),
    getAllImages: vi.fn(),
    getAllImageIds: vi.fn(),
    putImage: vi.fn(),
    deleteImage: vi.fn(),
    clearImages: vi.fn(),
    getImageThumbnail: vi.fn(),
    getStoredFreshImageThumbnail: vi.fn(),
    putImageThumbnail: vi.fn(),
    deleteImageThumbnail: vi.fn(),
    getAllCanvasImages: vi.fn(),
    putCanvasImage: vi.fn(),
    deleteCanvasImage: vi.fn(),
    clearCanvasImages: vi.fn(),
  }

  return {
    adapter,
    getStorage: vi.fn(() => adapter),
    setStorageMode: vi.fn(),
    testServerStorage: vi.fn(),
  }
})

vi.mock('./lib/storage', () => ({
  getStorage: storageMock.getStorage,
  setStorageMode: storageMock.setStorageMode,
  testServerStorage: storageMock.testServerStorage,
}))

import { editOutputs, ensureImageCached, ensureImageDisplayUrlCached, ensureImageThumbnailCached, getCachedImageDisplayUrl, getPersistedState, getTaskApiProfile, initStore, markInterruptedOpenAIRunningTasks, releaseImageDisplayUrl, retainImageDisplayUrl, reuseConfig, submitTask, useStore } from './store'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }

async function waitForCondition(condition: () => boolean) {
  for (let index = 0; index < 20; index++) {
    if (condition()) return
    await Promise.resolve()
  }
}

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

describe('mask draft lifecycle in store actions', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      inputImages: [],
      maskDraft: null,
      maskEditorImageId: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      detailTaskId: null,
      lightboxImageId: null,
      lightboxImageList: [],
      showSettings: false,
      toast: null,
      confirmDialog: null,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
    for (const mock of Object.values(storageMock.adapter)) mock.mockReset()
    storageMock.getStorage.mockClear()
    storageMock.adapter.getAllTasks.mockResolvedValue([])
    storageMock.adapter.getAllCanvasImages.mockResolvedValue([])
    storageMock.adapter.getAllImages.mockResolvedValue([])
    storageMock.adapter.getAllImageIds.mockResolvedValue([])
    storageMock.adapter.getImage.mockResolvedValue(undefined)
    storageMock.adapter.getStoredFreshImageThumbnail.mockResolvedValue(undefined)
    storageMock.adapter.getImageThumbnail.mockResolvedValue(undefined)
    storageMock.adapter.putTask.mockResolvedValue(undefined)
    storageMock.adapter.putImage.mockResolvedValue(undefined)
    storageMock.adapter.putImageThumbnail.mockResolvedValue(undefined)
    storageMock.adapter.deleteImage.mockResolvedValue(undefined)
  })

  it('preserves an existing mask when quick edit-output adds outputs as references', async () => {
    const maskDraft = {
      targetImageId: imageA.id,
      maskDataUrl: 'data:image/png;base64,mask',
      updatedAt: 1,
    }
    useStore.setState({
      inputImages: [imageA],
      maskDraft,
    })

    await editOutputs(task({ outputImages: [imageA.id] }))

    expect(useStore.getState().maskDraft).toEqual(maskDraft)
  })

  it('clears an invalid mask draft when submit cannot find the mask target image', async () => {
    useStore.setState({
      inputImages: [imageA],
      maskDraft: {
        targetImageId: 'missing-image',
        maskDataUrl: 'data:image/png;base64,mask',
        updatedAt: 1,
      },
    })

    await submitTask()

    expect(useStore.getState().maskDraft).toBeNull()
  })

  it('keeps persisted input image ids in sync with visible reference images', () => {
    const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }

    useStore.getState().addInputImage(imageA)
    useStore.getState().addInputImage(imageB)
    expect(useStore.getState().inputImageIds).toEqual(['image-a', 'image-b'])

    useStore.getState().moveInputImage(0, 2)
    expect(useStore.getState().inputImageIds).toEqual(['image-b', 'image-a'])

    useStore.getState().removeInputImage(0)
    expect(useStore.getState().inputImageIds).toEqual(['image-a'])

    useStore.getState().clearInputImages()
    expect(useStore.getState().inputImageIds).toEqual([])
  })

  it('initializes task metadata without eagerly loading every stored image', async () => {
    storageMock.adapter.getAllTasks.mockResolvedValue([
      task({ id: 'task-with-image', outputImages: ['image-a'] }),
    ])

    await initStore()

    expect(useStore.getState().tasks.map((item) => item.id)).toEqual(['task-with-image'])
    expect(storageMock.adapter.getAllImageIds).toHaveBeenCalledTimes(1)
    expect(storageMock.adapter.getAllImages).not.toHaveBeenCalled()
    expect(storageMock.adapter.getImage).not.toHaveBeenCalledWith('image-a')
  })

  it('limits startup thumbnail backfill to recent referenced images', async () => {
    const idleCallbacks: Array<() => void> = []
    vi.stubGlobal('window', {
      ...globalThis.window,
      requestIdleCallback: vi.fn((callback: () => void) => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      }),
    })

    const imageIds = Array.from({ length: 20 }, (_, index) => `image-${index}`)
    storageMock.adapter.getAllTasks.mockResolvedValue(imageIds.map((id, index) => task({
      id: `task-${index}`,
      outputImages: [id],
      createdAt: index,
    })))
    storageMock.adapter.getAllImageIds.mockResolvedValue(imageIds)

    try {
      await initStore()

      for (let cycle = 0; cycle < 20 && idleCallbacks.length > 0; cycle++) {
        const callbacks = idleCallbacks.splice(0)
        for (const callback of callbacks) callback()
        await Promise.resolve()
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      const backfilledIds = storageMock.adapter.getStoredFreshImageThumbnail.mock.calls.map(([id]) => id)
      expect(backfilledIds).toEqual(imageIds.slice(0, 12))
      expect(storageMock.adapter.getImage).not.toHaveBeenCalledWith('image-12')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('loads thumbnails through the storage adapter without fetching full images', async () => {
    storageMock.adapter.getStoredFreshImageThumbnail.mockResolvedValue({
      id: 'image-a',
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 10,
      height: 12,
      thumbnailVersion: 2,
    })

    const thumbnail = await ensureImageThumbnailCached('image-a')

    expect(thumbnail).toEqual({ dataUrl: 'data:image/webp;base64,thumb', width: 10, height: 12, thumbnailVersion: 2 })
    expect(storageMock.adapter.getStoredFreshImageThumbnail).toHaveBeenCalledWith('image-a')
    expect(storageMock.adapter.getImage).not.toHaveBeenCalledWith('image-a')
  })

  it('reuses an in-flight image load for concurrent cache misses', async () => {
    storageMock.adapter.getImage.mockResolvedValue({
      id: 'image-a',
      dataUrl: imageA.dataUrl,
    })

    const [first, second] = await Promise.all([
      ensureImageCached('image-a'),
      ensureImageCached('image-a'),
    ])

    expect(first).toBe(imageA.dataUrl)
    expect(second).toBe(imageA.dataUrl)
    expect(storageMock.adapter.getImage).toHaveBeenCalledTimes(1)
  })

  it('caches full image display URLs without changing the data URL cache API', async () => {
    const image = { id: 'display-image-a', dataUrl: 'data:image/png;base64,display-a' }
    const createObjectURL = vi.fn(() => 'blob:image-a')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' }))))
    storageMock.adapter.getImage.mockResolvedValue({ id: image.id, dataUrl: image.dataUrl })

    try {
      const first = await ensureImageDisplayUrlCached(image.id)
      const second = await ensureImageDisplayUrlCached(image.id)

      expect(first).toBe('blob:image-a')
      expect(second).toBe('blob:image-a')
      expect(getCachedImageDisplayUrl(image.id)).toBe('blob:image-a')
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(await ensureImageCached(image.id)).toBe(image.dataUrl)
    } finally {
      releaseImageDisplayUrl(image.id)
      vi.unstubAllGlobals()
    }
  })

  it('reuses in-flight display URL loads and revokes on explicit release', async () => {
    const image = { id: 'display-image-b', dataUrl: 'data:image/png;base64,display-b' }
    const createObjectURL = vi.fn(() => 'blob:image-a')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' }))))
    storageMock.adapter.getImage.mockResolvedValue({ id: image.id, dataUrl: image.dataUrl })

    try {
      const [first, second] = await Promise.all([
        ensureImageDisplayUrlCached(image.id),
        ensureImageDisplayUrlCached(image.id),
      ])

      expect(first).toBe('blob:image-a')
      expect(second).toBe('blob:image-a')
      expect(createObjectURL).toHaveBeenCalledTimes(1)

      releaseImageDisplayUrl(image.id)

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-a')
      expect(getCachedImageDisplayUrl(image.id)).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('evicts the oldest display URLs from the LRU cache', async () => {
    let nextObjectUrl = 0
    const createObjectURL = vi.fn(() => `blob:image-${nextObjectUrl++}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async (dataUrl: string) => ({
      blob: async () => new Blob(['image'], { type: dataUrl.slice('data:image/'.length, dataUrl.indexOf(';')) }),
    })))
    storageMock.adapter.getImage.mockImplementation(async (id: string) => ({
      id,
      dataUrl: `data:image/${id};base64,a`,
    }))

    try {
      for (let index = 0; index < 9; index++) {
        await ensureImageDisplayUrlCached(`image-${index}`)
      }

      expect(getCachedImageDisplayUrl('image-0')).toBeUndefined()
      expect(getCachedImageDisplayUrl('image-8')).toBe('blob:image-8')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-0')
    } finally {
      for (let index = 0; index < 9; index++) releaseImageDisplayUrl(`image-${index}`)
      vi.unstubAllGlobals()
    }
  })

  it('does not evict retained display URLs from the LRU cache', async () => {
    let nextObjectUrl = 0
    const createObjectURL = vi.fn(() => `blob:retained-${nextObjectUrl++}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async (dataUrl: string) => ({
      blob: async () => new Blob(['image'], { type: dataUrl.slice('data:image/'.length, dataUrl.indexOf(';')) }),
    })))
    storageMock.adapter.getImage.mockImplementation(async (id: string) => ({
      id,
      dataUrl: `data:image/${id};base64,a`,
    }))

    try {
      const retained = await retainImageDisplayUrl('retained-image')
      for (let index = 0; index < 8; index++) {
        await ensureImageDisplayUrlCached(`overflow-${index}`)
      }

      expect(getCachedImageDisplayUrl('retained-image')).toBe(retained)
      expect(revokeObjectURL).not.toHaveBeenCalledWith(retained)
      expect(getCachedImageDisplayUrl('overflow-0')).toBeUndefined()
    } finally {
      releaseImageDisplayUrl('retained-image')
      for (let index = 0; index < 8; index++) releaseImageDisplayUrl(`overflow-${index}`)
      vi.unstubAllGlobals()
    }
  })

  it('invalidates pending retained display URL loads after release', async () => {
    const createObjectURL = vi.fn(() => 'blob:late-release')
    const revokeObjectURL = vi.fn()
    let resolveBlob!: (blob: Blob) => void
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: () => new Promise<Blob>((resolve) => { resolveBlob = resolve }),
    })))
    storageMock.adapter.getImage.mockResolvedValue({ id: 'late-release-image', dataUrl: 'data:image/png;base64,late' })

    try {
      const pending = retainImageDisplayUrl('late-release-image')
      await waitForCondition(() => typeof resolveBlob === 'function')
      releaseImageDisplayUrl('late-release-image')
      resolveBlob(new Blob(['image'], { type: 'image/png' }))

      await expect(pending).resolves.toBeUndefined()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:late-release')
      expect(getCachedImageDisplayUrl('late-release-image')).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not re-cache pending display URL loads after clearing the display cache', async () => {
    const createObjectURL = vi.fn(() => 'blob:late-clear')
    const revokeObjectURL = vi.fn()
    let resolveBlob!: (blob: Blob) => void
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: () => new Promise<Blob>((resolve) => { resolveBlob = resolve }),
    })))
    storageMock.adapter.getImage.mockResolvedValue({ id: 'late-clear-image', dataUrl: 'data:image/png;base64,late' })

    try {
      const pending = ensureImageDisplayUrlCached('late-clear-image')
      await waitForCondition(() => typeof resolveBlob === 'function')
      releaseImageDisplayUrl('late-clear-image')
      resolveBlob(new Blob(['image'], { type: 'image/png' }))

      await expect(pending).resolves.toBeUndefined()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:late-clear')
      expect(getCachedImageDisplayUrl('late-clear-image')).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('interrupted OpenAI running tasks', () => {
  it('marks legacy and OpenAI running tasks as interrupted', () => {
    const now = 10_000
    const legacyRunning = task({ id: 'legacy-running', status: 'running', createdAt: 1_000, finishedAt: null, elapsed: null })
    const openAIRunning = task({ id: 'openai-running', apiProvider: 'openai', status: 'running', createdAt: 2_000, finishedAt: null, elapsed: null })
    const falRunning = task({ id: 'fal-running', apiProvider: 'fal', status: 'running', createdAt: 3_000, finishedAt: null, elapsed: null })
    const customAsyncRunning = task({ id: 'custom-running', apiProvider: 'custom-provider', customTaskId: 'task-1', status: 'running', createdAt: 4_000, finishedAt: null, elapsed: null })
    const doneTask = task({ id: 'done-task', apiProvider: 'openai', status: 'done' })

    const result = markInterruptedOpenAIRunningTasks([legacyRunning, openAIRunning, falRunning, customAsyncRunning, doneTask], now)

    expect(result.interruptedTasks.map((item) => item.id)).toEqual(['legacy-running', 'openai-running'])
    expect(result.tasks.find((item) => item.id === 'legacy-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 9_000,
    })
    expect(result.tasks.find((item) => item.id === 'openai-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 8_000,
    })
    expect(result.tasks.find((item) => item.id === 'fal-running')).toEqual(falRunning)
    expect(result.tasks.find((item) => item.id === 'custom-running')).toEqual(customAsyncRunning)
    expect(result.tasks.find((item) => item.id === 'done-task')).toEqual(doneTask)
  })
})

describe('input persistence setting', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      prompt: 'prompt',
      inputImages: [imageA],
      dismissedCodexCliPrompts: [],
    })
  })

  it('persists input when restart input restore is enabled', () => {
    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('prompt')
    expect(persisted.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
  })

  it('omits input when restart input restore is disabled', () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false } })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted).not.toHaveProperty('inputImages')
  })

  it('writes empty input when persisted input is cleared', () => {
    useStore.setState({ prompt: '', inputImages: [] })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('')
    expect(persisted.inputImages).toEqual([])
  })
})

describe('reused task API profile', () => {
  const openaiProfile = createDefaultOpenAIProfile({ id: 'openai-profile', apiKey: 'openai-key' })
  const falProfile = createDefaultFalProfile({ id: 'fal-profile', name: 'fal 配置', apiKey: 'fal-key' })

  beforeEach(() => {
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        profiles: [openaiProfile, falProfile],
        activeProfileId: openaiProfile.id,
        reuseTaskApiProfileTemporarily: true,
      }),
      prompt: '',
      inputImages: [],
      maskDraft: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      showSettings: false,
      toast: null,
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('resolves a task API profile by stored profile id', () => {
    const resolved = getTaskApiProfile(useStore.getState().settings, task({ apiProvider: 'fal', apiProfileId: falProfile.id }))

    expect(resolved?.id).toBe(falProfile.id)
  })

  it('reuses the task API profile temporarily without switching the active profile', async () => {
    await reuseConfig(task({
      apiProvider: 'fal',
      apiProfileId: falProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBe(falProfile.id)
    expect(state.params).toMatchObject({ n: 4, size: '1360x1024', quality: 'high' })
    expect(state.showToast).toHaveBeenCalledWith('已临时复用该任务的 API 配置「fal 配置」', 'success')
  })

  it('clears temporary reuse when switching current settings to the reused API profile', async () => {
    await reuseConfig(task({ apiProvider: 'fal', apiProfileId: falProfile.id }))

    useStore.getState().setSettings({ activeProfileId: falProfile.id })

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(falProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.reusedTaskApiProfileMissing).toBe(false)
  })

  it('normalizes reused params to the current API profile when temporary reuse is disabled', async () => {
    useStore.setState({
      settings: normalizeSettings({
        ...useStore.getState().settings,
        reuseTaskApiProfileTemporarily: false,
      }),
    })

    await reuseConfig(task({
      apiProvider: 'fal',
      apiProfileId: falProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.params).toMatchObject({ n: 8, size: 'auto', quality: 'auto' })
  })

  it('asks whether to submit with current API profile when the reused API profile is missing', async () => {
    await reuseConfig(task({ apiProvider: 'fal', apiProfileId: 'missing-profile' }))

    const state = useStore.getState()
    expect(state.tasks).toEqual([])
    expect(state.setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '找不到 API 配置',
      message: '找不到复用任务所使用的 API 配置「未知配置」，要使用当前的 API 配置「默认」提交任务吗？',
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
    }))
    expect(state.showSettings).toBe(false)
  })
})
