import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileStorage } from './storage'
import { createApiRoutes } from './routes'

function createTempStorage() {
  const dir = mkdtempSync(join(tmpdir(), 'gip-storage-'))
  const storage = new FileStorage(dir)
  return { dir, storage }
}

describe('server storage image metadata and thumbnails', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('lists image ids and metadata without returning full data URLs', async () => {
    const { dir, storage } = createTempStorage()
    tempDirs.push(dir)
    storage.putImage({ id: 'image-a', dataUrl: 'data:image/png;base64,full', createdAt: 10, width: 100 })
    const api = createApiRoutes(storage)

    const idsResponse = await api.request('/images/ids')
    const metadataResponse = await api.request('/images')
    const fullResponse = await api.request('/images?full=true')

    expect(await idsResponse.json()).toEqual(['image-a'])
    expect(await metadataResponse.json()).toEqual([{ id: 'image-a', createdAt: 10, width: 100 }])
    expect(await fullResponse.json()).toEqual([{ id: 'image-a', dataUrl: 'data:image/png;base64,full', createdAt: 10, width: 100 }])
  })

  it('persists thumbnails and removes them with their image', async () => {
    const { dir, storage } = createTempStorage()
    tempDirs.push(dir)
    storage.putImage({ id: 'image-a', dataUrl: 'data:image/png;base64,full', createdAt: 10 })
    const api = createApiRoutes(storage)

    const putResponse = await api.request('/images/image-a/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnailDataUrl: 'data:image/webp;base64,thumb', width: 10, height: 12, thumbnailVersion: 2 }),
    })
    const thumbnailResponse = await api.request('/images/image-a/thumbnail')
    await api.request('/images/image-a', { method: 'DELETE' })
    const deletedThumbnailResponse = await api.request('/images/image-a/thumbnail')

    expect(putResponse.status).toBe(200)
    expect(await thumbnailResponse.json()).toEqual({
      id: 'image-a',
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 10,
      height: 12,
      thumbnailVersion: 2,
    })
    expect(deletedThumbnailResponse.status).toBe(404)
  })

  it('rejects unsafe thumbnail writes', async () => {
    const { dir, storage } = createTempStorage()
    tempDirs.push(dir)
    storage.putImage({ id: 'image-a', dataUrl: 'data:image/png;base64,full', createdAt: 10 })
    const api = createApiRoutes(storage)

    const postThumbnail = async (id: string, body: unknown) => api.request(`/images/${id}/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect((await postThumbnail('image-a', {
      thumbnailDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      width: 10,
      height: 10,
      thumbnailVersion: 2,
    })).status).toBe(400)

    expect((await postThumbnail('bad id', {
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 10,
      height: 10,
      thumbnailVersion: 2,
    })).status).toBe(400)

    expect((await postThumbnail('image-a', {
      thumbnailDataUrl: `data:image/webp;base64,${'a'.repeat(1_500_001)}`,
      width: 10,
      height: 10,
      thumbnailVersion: 2,
    })).status).toBe(400)

    expect((await postThumbnail('image-a', {
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 0,
      height: 10,
      thumbnailVersion: 2,
    })).status).toBe(400)

    expect((await postThumbnail('image-a', {
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 10,
      height: 10,
      thumbnailVersion: 101,
    })).status).toBe(400)
  })
})
