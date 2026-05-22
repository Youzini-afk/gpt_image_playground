import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { DEFAULT_PARAMS } from './types'
import { createDefaultFalProfile, createDefaultOpenAIProfile, DEFAULT_RESPONSES_MODEL, DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import type { AgentConversation, ExportData, StoredImage, StoredImageThumbnail, TaskRecord } from './types'
import { getSelectedImageMentionLabel } from './lib/promptImageMentions'

const storageMock = vi.hoisted(() => {
  const tasks = new Map<string, TaskRecord>()
  const images = new Map<string, StoredImage>()
  const thumbnails = new Map<string, StoredImageThumbnail>()
  let imageSeq = 0
  const adapter = {
    getAllTasks: vi.fn(async () => [...tasks.values()]),
    putTask: vi.fn(async (task: TaskRecord) => { tasks.set(task.id, task) }),
    deleteTask: vi.fn(async (id: string) => { tasks.delete(id) }),
    clearTasks: vi.fn(async () => { tasks.clear() }),
    getImage: vi.fn(async (id: string) => images.get(id)),
    getAllImages: vi.fn(async () => [...images.values()]),
    getAllImageIds: vi.fn(async () => [...images.keys()]),
    putImage: vi.fn(async (image: StoredImage) => { images.set(image.id, image) }),
    deleteImage: vi.fn(async (id: string) => { images.delete(id); thumbnails.delete(id) }),
    clearImages: vi.fn(async () => { images.clear(); thumbnails.clear() }),
    getImageThumbnail: vi.fn(async (id: string) => thumbnails.get(id)),
    getStoredFreshImageThumbnail: vi.fn(async (id: string) => thumbnails.get(id)),
    putImageThumbnail: vi.fn(async (thumbnail: StoredImageThumbnail) => { thumbnails.set(thumbnail.id, thumbnail) }),
    deleteImageThumbnail: vi.fn(async (id: string) => { thumbnails.delete(id) }),
    getAllCanvasImages: vi.fn(async () => []),
    putCanvasImage: vi.fn(async () => {}),
    deleteCanvasImage: vi.fn(async () => {}),
    clearCanvasImages: vi.fn(async () => {}),
  }

  return {
    adapter,
    tasks,
    images,
    thumbnails,
    storeImage: vi.fn(async (dataUrl: string, source: StoredImage['source'] = 'upload') => {
      const id = `stored-image-${++imageSeq}`
      images.set(id, { id, dataUrl, source, createdAt: Date.now() })
      return id
    }),
    getStorage: vi.fn(() => adapter),
    setStorageMode: vi.fn(),
    testServerStorage: vi.fn(),
  }
})

vi.mock('./lib/db', () => ({
  CURRENT_THUMBNAIL_VERSION: 2,
  hashDataUrl: vi.fn(async (dataUrl: string) => `hash-${dataUrl}`),
  getAllTasks: storageMock.adapter.getAllTasks,
  putTask: storageMock.adapter.putTask,
  deleteTask: storageMock.adapter.deleteTask,
  clearTasks: storageMock.adapter.clearTasks,
  getImage: storageMock.adapter.getImage,
  getImageThumbnail: storageMock.adapter.getImageThumbnail,
  getStoredFreshImageThumbnail: storageMock.adapter.getStoredFreshImageThumbnail,
  getAllImageIds: storageMock.adapter.getAllImageIds,
  getAllImages: storageMock.adapter.getAllImages,
  putImage: storageMock.adapter.putImage,
  putImageThumbnail: storageMock.adapter.putImageThumbnail,
  deleteImage: storageMock.adapter.deleteImage,
  clearImages: storageMock.adapter.clearImages,
  storeImage: storageMock.storeImage,
}))

vi.mock('./lib/storage', () => ({
  getStorage: storageMock.getStorage,
  setStorageMode: storageMock.setStorageMode,
  testServerStorage: storageMock.testServerStorage,
}))

vi.mock('./lib/api', () => ({
  callImageApi: vi.fn(async () => ({
    images: [],
    actualParams: {},
    actualParamsList: [],
    revisedPrompts: [],
  })),
}))
vi.mock('./lib/agentApi', () => ({
  callAgentConversationTitleApi: vi.fn(async () => '标题'),
  callAgentResponsesApi: vi.fn(() => new Promise(() => {})),
  callBatchImageSingle: vi.fn(async (opts: { batchItemId: string; prompt: string }) => ({
    batchItemId: opts.batchItemId,
    image: { dataUrl: 'data:image/png;base64,batch-output', revisedPrompt: opts.prompt },
    error: null,
  })),
  parseBatchImageCallArguments: vi.fn((args: string) => {
    try {
      const parsed = JSON.parse(args) as { images?: Array<{ id?: string; prompt?: string; reference_ids?: string[] }> }
      return parsed.images?.map((item, index) => ({
        id: item.id || `image_${index + 1}`,
        prompt: item.prompt || '',
        reference_ids: item.reference_ids || [],
      })) ?? null
    } catch {
      return null
    }
  }),
}))
import { clearImages, putImage } from './lib/db'
import { callAgentResponsesApi, callBatchImageSingle } from './lib/agentApi'
import { cleanStaleAgentInputDrafts, editOutputs, ensureImageCached, ensureImageDisplayUrlCached, ensureImageThumbnailCached, getCachedImageDisplayUrl, getErrorToastMessage, getPersistedState, getTaskApiProfile, importData, initStore, markInterruptedOpenAIRunningTasks, regenerateAgentAssistantMessage, releaseImageDisplayUrl, removeTask, retainImageDisplayUrl, reuseConfig, submitAgentMessage, submitTask, useStore } from './store'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }

