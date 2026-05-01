export const API_PROXY_TARGET_HEADER = 'x-gip-api-base-url'

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
