import type { TaskRecord, StoredImage, CanvasImage } from '../types'
import * as localDb from './db'

export type StorageMode = 'local' | 'server'

export interface StorageAdapter {
  getAllTasks(): Promise<TaskRecord[]>
  putTask(task: TaskRecord): Promise<void>
  deleteTask(id: string): Promise<void>
  clearTasks(): Promise<void>
  getImage(id: string): Promise<StoredImage | undefined>
  getAllImages(): Promise<StoredImage[]>
  putImage(image: StoredImage): Promise<void>
  deleteImage(id: string): Promise<void>
  clearImages(): Promise<void>
  getAllCanvasImages(): Promise<CanvasImage[]>
  putCanvasImage(item: CanvasImage): Promise<void>
  deleteCanvasImage(id: string): Promise<void>
  clearCanvasImages(): Promise<void>
}

class LocalStorageAdapter implements StorageAdapter {
  getAllTasks() { return localDb.getAllTasks() }
  putTask(task: TaskRecord) { return localDb.putTask(task).then(() => {}) }
  deleteTask(id: string) { return localDb.deleteTask(id).then(() => {}) }
  clearTasks() { return localDb.clearTasks().then(() => {}) }
  getImage(id: string) { return localDb.getImage(id) }
  getAllImages() { return localDb.getAllImages() }
  putImage(image: StoredImage) { return localDb.putImage(image).then(() => {}) }
  deleteImage(id: string) { return localDb.deleteImage(id).then(() => {}) }
  clearImages() { return localDb.clearImages().then(() => {}) }
  getAllCanvasImages() { return localDb.getAllCanvasImages() }
  putCanvasImage(item: CanvasImage) { return localDb.putCanvasImage(item).then(() => {}) }
  deleteCanvasImage(id: string) { return localDb.deleteCanvasImage(id).then(() => {}) }
  clearCanvasImages() { return localDb.clearCanvasImages().then(() => {}) }
}

class ServerStorageAdapter implements StorageAdapter {
  private baseUrl: string

  constructor() {
    this.baseUrl = `${window.location.origin}/api/storage`
  }

  private async request(path: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      cache: 'no-store',
      credentials: 'include',
      headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Storage API error: ${response.status} ${text}`)
    }
    return response
  }

  async getAllTasks(): Promise<TaskRecord[]> {
    const res = await this.request('/tasks')
    return res.json()
  }

  async putTask(task: TaskRecord): Promise<void> {
    await this.request('/tasks', { method: 'POST', body: JSON.stringify(task) })
  }

  async deleteTask(id: string): Promise<void> {
    await this.request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async clearTasks(): Promise<void> {
    await this.request('/tasks', { method: 'DELETE' })
  }

  async getImage(id: string): Promise<StoredImage | undefined> {
    try {
      const res = await this.request(`/images/${encodeURIComponent(id)}`)
      return res.json()
    } catch (err: any) {
      if (err.message?.includes('Storage API error: 404')) return undefined
      throw err
    }
  }

  async getAllImages(): Promise<StoredImage[]> {
    const res = await this.request('/images?full=true')
    return res.json()
  }

  async putImage(image: StoredImage): Promise<void> {
    await this.request('/images', { method: 'POST', body: JSON.stringify(image) })
  }

  async deleteImage(id: string): Promise<void> {
    await this.request(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async clearImages(): Promise<void> {
    await this.request('/images', { method: 'DELETE' })
  }

  async getAllCanvasImages(): Promise<CanvasImage[]> {
    const res = await this.request('/canvas-images')
    return res.json()
  }

  async putCanvasImage(item: CanvasImage): Promise<void> {
    await this.request('/canvas-images', { method: 'POST', body: JSON.stringify(item) })
  }

  async deleteCanvasImage(id: string): Promise<void> {
    await this.request(`/canvas-images/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async clearCanvasImages(): Promise<void> {
    await this.request('/canvas-images', { method: 'DELETE' })
  }
}

let currentAdapter: StorageAdapter = new LocalStorageAdapter()

export function getStorage(): StorageAdapter {
  return currentAdapter
}

export function setStorageMode(mode: StorageMode) {
  if (mode === 'server') {
    currentAdapter = new ServerStorageAdapter()
  } else {
    currentAdapter = new LocalStorageAdapter()
  }
}

export async function testServerStorage(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${window.location.origin}/api/storage/ping`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: !!data.ok }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' }
  }
}