import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from './types'
import { DEFAULT_SETTINGS } from './lib/apiProfiles'
import type { TaskRecord } from './types'

const storageMock = vi.hoisted(() => {
  const adapter = {
    getAllTasks: vi.fn(),
    putTask: vi.fn(),
    deleteTask: vi.fn(),
    clearTasks: vi.fn(),
    getImage: vi.fn(),
    getAllImages: vi.fn(),
    putImage: vi.fn(),
    deleteImage: vi.fn(),
    clearImages: vi.fn(),
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

import { editOutputs, ensureImageCached, initStore, markInterruptedOpenAIRunningTasks, submitTask, useStore } from './store'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }

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
      inputImageIds: [],
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
    storageMock.adapter.getImage.mockResolvedValue(undefined)
    storageMock.adapter.putTask.mockResolvedValue(undefined)
    storageMock.adapter.putImage.mockResolvedValue(undefined)
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

  it('initializes task metadata without eagerly loading every stored image', async () => {
    storageMock.adapter.getAllTasks.mockResolvedValue([
      task({ id: 'task-with-image', outputImages: ['image-a'] }),
    ])

    await initStore()

    expect(useStore.getState().tasks.map((item) => item.id)).toEqual(['task-with-image'])
    expect(storageMock.adapter.getAllImages).not.toHaveBeenCalled()
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
})

describe('interrupted OpenAI running tasks', () => {
  it('marks legacy and OpenAI running tasks as interrupted', () => {
    const now = 10_000
    const legacyRunning = task({ id: 'legacy-running', status: 'running', createdAt: 1_000, finishedAt: null, elapsed: null })
    const openAIRunning = task({ id: 'openai-running', apiProvider: 'openai', status: 'running', createdAt: 2_000, finishedAt: null, elapsed: null })
    const falRunning = task({ id: 'fal-running', apiProvider: 'fal', status: 'running', createdAt: 3_000, finishedAt: null, elapsed: null })
    const doneTask = task({ id: 'done-task', apiProvider: 'openai', status: 'done' })

    const result = markInterruptedOpenAIRunningTasks([legacyRunning, openAIRunning, falRunning, doneTask], now)

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
    expect(result.tasks.find((item) => item.id === 'done-task')).toEqual(doneTask)
  })
})