describe('error toast messages', () => {
  it('drops long error detail after the failure title', () => {
    expect(getErrorToastMessage('Agent 请求失败：接口拒绝了很长的提示词内容')).toBe('Agent 请求失败')
  })

  it('uses a generic message for long raw errors without a title', () => {
    expect(getErrorToastMessage(`invalid request ${'x'.repeat(90)}`)).toBe('操作失败，请查看详情')
  })
})

function agentConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: 'conversation-a',
    title: '新对话',
    activeRoundId: null,
    createdAt: 1,
    updatedAt: 1,
    rounds: [],
    messages: [],
    ...overrides,
  }
}

async function waitForCondition(condition: () => boolean) {
  for (let index = 0; index < 20; index++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
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

function importFile(data: ExportData): File {
  const zipped = zipSync({ 'manifest.json': strToU8(JSON.stringify(data)) })
  const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
  return { arrayBuffer: async () => buffer } as File
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
    storageMock.tasks.clear()
    storageMock.images.clear()
    storageMock.thumbnails.clear()
    storageMock.getStorage.mockClear()
    storageMock.adapter.getAllTasks.mockImplementation(async () => [...storageMock.tasks.values()])
    storageMock.adapter.putTask.mockImplementation(async (task: TaskRecord) => { storageMock.tasks.set(task.id, task) })
    storageMock.adapter.deleteTask.mockImplementation(async (id: string) => { storageMock.tasks.delete(id) })
    storageMock.adapter.clearTasks.mockImplementation(async () => { storageMock.tasks.clear() })
    storageMock.adapter.getImage.mockImplementation(async (id: string) => storageMock.images.get(id))
    storageMock.adapter.getAllImages.mockImplementation(async () => [...storageMock.images.values()])
    storageMock.adapter.getAllImageIds.mockImplementation(async () => [...storageMock.images.keys()])
    storageMock.adapter.putImage.mockImplementation(async (image: StoredImage) => { storageMock.images.set(image.id, image) })
    storageMock.adapter.deleteImage.mockImplementation(async (id: string) => { storageMock.images.delete(id); storageMock.thumbnails.delete(id) })
    storageMock.adapter.clearImages.mockImplementation(async () => { storageMock.images.clear(); storageMock.thumbnails.clear() })
    storageMock.adapter.getImageThumbnail.mockImplementation(async (id: string) => storageMock.thumbnails.get(id))
    storageMock.adapter.getStoredFreshImageThumbnail.mockImplementation(async (id: string) => storageMock.thumbnails.get(id))
    storageMock.adapter.putImageThumbnail.mockImplementation(async (thumbnail: StoredImageThumbnail) => { storageMock.thumbnails.set(thumbnail.id, thumbnail) })
    storageMock.adapter.deleteImageThumbnail.mockImplementation(async (id: string) => { storageMock.thumbnails.delete(id) })
    storageMock.adapter.getAllCanvasImages.mockResolvedValue([])
    storageMock.adapter.putCanvasImage.mockResolvedValue(undefined)
    storageMock.adapter.deleteCanvasImage.mockResolvedValue(undefined)
    storageMock.adapter.clearCanvasImages.mockResolvedValue(undefined)
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

  it('allows full image fallback when a fresh thumbnail is missing', async () => {
    const image = { id: 'fallback-image-a', dataUrl: 'data:image/png;base64,fallback' }
    storageMock.adapter.getStoredFreshImageThumbnail.mockResolvedValue(undefined)
    storageMock.adapter.getImage.mockResolvedValue({
      id: image.id,
      dataUrl: image.dataUrl,
    })

    const thumbnail = await ensureImageThumbnailCached(image.id)
    const fallback = await ensureImageCached(image.id)

    expect(thumbnail).toBeUndefined()
    expect(fallback).toBe(image.dataUrl)
    expect(storageMock.adapter.getStoredFreshImageThumbnail).toHaveBeenCalledWith(image.id)
    expect(storageMock.adapter.getImage).toHaveBeenCalledWith(image.id)
  })

  it('reuses an in-flight image load for concurrent cache misses', async () => {
    const image = { id: 'concurrent-image-a', dataUrl: 'data:image/png;base64,concurrent' }
    storageMock.adapter.getImage.mockResolvedValue({
      id: image.id,
      dataUrl: image.dataUrl,
    })

    const [first, second] = await Promise.all([
      ensureImageCached(image.id),
      ensureImageCached(image.id),
    ])

    expect(first).toBe(image.dataUrl)
    expect(second).toBe(image.dataUrl)
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

  it('shows a submitted toast after creating a gallery task', async () => {
    await submitTask()

    const state = useStore.getState()
    expect(state.tasks).toHaveLength(1)
    expect(state.showToast).toHaveBeenCalledWith('任务已提交', 'success')
  })

  it('preserves selected image mentions when replacing a mask target with an equivalent image id', () => {
    const replacement = { id: 'image-a-replacement', dataUrl: imageA.dataUrl }
    const prompt = `参考 ${getSelectedImageMentionLabel(0)} 生成`
    useStore.setState({
      prompt,
      inputImages: [imageA, imageB],
    })

    useStore.getState().setInputImages([replacement, imageB], {
      equivalentImageIds: { [imageA.id]: replacement.id },
    })

    const state = useStore.getState()
    expect(state.inputImages.map((img) => img.id)).toEqual([replacement.id, imageB.id])
    expect(state.prompt).toBe(prompt)
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
      appMode: 'gallery',
      prompt: 'prompt',
      inputImages: [imageA],
      galleryInputDraft: null,
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

describe('agent conversation creation', () => {
  beforeEach(() => {
    useStore.setState({
      agentConversations: [],
      activeAgentConversationId: null,
      agentSidebarCollapsed: false,
      agentEditingRoundId: null,
    })
  })

  it('refreshes the latest empty conversation instead of creating another one', () => {
    const olderEmpty = agentConversation({ id: 'older-empty', createdAt: 1_000, updatedAt: 1_000 })
    const latestEmpty = agentConversation({ id: 'latest-empty', createdAt: 2_000, updatedAt: 2_000 })
    const now = vi.spyOn(Date, 'now').mockReturnValue(3_000)
    useStore.setState({
      agentConversations: [olderEmpty, latestEmpty],
      activeAgentConversationId: olderEmpty.id,
      agentSidebarCollapsed: false,
      agentEditingRoundId: 'editing-round',
    })

    const id = useStore.getState().createAgentConversation()

    const state = useStore.getState()
    expect(id).toBe(latestEmpty.id)
    expect(state.activeAgentConversationId).toBe(latestEmpty.id)
    expect(state.agentConversations).toHaveLength(2)
    expect(state.agentConversations.find((item) => item.id === latestEmpty.id)).toMatchObject({
      createdAt: 3_000,
      updatedAt: 3_000,
    })
    expect(state.agentConversations.find((item) => item.id === olderEmpty.id)).toEqual(olderEmpty)
    expect(state.agentSidebarCollapsed).toBe(true)
    expect(state.agentEditingRoundId).toBeNull()
    now.mockRestore()
  })

  it('creates a new conversation when the latest conversation has messages', () => {
    const olderEmpty = agentConversation({ id: 'older-empty', createdAt: 1_000, updatedAt: 1_000 })
    const latestUsed = agentConversation({
      id: 'latest-used',
      activeRoundId: 'round-a',
      createdAt: 2_000,
      updatedAt: 2_000,
      rounds: [{
        id: 'round-a',
        index: 1,
        parentRoundId: null,
        userMessageId: 'message-a',
        prompt: 'prompt',
        inputImageIds: [],
        outputTaskIds: [],
        status: 'done',
        error: null,
        createdAt: 2_000,
        finishedAt: 2_000,
      }],
      messages: [{ id: 'message-a', role: 'user', content: 'prompt', roundId: 'round-a', createdAt: 2_000 }],
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(3_000)
    useStore.setState({ agentConversations: [olderEmpty, latestUsed], activeAgentConversationId: latestUsed.id })

    const id = useStore.getState().createAgentConversation()

    const state = useStore.getState()
    expect(id).not.toBe(olderEmpty.id)
    expect(id).not.toBe(latestUsed.id)
    expect(state.agentConversations).toHaveLength(3)
    expect(state.agentConversations[state.agentConversations.length - 1]).toMatchObject({ id, createdAt: 3_000, updatedAt: 3_000, messages: [], rounds: [] })
    expect(state.activeAgentConversationId).toBe(id)
    now.mockRestore()
  })
})

describe('data import', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [],
      agentConversations: [],
      activeAgentConversationId: null,
      showToast: vi.fn(),
    })
  })

  it('skips empty agent conversations when importing task data', async () => {
    const usedConversation = agentConversation({
      id: 'used-conversation',
      activeRoundId: 'round-a',
      rounds: [{
        id: 'round-a',
        index: 1,
        parentRoundId: null,
        userMessageId: 'message-a',
        prompt: 'prompt',
        inputImageIds: [],
        outputTaskIds: [],
        status: 'done',
        error: null,
        createdAt: 1,
        finishedAt: 2,
      }],
      messages: [{ id: 'message-a', role: 'user', content: 'prompt', roundId: 'round-a', createdAt: 1 }],
    })

    const imported = await importData(importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      tasks: [],
      agentConversations: [
        agentConversation({ id: 'empty-conversation' }),
        usedConversation,
      ],
      imageFiles: {},
    }), { importConfig: false, importTasks: true })

    const state = useStore.getState()
    expect(imported).toBe(true)
    expect(state.agentConversations.map((conversation) => conversation.id)).toEqual(['used-conversation'])
    expect(state.activeAgentConversationId).toBe('used-conversation')
  })

  it('merges imported agent conversations without replacing local conversations', async () => {
    const localConversation = agentConversation({
      id: 'local-conversation',
      title: '本地对话',
      createdAt: 1,
      updatedAt: 1,
    })
    const importedConversation = agentConversation({
      id: 'imported-conversation',
      activeRoundId: 'round-a',
      rounds: [{
        id: 'round-a',
        index: 1,
        parentRoundId: null,
        userMessageId: 'message-a',
        prompt: 'imported prompt',
        inputImageIds: [],
        outputTaskIds: [],
        status: 'done',
        error: null,
        createdAt: 2,
        finishedAt: 3,
      }],
      messages: [{ id: 'message-a', role: 'user', content: 'imported prompt', roundId: 'round-a', createdAt: 2 }],
    })
    useStore.setState({
      agentConversations: [localConversation],
      activeAgentConversationId: localConversation.id,
    })

    const imported = await importData(importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      tasks: [],
      agentConversations: [importedConversation],
      imageFiles: {},
    }), { importConfig: false, importTasks: true })

    const state = useStore.getState()
    expect(imported).toBe(true)
    expect(state.agentConversations.map((conversation) => conversation.id)).toEqual(['local-conversation', 'imported-conversation'])
    expect(state.activeAgentConversationId).toBe('local-conversation')
  })
})

