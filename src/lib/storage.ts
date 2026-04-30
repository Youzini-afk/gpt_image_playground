import type { TaskRecord, StoredImage, CanvasImage } from '../types'
import * as localDb from './db'

export type StorageMode = 'local' | 'remote'

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

class RemoteStorageAdapter implements StorageAdapter {
  private baseUrl: string
  private token: string

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, '')
    this.token = token
  }

  private async request(path: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const isSameOrigin = this.baseUrl === window.location.origin
    const response = await fetch(`${this.baseUrl}/api/storage${path}`, {
      ...options,
      credentials: isSameOrigin ? 'include' : 'same-origin',
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
    const res = await this.request(`/images/${encodeURIComponent(id)}`)
    if (res.status === 404) return undefined
    return res.json()
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

export function setStorageMode(mode: StorageMode, url?: string, token?: string) {
  if (mode === 'remote' && url) {
    currentAdapter = new RemoteStorageAdapter(url, token || '')
  } else {
    currentAdapter = new LocalStorageAdapter()
  }
}

export async function testConnection(url: string, token?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = url.replace(/\/+$/, '')
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const isSameOrigin = baseUrl === window.location.origin
    const res = await fetch(`${baseUrl}/api/storage/ping`, { headers, credentials: isSameOrigin ? 'include' : 'same-origin' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: !!data.ok }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' }
  }
}