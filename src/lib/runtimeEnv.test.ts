import { describe, expect, it } from 'vitest'
import { readRuntimeEnv } from './runtimeEnv'

describe('readRuntimeEnv', () => {
  it('treats unresolved Docker placeholder values as empty runtime config', () => {
    expect(readRuntimeEnv('__VITE_DEFAULT_API_URL_PLACEHOLDER__')).toBe('')
    expect(readRuntimeEnv('__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__')).toBe('')
  })

  it('trims configured values', () => {
    expect(readRuntimeEnv('  https://api.example.com/v1  ')).toBe('https://api.example.com/v1')
  })
})
