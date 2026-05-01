import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '..')

describe('Docker API proxy configuration', () => {
  it('server proxy prefers API_PROXY_URL over the legacy API_URL', () => {
    const serverIndex = readFileSync(resolve(rootDir, 'server/index.ts'), 'utf-8')
    const apiProxyUrlIndex = serverIndex.indexOf('process.env.API_PROXY_URL')
    const legacyApiUrlIndex = serverIndex.indexOf('process.env.API_URL')

    expect(apiProxyUrlIndex).toBeGreaterThanOrEqual(0)
    expect(legacyApiUrlIndex).toBeGreaterThanOrEqual(0)
    expect(apiProxyUrlIndex).toBeLessThan(legacyApiUrlIndex)
  })

  it('root Docker image injects runtime API settings before starting the server', () => {
    const dockerfile = readFileSync(resolve(rootDir, 'Dockerfile'), 'utf-8')

    expect(dockerfile).toContain('deploy/inject-api-url.sh')
    expect(dockerfile).toContain('deploy/migrate-api-env.envsh')
    expect(dockerfile).toContain('40-inject-api-url.sh node dist-server/index.js')
  })
})
