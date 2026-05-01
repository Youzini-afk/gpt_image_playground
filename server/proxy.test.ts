import { describe, expect, it } from 'vitest'
import { API_PROXY_TARGET_HEADER, buildProxyTargetUrl, normalizeProxyBaseUrl } from './proxy'

describe('API proxy target selection', () => {
  it('normalizes valid proxy base URLs', () => {
    expect(normalizeProxyBaseUrl(' https://api.example.com/v1/ ')).toBe('https://api.example.com/v1')
  })

  it('rejects unsupported proxy base URL protocols', () => {
    expect(normalizeProxyBaseUrl('file:///etc/passwd')).toBeNull()
  })

  it('uses the client-provided API URL before the deployment fallback', () => {
    expect(buildProxyTargetUrl({
      defaultBaseUrl: 'https://api.openai.com/v1',
      requestPath: '/images/edits',
      clientBaseUrl: 'https://youzicoex.zeabur.app/v1',
    })).toBe('https://youzicoex.zeabur.app/v1/images/edits')
  })

  it('falls back to the deployment API URL when no client URL is provided', () => {
    expect(buildProxyTargetUrl({
      defaultBaseUrl: 'https://api.openai.com/v1',
      requestPath: '/responses',
    })).toBe('https://api.openai.com/v1/responses')
  })

  it('keeps v1 in the request path when the base URL does not include it', () => {
    expect(buildProxyTargetUrl({
      defaultBaseUrl: 'https://api.openai.com/v1',
      requestPath: '/v1/images/generations',
      clientBaseUrl: 'https://api.example.com',
    })).toBe('https://api.example.com/v1/images/generations')
  })

  it('exports the request header used by the browser client', () => {
    expect(API_PROXY_TARGET_HEADER).toBe('x-gip-api-base-url')
  })
})
