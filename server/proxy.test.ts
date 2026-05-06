import { describe, expect, it } from 'vitest'
import {
  API_PROXY_TARGET_HEADER,
  buildProxyTargetUrl,
  createProxyRequestHeaders,
  createProxyResponseHeaders,
  normalizeProxyBaseUrl,
} from './proxy'

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

  it('removes browser and hop-by-hop headers before forwarding proxy requests', () => {
    const headers = createProxyRequestHeaders(new Headers({
      authorization: 'Bearer test-key',
      'content-type': 'multipart/form-data; boundary=x',
      host: 'app.example.com',
      connection: 'keep-alive',
      'content-length': '123',
      'accept-encoding': 'gzip, br',
      origin: 'https://app.example.com',
      referer: 'https://app.example.com/',
      'sec-fetch-mode': 'cors',
      [API_PROXY_TARGET_HEADER]: 'https://api.example.com/v1',
      'access-control-allow-origin': '*',
    }))

    expect(headers.get('authorization')).toBe('Bearer test-key')
    expect(headers.get('content-type')).toBe('multipart/form-data; boundary=x')
    expect(headers.has('host')).toBe(false)
    expect(headers.has('connection')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
    expect(headers.has('accept-encoding')).toBe(false)
    expect(headers.has('origin')).toBe(false)
    expect(headers.has('referer')).toBe(false)
    expect(headers.has('sec-fetch-mode')).toBe(false)
    expect(headers.has(API_PROXY_TARGET_HEADER)).toBe(false)
    expect(headers.has('access-control-allow-origin')).toBe(false)
  })

  it('removes transport-specific upstream headers before returning proxy responses', () => {
    const headers = createProxyResponseHeaders(new Headers({
      'content-type': 'application/json',
      'content-length': '123',
      'content-encoding': 'br',
      'transfer-encoding': 'chunked',
      connection: 'keep-alive',
    }))

    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('access-control-allow-origin')).toBe('*')
    expect(headers.has('content-length')).toBe(false)
    expect(headers.has('content-encoding')).toBe(false)
    expect(headers.has('transfer-encoding')).toBe(false)
    expect(headers.has('connection')).toBe(false)
  })
})