describe('agent draft lifecycle', () => {
  const responsesProfile = createDefaultOpenAIProfile({ id: 'openai-responses', apiKey: 'openai-key', apiMode: 'responses' })
  const draftState = {
    prompt: `参考 ${getSelectedImageMentionLabel(0)} 生成`,
    inputImages: [imageA],
    maskDraft: {
      targetImageId: imageA.id,
      maskDataUrl: 'data:image/png;base64,mask',
      updatedAt: 1,
    },
    maskEditorImageId: imageA.id,
    agentEditingRoundId: 'round-a',
  }

  beforeEach(() => {
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        profiles: [responsesProfile],
        activeProfileId: responsesProfile.id,
      }),
      appMode: 'agent',
      agentConversations: [
        agentConversation({ id: 'conversation-a' }),
        agentConversation({ id: 'conversation-b' }),
      ],
      activeAgentConversationId: 'conversation-a',
      galleryInputDraft: null,
      agentInputDrafts: {},
      agentSidebarCollapsed: false,
      agentAssetPanelCollapsed: false,
      ...draftState,
    })
  })

  it('clears visible input but keeps the agent draft when returning to gallery mode', () => {
    useStore.getState().setAppMode('gallery')

    const state = useStore.getState()
    expect(state.appMode).toBe('gallery')
    expect(state.prompt).toBe('')
    expect(state.inputImages).toEqual([])
    expect(state.maskDraft).toBeNull()
    expect(state.maskEditorImageId).toBeNull()
    expect(state.agentEditingRoundId).toBeNull()
    expect(state.agentInputDrafts['conversation-a']).toMatchObject({
      prompt: draftState.prompt,
      inputImages: draftState.inputImages,
      maskDraft: draftState.maskDraft,
      maskEditorImageId: imageA.id,
    })
  })

  it('restores the agent draft when switching back from gallery mode', () => {
    useStore.getState().setAppMode('gallery')
    useStore.getState().setAppMode('agent')

    const state = useStore.getState()
    expect(state.appMode).toBe('agent')
    expect(state.prompt).toBe(draftState.prompt)
    expect(state.inputImages).toEqual(draftState.inputImages)
    expect(state.maskDraft).toEqual(draftState.maskDraft)
    expect(state.maskEditorImageId).toBe(imageA.id)
    expect(state.agentEditingRoundId).toBeNull()
  })

  it('keeps the gallery draft when switching into agent mode and back', () => {
    const galleryPrompt = `画廊 ${getSelectedImageMentionLabel(0)} 草稿`
    useStore.setState({
      appMode: 'gallery',
      prompt: galleryPrompt,
      inputImages: [imageB],
      maskDraft: null,
      maskEditorImageId: null,
      galleryInputDraft: null,
      agentInputDrafts: {
        'conversation-a': {
          prompt: draftState.prompt,
          inputImages: draftState.inputImages,
          maskDraft: draftState.maskDraft,
          maskEditorImageId: imageA.id,
        },
      },
    })

    useStore.getState().setAppMode('agent')

    let state = useStore.getState()
    expect(state.appMode).toBe('agent')
    expect(state.galleryInputDraft).toMatchObject({ prompt: galleryPrompt, inputImages: [imageB] })
    expect(state.prompt).toBe(draftState.prompt)

    useStore.getState().setAppMode('gallery')

    state = useStore.getState()
    expect(state.appMode).toBe('gallery')
    expect(state.prompt).toBe(galleryPrompt)
    expect(state.inputImages).toEqual([imageB])
  })

  it('persists the gallery draft while agent mode is active', () => {
    const galleryPrompt = 'gallery draft'
    useStore.setState({
      appMode: 'agent',
      galleryInputDraft: {
        prompt: galleryPrompt,
        inputImages: [imageB],
        maskDraft: null,
        maskEditorImageId: null,
      },
    })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe(galleryPrompt)
    expect(persisted.inputImages).toEqual([{ id: imageB.id, dataUrl: '' }])
  })

  it('clears stale mentions in the visible input when switching conversations', () => {
    useStore.getState().setActiveAgentConversationId('conversation-b')

    const state = useStore.getState()
    expect(state.activeAgentConversationId).toBe('conversation-b')
    expect(state.prompt).toBe('')
    expect(state.inputImages).toEqual([])
    expect(state.maskDraft).toBeNull()
    expect(state.maskEditorImageId).toBeNull()
    expect(state.agentEditingRoundId).toBeNull()
    expect(state.agentInputDrafts['conversation-a']?.prompt).toBe(draftState.prompt)
  })

  it('restores the previous conversation draft when switching back', () => {
    useStore.getState().setActiveAgentConversationId('conversation-b')
    useStore.getState().setActiveAgentConversationId('conversation-a')

    const state = useStore.getState()
    expect(state.activeAgentConversationId).toBe('conversation-a')
    expect(state.prompt).toBe(draftState.prompt)
    expect(state.inputImages).toEqual(draftState.inputImages)
    expect(state.maskDraft).toEqual(draftState.maskDraft)
    expect(state.maskEditorImageId).toBe(imageA.id)
    expect(state.agentEditingRoundId).toBeNull()
  })

  it('keeps the current draft when selecting the already active conversation', () => {
    useStore.getState().setActiveAgentConversationId('conversation-a')

    const state = useStore.getState()
    expect(state.prompt).toBe(draftState.prompt)
    expect(state.inputImages).toEqual(draftState.inputImages)
    expect(state.maskDraft).toEqual(draftState.maskDraft)
    expect(state.maskEditorImageId).toBe(imageA.id)
  })

  it('persists agent drafts separately from the gallery input draft', () => {
    const persisted = getPersistedState(useStore.getState())

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted.agentInputDrafts['conversation-a']).toMatchObject({
      prompt: draftState.prompt,
      inputImages: [{ id: imageA.id, dataUrl: '' }],
      maskDraft: draftState.maskDraft,
      maskEditorImageId: imageA.id,
    })
    expect(persisted.agentInputDrafts['conversation-a']?.updatedAt).toEqual(expect.any(Number))
  })

  it('removes stale agent drafts except the last active conversation', () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const staleUpdatedAt = now - 3 * 24 * 60 * 60 * 1000 - 1
    const recentUpdatedAt = now - 3 * 24 * 60 * 60 * 1000
    const activeDraft = { prompt: 'active', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: staleUpdatedAt }
    const staleDraft = { prompt: 'stale', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: staleUpdatedAt }
    const recentDraft = { prompt: 'recent', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: recentUpdatedAt }

    const cleaned = cleanStaleAgentInputDrafts({
      'conversation-a': activeDraft,
      'conversation-b': staleDraft,
      'conversation-c': recentDraft,
    }, 'conversation-a', now)

    expect(cleaned).toEqual({
      'conversation-a': activeDraft,
      'conversation-c': recentDraft,
    })
  })

})

