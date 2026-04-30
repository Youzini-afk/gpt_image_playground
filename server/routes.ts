import { Hono } from 'hono'
import type { FileStorage } from './storage'

export function createApiRoutes(storage: FileStorage, token: string): Hono {
  const api = new Hono()

  api.use('*', async (c, next) => {
    if (!token) return next()
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${token}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

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
    const images = storage.getAllImages()
    if (full) return c.json(images)
    return c.json(images.map(({ dataUrl, ...meta }: any) => meta))
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

  return api
}