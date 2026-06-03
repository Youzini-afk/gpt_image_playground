import { Hono } from 'hono'
import type { FileStorage } from './storage'

const MAX_IMAGE_ID_LENGTH = 128
const MAX_THUMBNAIL_DATA_URL_CHARS = 1_500_000
const MAX_THUMBNAIL_REQUEST_CHARS = MAX_THUMBNAIL_DATA_URL_CHARS + 2_000
const MAX_THUMBNAIL_BYTES = 1_000_000
const MAX_THUMBNAIL_DIMENSION = 16_384
const MAX_THUMBNAIL_VERSION = 100
const SAFE_THUMBNAIL_DATA_URL = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function createApiRoutes(storage: FileStorage): Hono {
  const api = new Hono()

  api.get('/ping', (c) => c.json({ ok: true }))

  api.get('/tasks', (c) => c.json(storage.getAllTasks()))
  api.post('/tasks', async (c) => {
    const task = await c.req.json()
    storage.putTask(task)
    return c.json({ ok: true })
  })
  api.delete('/tasks/:id', (c) => {
    storage.deleteTask(c.req.param('id'))
    return c.json({ ok: true })
  })
  api.delete('/tasks', (c) => {
    storage.clearTasks()
    return c.json({ ok: true })
  })

  api.get('/images', (c) => {
    const full = c.req.query('full') === 'true'
    return c.json(full ? storage.getAllImages() : storage.getAllImageMetadata())
  })
  api.get('/images/ids', (c) => c.json(storage.getAllImageIds()))
  api.get('/images/:id/thumbnail', (c) => {
    const thumbnail = storage.getImageThumbnail(c.req.param('id'))
    if (!thumbnail) return c.json({ error: 'Not found' }, 404)
    return c.json(thumbnail)
  })
  api.post('/images/:id/thumbnail', async (c) => {
    const id = c.req.param('id')
    if (!isValidImageId(id)) return c.json({ error: 'Invalid image id' }, 400)
    if (!storage.getImage(id)) return c.json({ error: 'Not found' }, 404)

    const contentLength = Number(c.req.header('content-length') || 0)
    if (contentLength > MAX_THUMBNAIL_REQUEST_CHARS) return c.json({ error: 'Thumbnail payload is too large' }, 413)
    const body = await c.req.text()
    if (body.length > MAX_THUMBNAIL_REQUEST_CHARS) return c.json({ error: 'Thumbnail payload is too large' }, 413)

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const thumbnail = validateThumbnailPayload(payload)
    if (!thumbnail.ok) return c.json({ error: thumbnail.error }, 400)

    storage.putImageThumbnail({ ...thumbnail.value, id })
    return c.json({ ok: true, id })
  })
  api.delete('/images/:id/thumbnail', (c) => {
    storage.deleteImageThumbnail(c.req.param('id'))
    return c.json({ ok: true })
  })
  api.get('/images/:id', (c) => {
    const image = storage.getImage(c.req.param('id'))
    if (!image) return c.json({ error: 'Not found' }, 404)
    return c.json(image)
  })
  api.post('/images', async (c) => {
    const image = await c.req.json()
    const existing = storage.getImage(image.id)
    if (!existing) {
      storage.putImage(image)
    }
    return c.json({ ok: true, id: image.id })
  })
  api.delete('/images/:id', (c) => {
    storage.deleteImage(c.req.param('id'))
    return c.json({ ok: true })
  })
  api.delete('/images', (c) => {
    storage.clearImages()
    return c.json({ ok: true })
  })

  api.get('/canvas-images', (c) => c.json(storage.getAllCanvasImages()))
  api.post('/canvas-images', async (c) => {
    const item = await c.req.json()
    storage.putCanvasImage(item)
    return c.json({ ok: true })
  })
  api.delete('/canvas-images/:id', (c) => {
    storage.deleteCanvasImage(c.req.param('id'))
    return c.json({ ok: true })
  })
  api.delete('/canvas-images', (c) => {
    storage.clearCanvasImages()
    return c.json({ ok: true })
  })

  api.get('/agent-conversations', (c) => c.json(storage.getAllAgentConversations()))
  api.put('/agent-conversations', async (c) => {
    const conversations = await c.req.json()
    if (!Array.isArray(conversations)) return c.json({ error: 'Invalid agent conversations payload' }, 400)
    storage.replaceAgentConversations(conversations)
    return c.json({ ok: true })
  })
  api.delete('/agent-conversations', (c) => {
    storage.clearAgentConversations()
    return c.json({ ok: true })
  })

  return api
}

function isValidImageId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_IMAGE_ID_LENGTH && /^[A-Za-z0-9._:-]+$/.test(id)
}

type ValidThumbnail = {
  thumbnailDataUrl: string
  width: number
  height: number
  thumbnailVersion: number
}

function validateThumbnailPayload(payload: unknown): { ok: true; value: ValidThumbnail } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid thumbnail payload' }
  const value = payload as Record<string, unknown>
  const thumbnailDataUrl = value.thumbnailDataUrl
  if (typeof thumbnailDataUrl !== 'string') return { ok: false, error: 'Invalid thumbnail data URL' }
  if (thumbnailDataUrl.length > MAX_THUMBNAIL_DATA_URL_CHARS) return { ok: false, error: 'Thumbnail is too large' }
  if (!SAFE_THUMBNAIL_DATA_URL.test(thumbnailDataUrl)) return { ok: false, error: 'Unsupported thumbnail format' }
  const thumbnailBytes = getBase64DecodedByteLength(thumbnailDataUrl.slice(thumbnailDataUrl.indexOf(',') + 1))
  if (thumbnailBytes > MAX_THUMBNAIL_BYTES) return { ok: false, error: 'Thumbnail is too large' }

  const width = validatePositiveInteger(value.width, 'width')
  if (!width.ok) return width
  const height = validatePositiveInteger(value.height, 'height')
  if (!height.ok) return height
  const thumbnailVersion = validatePositiveInteger(value.thumbnailVersion, 'thumbnailVersion', MAX_THUMBNAIL_VERSION)
  if (!thumbnailVersion.ok) return thumbnailVersion

  return {
    ok: true,
    value: {
      thumbnailDataUrl,
      width: width.value,
      height: height.value,
      thumbnailVersion: thumbnailVersion.value,
    },
  }
}

function validatePositiveInteger(
  value: unknown,
  field: string,
  max = MAX_THUMBNAIL_DIMENSION,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
    return { ok: false, error: `Invalid thumbnail ${field}` }
  }
  return { ok: true, value }
}

function getBase64DecodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}
