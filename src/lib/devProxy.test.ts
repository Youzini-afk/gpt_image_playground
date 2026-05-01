import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, isApiProxyForced, shouldUseApiProxy } from './devProxy'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildApiUrl', () => {
  it('uses the same-origin proxy prefix when API proxy is enabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'images/edits', null, true)).toBe(
      '/api-proxy/images/edits',
    )
  })

  it('keeps the v1 segment when the configured API URL does not include it', () => {
    expect(buildApiUrl('http://api.example.com', 'images/generations', null, true)).toBe(
      '/api-proxy/v1/images/generations',
    )
  })

  it('uses a configured proxy prefix when one is available', () => {
    expect(
      buildApiUrl(
        'http://api.example.com/v1',
        'responses',
        {
          enabled: true,
          prefix: '/openai-proxy',
          target: 'http://api.example.com/v1',
          changeOrigin: true,
          secure: false,
        },
        true,
      ),
    ).toBe('/openai-proxy/responses')
  })

  it('uses the configured API URL directly when API proxy is disabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'responses', null, false)).toBe(
      'http://api.example.com/v1/responses',
    )
  })
})

describe('API proxy selection', () => {
  it('forces the API proxy for Docker deployments when the proxy is available', () => {
    vi.stubEnv('VITE_DOCKER_DEPLOYMENT', 'true')
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')

    expect(isApiProxyForced()).toBe(true)
    expect(shouldUseApiProxy(false)).toBe(true)
  })

  it('does not force the API proxy when the current deployment has no proxy', () => {
    vi.stubEnv('VITE_DOCKER_DEPLOYMENT', 'true')
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'false')

    expect(isApiProxyForced()).toBe(false)
    expect(shouldUseApiProxy(true)).toBe(false)
  })

  it('keeps the user setting authoritative outside Docker deployments', () => {
    vi.stubEnv('VITE_DOCKER_DEPLOYMENT', 'false')
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')

    expect(isApiProxyForced()).toBe(false)
    expect(shouldUseApiProxy(false)).toBe(false)
    expect(shouldUseApiProxy(true)).toBe(true)
  })
})
