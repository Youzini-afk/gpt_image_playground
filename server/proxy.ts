export const API_PROXY_TARGET_HEADER = 'x-gip-api-base-url'

const PROXY_REQUEST_HEADER_DENYLIST = [
  API_PROXY_TARGET_HEADER,
  'accept-encoding',
  'access-control-allow-origin',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'origin',
  'proxy-authenticate',
  'proxy-authorization',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

const PROXY_RESPONSE_HEADER_DENYLIST = [
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

function deleteHeaders(headers: Headers, names: string[]) {
  for (const name of names) headers.delete(name)
}

export function createProxyRequestHeaders(input: HeadersInit): Headers {
  const headers = new Headers(input)
  deleteHeaders(headers, PROXY_REQUEST_HEADER_DENYLIST)

  for (const name of [...headers.keys()]) {
    if (name.startsWith('sec-ch-ua')) headers.delete(name)
  }

  return headers
}

export function createProxyResponseHeaders(input: HeadersInit): Headers {
  const headers = new Headers(input)
  deleteHeaders(headers, PROXY_RESPONSE_HEADER_DENYLIST)
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

export function normalizeProxyBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function buildProxyTargetUrl(input: {
  defaultBaseUrl: string
  requestPath: string
  clientBaseUrl?: string | null
}): string | null {
  const baseUrl = normalizeProxyBaseUrl(input.clientBaseUrl || '') ?? normalizeProxyBaseUrl(input.defaultBaseUrl)
  if (!baseUrl) return null

  const proxyPath = input.requestPath.replace(/^\/+/, '')
  const targetPath = baseUrl.endsWith('/v1') && proxyPath.startsWith('v1/')
    ? proxyPath.slice('v1/'.length)
    : proxyPath
  return `${baseUrl}/${targetPath}`
}