describe('agent context for removed outputs', () => {
  beforeEach(() => {
    const profile = createDefaultOpenAIProfile({
      id: 'responses-profile',
      apiKey: 'test-key',
      apiMode: 'responses',
      model: DEFAULT_RESPONSES_MODEL,
    })
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        apiMode: 'responses',
        model: DEFAULT_RESPONSES_MODEL,
        profiles: [profile],
        activeProfileId: profile.id,
      }),
      prompt: '继续',
      inputImages: [],
      maskDraft: null,
      params: { ...DEFAULT_PARAMS },
      appMode: 'agent',
      tasks: [task({
        id: 'task-live',
        outputImages: ['image-live'],
        sourceMode: 'agent',
        agentRoundId: 'round-a',
        agentToolCallId: 'live-call',
      })],
      agentConversations: [agentConversation({
        id: 'conversation-a',
        activeRoundId: 'round-a',
        rounds: [{
          id: 'round-a',
          index: 1,
          parentRoundId: null,
          userMessageId: 'user-a',
          assistantMessageId: 'assistant-a',
          prompt: '画两张图',
          inputImageIds: [],
          outputTaskIds: ['task-deleted', 'task-live'],
          responseOutput: [
            { type: 'message', content: [{ type: 'output_text', text: '已生成两张图。' }] },
            { type: 'image_generation_call', id: 'deleted-call', result: 'deleted-base64' },
            { type: 'image_generation_call', id: 'live-call', result: 'live-base64' },
          ],
          status: 'done',
          error: null,
          createdAt: 1,
          finishedAt: 2,
        }],
        messages: [
          { id: 'user-a', role: 'user', content: '画两张图', roundId: 'round-a', createdAt: 1 },
          { id: 'assistant-a', role: 'assistant', content: '已生成两张图。', roundId: 'round-a', outputTaskIds: ['task-deleted', 'task-live'], createdAt: 2 },
        ],
      })],
      activeAgentConversationId: 'conversation-a',
      agentEditingRoundId: null,
      showToast: vi.fn(),
    })
    vi.mocked(callAgentResponsesApi).mockClear()
    vi.mocked(callAgentResponsesApi).mockResolvedValue({
      text: 'ok',
      images: [],
      outputItems: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
      responseId: 'response-b',
    })
  })

  it('does not send removed image_generation results back to the model', async () => {
    await submitAgentMessage()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const input = vi.mocked(callAgentResponsesApi).mock.calls[0][0].input
    const serializedInput = JSON.stringify(input)
    expect(serializedInput).not.toContain('deleted-base64')
    expect(serializedInput).toContain('live-base64')
    expect(serializedInput).not.toContain('Generated image removed')
    expect(serializedInput).toContain('removed_ref')
    expect(serializedInput).toContain('round-1-image-1')
    expect(serializedInput).toContain('round-1-image-2')
  })

  it('scrubs stored agent response payloads when deleting an output task', async () => {
    const rawResponsePayload = JSON.stringify({
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '已生成两张图。' }] },
        { type: 'image_generation_call', id: 'deleted-call', result: 'deleted-base64' },
        { type: 'image_generation_call', id: 'live-call', result: 'live-base64' },
      ],
    }, null, 2)
    const deletedTask = task({
      id: 'task-deleted',
      outputImages: ['image-deleted'],
      rawResponsePayload,
      sourceMode: 'agent',
      agentRoundId: 'round-a',
      agentToolCallId: 'deleted-call',
    })
    const liveTask = task({
      id: 'task-live',
      outputImages: ['image-live'],
      rawResponsePayload,
      sourceMode: 'agent',
      agentRoundId: 'round-a',
      agentToolCallId: 'live-call',
    })
    useStore.setState((state) => ({
      tasks: [deletedTask, liveTask],
      agentConversations: state.agentConversations.map((conversation) => ({
        ...conversation,
        rounds: conversation.rounds.map((round) => round.id === 'round-a'
          ? { ...round, outputTaskIds: ['task-deleted', 'task-live'], responseOutput: JSON.parse(rawResponsePayload).output }
          : round,
        ),
      })),
    }))

    await removeTask(deletedTask)

    const state = useStore.getState()
    const serializedConversations = JSON.stringify(state.agentConversations)
    const remainingTaskPayload = state.tasks.find((item) => item.id === 'task-live')?.rawResponsePayload ?? ''
    expect(serializedConversations).not.toContain('deleted-base64')
    expect(remainingTaskPayload).not.toContain('deleted-base64')
    expect(serializedConversations).toContain('live-base64')
    expect(remainingTaskPayload).toContain('live-base64')
  })

  it('does not corrupt batch task payloads when deleting one of the batch tasks', async () => {
    const batchDeletedPayload = JSON.stringify({
      output: [{ type: 'image_generation_call', id: 'batch-deleted-call', result: 'batch-deleted-base64' }],
    }, null, 2)
    const batchLivePayload = JSON.stringify({
      output: [{ type: 'image_generation_call', id: 'batch-live-call', result: 'batch-live-base64' }],
    }, null, 2)
    const batchDeletedTask = task({
      id: 'batch-task-deleted',
      outputImages: ['batch-img-deleted'],
      rawResponsePayload: batchDeletedPayload,
      sourceMode: 'agent',
      agentRoundId: 'round-a',
      agentToolCallId: 'batch-deleted-call',
      agentBatchCallId: 'batch-fc-1',
    })
    const batchLiveTask = task({
      id: 'batch-task-live',
      outputImages: ['batch-img-live'],
      rawResponsePayload: batchLivePayload,
      sourceMode: 'agent',
      agentRoundId: 'round-a',
      agentToolCallId: 'batch-live-call',
      agentBatchCallId: 'batch-fc-1',
    })
    useStore.setState((state) => ({
      tasks: [batchDeletedTask, batchLiveTask],
      agentConversations: state.agentConversations.map((conversation) => ({
        ...conversation,
        rounds: conversation.rounds.map((round) => round.id === 'round-a'
          ? {
              ...round,
              outputTaskIds: ['batch-task-deleted', 'batch-task-live'],
              responseOutput: [
                { type: 'function_call', name: 'generate_image_batch', call_id: 'batch-fc-1', arguments: '{}' },
                { type: 'function_call_output', call_id: 'batch-fc-1', output: '{"images":[{"id":"1","status":"done"},{"id":"2","status":"done"}]}' },
              ],
            }
          : round,
        ),
      })),
    }))

    await removeTask(batchDeletedTask)

    const state = useStore.getState()
    const liveTaskPayload = state.tasks.find((item) => item.id === 'batch-task-live')?.rawResponsePayload ?? ''
    expect(liveTaskPayload).toContain('batch-live-base64')
    expect(liveTaskPayload).not.toContain('batch-deleted-base64')
    const serializedConversations = JSON.stringify(state.agentConversations)
    expect(serializedConversations).toContain('function_call_output')
    expect(serializedConversations).not.toContain('batch-deleted-base64')
  })
})

