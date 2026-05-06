import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { FileStorage } from './storage'
import { createApiRoutes } from './routes'
import {
  API_PROXY_TARGET_HEADER,
  buildProxyTargetUrl,
  createProxyRequestHeaders,
  createProxyResponseHeaders,
} from './proxy'

const port = parseInt(process.env.PORT || '80', 10)
const host = process.env.HOST || '0.0.0.0'
const dataDir = process.env.DATA_DIR || './data'
const storageToken = process.env.STORAGE_TOKEN || ''
const accessPassword = process.env.ACCESS_PASSWORD || ''
const apiUrl = (process.env.API_PROXY_URL || process.env.API_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const enableApiProxy = process.env.API_PROXY === 'true' || process.env.ENABLE_API_PROXY === 'true'

const storage = new FileStorage(dataDir)

const app = new Hono()

if (accessPassword) {
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname

    if (path.startsWith('/api/auth/') || path.startsWith('/api/auth')) {
      return next()
    }

    const token = getCookie(c, 'auth_token')
    if (token === accessPassword) {
      return next()
    }

    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${storageToken}` && storageToken) {
      return next()
    }

    if (path.startsWith('/api/')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    if (c.req.method === 'GET' && (path.endsWith('.html') || path === '/' || !path.includes('.'))) {
      return c.html(authPage)
    }

    if (path.startsWith('/assets/') || path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.svg') || path.endsWith('.ico') || path.endsWith('.png') || path.endsWith('.webmanifest') || path.endsWith('.woff2') || path.endsWith('.woff')) {
      return next()
    }

    return c.json({ error: 'Unauthorized' }, 401)
  })

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    if (body.password === accessPassword) {
      setCookie(c, 'auth_token', accessPassword, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 60 * 60 * 24 * 30,
      })
      return c.json({ ok: true })
    }
    return c.json({ error: 'Invalid password' }, 401)
  })

  app.post('/api/auth/logout', (c) => {
    setCookie(c, 'auth_token', '', {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 0,
    })
    return c.json({ ok: true })
  })

  app.get('/api/auth/check', (c) => {
    const token = getCookie(c, 'auth_token')
    return c.json({ authenticated: token === accessPassword })
  })
}

app.use('/api/storage/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

app.use('/api/storage/*', async (c, next) => {
  c.header('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
  await next()
})

app.route('/api/storage', createApiRoutes(storage))

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
    const targetUrl = buildProxyTargetUrl({
      defaultBaseUrl: apiUrl,
      requestPath: path,
      clientBaseUrl: c.req.header(API_PROXY_TARGET_HEADER),
    })
    if (!targetUrl) {
      return c.json({ error: 'Invalid API proxy target URL' }, 400)
    }
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: createProxyResponseHeaders({}) })
    }

    const headers = createProxyRequestHeaders(c.req.raw.headers)
    const init: RequestInit & { duplex?: 'half' } = { method: c.req.method, headers }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      init.body = c.req.raw.body
      init.duplex = 'half'
    }
    try {
      const response = await fetch(targetUrl, { ...init, redirect: 'follow' })
      const responseHeaders = createProxyResponseHeaders(response.headers)
      return new Response(await response.arrayBuffer(), { status: response.status, headers: responseHeaders })
    } catch (err: any) {
      return c.json({ error: err.message || 'Proxy error' }, 502)
    }
  })
}

app.use('/*', serveStatic({ root: './dist' }))

app.get('*', serveStatic({ root: './dist', path: 'index.html' }))

const authPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GPT Image Playground</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.card{width:100%;max-width:360px;padding:32px;border-radius:20px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid rgba(255,255,255,.5)}
h1{font-size:18px;font-weight:600;color:#111827;margin-bottom:8px;text-align:center}
.desc{font-size:13px;color:#6b7280;margin-bottom:20px;text-align:center}
.form-group{margin-bottom:16px}
input{width:100%;padding:10px 14px;border-radius:12px;border:1px solid #e5e7eb;font-size:14px;outline:none;transition:border-color .2s}
input:focus{border-color:#3b82f6}
.error{color:#ef4444;font-size:12px;margin-top:6px;min-height:18px}
button{width:100%;padding:10px;border:none;border-radius:12px;background:#3b82f6;color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:background .2s}
button:hover{background:#2563eb}
button:disabled{opacity:.5;cursor:not-allowed}
</style>
</head>
<body>
<div class="card">
<h1>GPT Image Playground</h1>
<p class="desc">请输入访问密码</p>
<div class="form-group">
<input type="password" id="pw" placeholder="访问密码" autofocus>
<div class="error" id="err"></div>
</div>
<button id="btn" onclick="login()">登录</button>
</div>
<script>
const pw=document.getElementById('pw'),err=document.getElementById('err'),btn=document.getElementById('btn');
pw.addEventListener('keydown',e=>{if(e.key==='Enter')login()});
async function login(){const p=pw.value;if(!p){err.textContent='请输入密码';return}
btn.disabled=true;err.textContent='';
try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});
const d=await r.json();if(d.ok){window.location.reload()}else{err.textContent=d.error||'密码错误';pw.value='';pw.focus()}}catch(e){err.textContent='网络错误'}
btn.disabled=false}
</script>
</body>
</html>`

console.log(`Starting server on ${host}:${port}`)
console.log(`  Data directory: ${dataDir}`)
console.log(`  Access password: ${accessPassword ? 'enabled' : 'disabled'}`)
console.log(`  Storage auth: ${storageToken ? 'enabled' : 'disabled'}`)
console.log(`  API proxy: ${enableApiProxy ? `enabled (${apiUrl})` : 'disabled'}`)

serve({ fetch: app.fetch, port, hostname: host })
