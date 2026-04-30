import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { FileStorage } from './storage'
import { createApiRoutes } from './routes'

const port = parseInt(process.env.PORT || '80', 10)
const host = process.env.HOST || '0.0.0.0'
const dataDir = process.env.DATA_DIR || './data'
const storageToken = process.env.STORAGE_TOKEN || ''
const apiUrl = process.env.API_URL || 'https://api.openai.com'
const enableApiProxy = process.env.ENABLE_API_PROXY === 'true'

const storage = new FileStorage(dataDir)

const app = new Hono()

app.use('/api/storage/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

app.route('/api/storage', createApiRoutes(storage, storageToken))

if (enableApiProxy) {
  const allowedPaths = /^\/(v1\/)?(images\/generations|images\/edits|responses)$/
  app.all('/api-proxy/*', async (c) => {
    const path = c.req.path.replace(/^\/api-proxy/, '')
    if (!allowedPaths.test(path)) {
      return c.json({ error: 'Forbidden: API Proxy path restricted' }, 403)
    }
    if (c.req.method !== 'POST' && c.req.method !== 'OPTIONS') {
      return c.json({ error: 'Forbidden: Only POST and OPTIONS allowed' }, 403)
    }
    const targetUrl = `${apiUrl}${path}`
    const headers = new Headers(c.req.raw.headers)
    headers.delete('host')
    headers.set('Access-Control-Allow-Origin', '*')
    const init: RequestInit = { method: c.req.method, headers }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      init.body = c.req.raw.body
    }
    try {
      const response = await fetch(targetUrl, { ...init, redirect: 'follow' })
      const responseHeaders = new Headers(response.headers)
      responseHeaders.set('Access-Control-Allow-Origin', '*')
      return new Response(response.body, { status: response.status, headers: responseHeaders })
    } catch (err: any) {
      return c.json({ error: err.message || 'Proxy error' }, 502)
    }
  })
}

app.use('/*', serveStatic({ root: './dist' }))

app.get('*', serveStatic({ root: './dist', path: 'index.html' }))

console.log(`Starting server on ${host}:${port}`)
console.log(`  Data directory: ${dataDir}`)
console.log(`  Storage auth: ${storageToken ? 'enabled' : 'disabled'}`)
console.log(`  API proxy: ${enableApiProxy ? 'enabled' : 'disabled'}`)

serve({ fetch: app.fetch, port, hostname: host })