describe('agent batch reference resolution', () => {
  const responsesProfile = createDefaultOpenAIProfile({
    id: 'responses-profile',
    apiKey: 'test-key',
    apiMode: 'responses',
    model: DEFAULT_RESPONSES_MODEL,
  })

  beforeEach(async () => {
    await clearImages()
    await putImage(imageA)
    await putImage(imageB)
    vi.mocked(callAgentResponsesApi).mockReset()
    vi.mocked(callAgentResponsesApi).mockImplementation(() => new Promise(() => {}))
    vi.mocked(callBatchImageSingle).mockReset()
    vi.mocked(callBatchImageSingle).mockImplementation(async (opts: { batchItemId: string; prompt: string }) => ({
      batchItemId: opts.batchItemId,
      image: { dataUrl: 'data:image/png;base64,batch-output', revisedPrompt: opts.prompt },
      error: null,
    }))
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        apiMode: 'responses',
        model: DEFAULT_RESPONSES_MODEL,
        profiles: [responsesProfile],
        activeProfileId: responsesProfile.id,
      }),
      prompt: '继续生成',
      inputImages: [],
      maskDraft: null,
      params: { ...DEFAULT_PARAMS },
      appMode: 'agent',
      tasks: [
        task({ id: 'task-branch-a', outputImages: [imageA.id], sourceMode: 'agent', agentRoundId: 'round-2-a' }),
        task({ id: 'task-branch-b', outputImages: [imageB.id], sourceMode: 'agent', agentRoundId: 'round-2-b' }),
      ],
      agentConversations: [agentConversation({
        id: 'conversation-a',
        activeRoundId: 'round-2-b',
        rounds: [
          {
            id: 'round-1',
            index: 1,
            parentRoundId: null,
            userMessageId: 'user-1',
            assistantMessageId: 'assistant-1',
            prompt: '画基础图',
            inputImageIds: [],
            outputTaskIds: [],
            status: 'done',
            error: null,
            createdAt: 1,
            finishedAt: 2,
          },
          {
            id: 'round-2-a',
            index: 2,
            parentRoundId: 'round-1',
            userMessageId: 'user-2-a',
            assistantMessageId: 'assistant-2-a',
            prompt: '分支 A',
            inputImageIds: [],
            outputTaskIds: ['task-branch-a'],
            status: 'done',
            error: null,
            createdAt: 3,
            finishedAt: 4,
          },
          {
            id: 'round-2-b',
            index: 2,
            parentRoundId: 'round-1',
            userMessageId: 'user-2-b',
            assistantMessageId: 'assistant-2-b',
            prompt: '分支 B',
            inputImageIds: [],
            outputTaskIds: ['task-branch-b'],
            status: 'done',
            error: null,
            createdAt: 5,
            finishedAt: 6,
          },
        ],
        messages: [
          { id: 'user-1', role: 'user', content: '画基础图', roundId: 'round-1', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: '完成', roundId: 'round-1', createdAt: 2 },
          { id: 'user-2-a', role: 'user', content: '分支 A', roundId: 'round-2-a', createdAt: 3 },
          { id: 'assistant-2-a', role: 'assistant', content: '完成', roundId: 'round-2-a', outputTaskIds: ['task-branch-a'], createdAt: 4 },
          { id: 'user-2-b', role: 'user', content: '分支 B', roundId: 'round-2-b', createdAt: 5 },
          { id: 'assistant-2-b', role: 'assistant', content: '完成', roundId: 'round-2-b', outputTaskIds: ['task-branch-b'], createdAt: 6 },
        ],
      })],
      activeAgentConversationId: 'conversation-a',
      agentEditingRoundId: null,
      showToast: vi.fn(),
    })
  })

  it('resolves batch references from the active branch path only', async () => {
    vi.mocked(callAgentResponsesApi)
      .mockResolvedValueOnce({
        text: '',
        images: [],
        outputItems: [{
          type: 'function_call',
          name: 'generate_image_batch',
          call_id: 'batch-call',
          arguments: JSON.stringify({
            images: [{
              id: 'next-image',
              prompt: '参考 <ref id="round-2-image-1" /> 生成',
              reference_ids: ['round-2-image-1'],
            }],
          }),
        }],
        responseId: 'response-1',
      })
      .mockResolvedValueOnce({
        text: '完成',
        images: [],
        outputItems: [{ type: 'message', content: [{ type: 'output_text', text: '完成' }] }],
        responseId: 'response-2',
      })

    await submitAgentMessage()

    for (let i = 0; i < 5 && vi.mocked(callBatchImageSingle).mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(callBatchImageSingle).toHaveBeenCalled()
    const batchArgs = vi.mocked(callBatchImageSingle).mock.calls[0][0]
    expect(batchArgs.referenceImageDataUrls).toEqual([imageB.dataUrl])
    expect(batchArgs.referenceImageDataUrls).not.toContain(imageA.dataUrl)
    expect(batchArgs.referenceIds).toEqual(['round-2-image-1'])
  })

  it('resolves batch references from the current user input images', async () => {
    useStore.setState((state) => ({
      prompt: '继续参考上一轮输入图',
      inputImages: [],
      tasks: [],
      agentConversations: state.agentConversations.map((conversation) => ({
        ...conversation,
        activeRoundId: 'round-current',
        rounds: [{
          id: 'round-current',
          index: 1,
          parentRoundId: null,
          userMessageId: 'user-current',
          assistantMessageId: 'assistant-current',
          prompt: '参考当前图生成',
          inputImageIds: [imageA.id],
          outputTaskIds: [],
          status: 'done',
          error: null,
          createdAt: 7,
          finishedAt: 8,
        }],
        messages: [
          { id: 'user-current', role: 'user', content: '参考当前图生成', roundId: 'round-current', inputImageIds: [imageA.id], createdAt: 7 },
          { id: 'assistant-current', role: 'assistant', content: '完成', roundId: 'round-current', createdAt: 8 },
        ],
      })),
    }))
    vi.mocked(callAgentResponsesApi)
      .mockResolvedValueOnce({
        text: '',
        images: [],
        outputItems: [{
          type: 'function_call',
          name: 'generate_image_batch',
          call_id: 'batch-call-current',
          arguments: JSON.stringify({
            images: [{
              id: 'next-image',
              prompt: '参考 <ref id="round-1-reference-1" /> 生成',
              reference_ids: ['round-1-reference-1'],
            }],
          }),
        }],
        responseId: 'response-1',
      })
      .mockResolvedValueOnce({
        text: '完成',
        images: [],
        outputItems: [{ type: 'message', content: [{ type: 'output_text', text: '完成' }] }],
        responseId: 'response-2',
      })

    await submitAgentMessage()

    await waitForCondition(() => vi.mocked(callBatchImageSingle).mock.calls.length > 0)
    expect(callBatchImageSingle).toHaveBeenCalled()
    const batchArgs = vi.mocked(callBatchImageSingle).mock.calls[0][0]
    expect(batchArgs.referenceImageDataUrls).toEqual([imageA.dataUrl])
    expect(batchArgs.referenceIds).toEqual(['round-1-reference-1'])
  })

  it('marks pre-created batch task cards as error when a batch item fails', async () => {
    vi.mocked(callBatchImageSingle).mockResolvedValueOnce({
      batchItemId: 'failed-image',
      image: null,
      error: 'batch failed',
    })
    vi.mocked(callAgentResponsesApi)
      .mockResolvedValueOnce({
        text: '',
        images: [],
        outputItems: [{
          type: 'function_call',
          name: 'generate_image_batch',
          call_id: 'batch-call-error',
          arguments: JSON.stringify({
            images: [{ id: 'failed-image', prompt: '会失败', reference_ids: [] }],
          }),
        }],
        responseId: 'response-1',
      })
      .mockResolvedValueOnce({
        text: '完成',
        images: [],
        outputItems: [{ type: 'message', content: [{ type: 'output_text', text: '完成' }] }],
        responseId: 'response-2',
      })

    await submitAgentMessage()

    await waitForCondition(() => vi.mocked(callBatchImageSingle).mock.calls.length > 0)
    await waitForCondition(() => useStore.getState().tasks.some((item) => item.agentBatchCallId === 'batch-call-error'))
    expect(callBatchImageSingle).toHaveBeenCalled()
    const batchTask = useStore.getState().tasks.find((item) => item.agentBatchCallId === 'batch-call-error')
    expect(batchTask).toMatchObject({
      status: 'error',
      error: 'batch failed',
      outputImages: [],
    })
  })

  it('marks pre-created batch task cards as error when a batch item rejects', async () => {
    vi.mocked(callBatchImageSingle).mockRejectedValueOnce(new Error('network failed'))
    vi.mocked(callAgentResponsesApi)
      .mockResolvedValueOnce({
        text: '',
        images: [],
        outputItems: [{
          type: 'function_call',
          name: 'generate_image_batch',
          call_id: 'batch-call-reject',
          arguments: JSON.stringify({
            images: [{ id: 'rejected-image', prompt: '会抛错', reference_ids: [] }],
          }),
        }],
        responseId: 'response-1',
      })
      .mockResolvedValueOnce({
        text: '完成',
        images: [],
        outputItems: [{ type: 'message', content: [{ type: 'output_text', text: '完成' }] }],
        responseId: 'response-2',
      })

    await submitAgentMessage()

    await waitForCondition(() => vi.mocked(callBatchImageSingle).mock.calls.length > 0)
    await waitForCondition(() => useStore.getState().tasks.some((item) => item.agentBatchCallId === 'batch-call-reject'))
    const batchTask = useStore.getState().tasks.find((item) => item.agentBatchCallId === 'batch-call-reject')
    expect(batchTask).toMatchObject({
      status: 'error',
      error: 'network failed',
      outputImages: [],
    })
    expect(callAgentResponsesApi).toHaveBeenCalledTimes(2)
  })
})

describe('agent assistant regeneration', () => {
  const responsesProfile = createDefaultOpenAIProfile({ id: 'openai-responses', apiKey: 'openai-key', apiMode: 'responses' })

  beforeEach(() => {
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        profiles: [responsesProfile],
        activeProfileId: responsesProfile.id,
        alwaysShowRetryButton: false,
      }),
      params: { ...DEFAULT_PARAMS, n: 4 },
      agentEditingRoundId: 'round-a',
      agentConversations: [
        agentConversation({
          id: 'conversation-a',
          activeRoundId: 'round-a',
          rounds: [{
            id: 'round-a',
            index: 1,
            parentRoundId: null,
            userMessageId: 'user-a',
            assistantMessageId: 'assistant-a',
            prompt: '画一只猫',
            inputImageIds: [imageA.id],
            outputTaskIds: [],
            status: 'done',
            error: null,
            createdAt: 1,
            finishedAt: 2,
          }],
          messages: [
            { id: 'user-a', role: 'user', content: '画一只猫', roundId: 'round-a', inputImageIds: [imageA.id], createdAt: 1 },
            { id: 'assistant-a', role: 'assistant', content: '已完成。', roundId: 'round-a', createdAt: 2 },
          ],
        }),
      ],
      toast: null,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('creates a sibling round from the assistant message regardless of retry setting', async () => {
    await regenerateAgentAssistantMessage('conversation-a', 'round-a')

    const conversation = useStore.getState().agentConversations[0]
    const newRound = conversation.rounds.find((round) => round.id !== 'round-a')
    expect(newRound).toMatchObject({
      index: 1,
      parentRoundId: null,
      prompt: '画一只猫',
      inputImageIds: [imageA.id],
      status: 'running',
      outputTaskIds: [],
    })
    expect(conversation.activeRoundId).toBe(newRound?.id)
    expect(conversation.messages).toContainEqual(expect.objectContaining({
      role: 'user',
      content: '画一只猫',
      roundId: newRound?.id,
      inputImageIds: [imageA.id],
    }))
    expect(useStore.getState().agentEditingRoundId).toBeNull()
  })

  it('overwrites the same round when regenerating an error assistant message', async () => {
    useStore.setState({
      agentConversations: [
        agentConversation({
          id: 'conversation-a',
          activeRoundId: 'round-a',
          rounds: [{
            id: 'round-a',
            index: 1,
            parentRoundId: null,
            userMessageId: 'user-a',
            assistantMessageId: 'assistant-a',
            prompt: '画一只猫',
            inputImageIds: [imageA.id],
            outputTaskIds: ['task-a'],
            status: 'error',
            error: '失败',
            createdAt: 1,
            finishedAt: 2,
          }],
          messages: [
            { id: 'user-a', role: 'user', content: '画一只猫', roundId: 'round-a', inputImageIds: [imageA.id], createdAt: 1 },
            { id: 'assistant-a', role: 'assistant', content: '请求失败：失败', roundId: 'round-a', outputTaskIds: ['task-a'], createdAt: 2 },
          ],
        }),
      ],
    })

    await regenerateAgentAssistantMessage('conversation-a', 'round-a')

    const conversation = useStore.getState().agentConversations[0]
    expect(conversation.rounds).toHaveLength(1)
    expect(conversation.activeRoundId).toBe('round-a')
    expect(conversation.rounds[0]).toMatchObject({
      id: 'round-a',
      status: 'running',
      error: null,
      outputTaskIds: [],
      finishedAt: null,
    })
    expect(conversation.messages.find((message) => message.id === 'assistant-a')).toMatchObject({
      content: '',
      outputTaskIds: [],
    })
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

  it('does not resolve a task API profile by stored name or model', () => {
    const resolved = getTaskApiProfile(useStore.getState().settings, task({
      apiProvider: 'fal',
      apiProfileName: falProfile.name,
      apiModel: falProfile.model,
    }))

    expect(resolved).toBeNull()
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

  it('keeps selected image mentions when reusing a task with different current input images', async () => {
    await clearImages()
    await putImage(imageA)
    await putImage(imageB)
    const taskPrompt = `参考 ${getSelectedImageMentionLabel(1)} 生成`

    useStore.setState({
      prompt: `当前 ${getSelectedImageMentionLabel(1)}`,
      inputImages: [
        { id: 'current-x', dataUrl: 'data:image/png;base64,x' },
        { id: 'current-y', dataUrl: 'data:image/png;base64,y' },
      ],
    })

    await reuseConfig(task({
      apiProvider: 'openai',
      apiProfileId: openaiProfile.id,
      prompt: taskPrompt,
      inputImageIds: [imageA.id, imageB.id],
    }))

    const state = useStore.getState()
    expect(state.inputImages.map((img) => img.id)).toEqual([imageA.id, imageB.id])
    expect(state.prompt).toBe(taskPrompt)
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
