import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(rootDir, 'src/components/SettingsModal.tsx'), 'utf-8')

describe('SettingsModal API proxy copy', () => {
  it('keeps the API URL editable and authoritative when the API proxy is enabled', () => {
    expect(source).not.toContain('此处设置被忽略')
    expect(source).not.toContain('disabled={apiProxyEnabled}')
    expect(source).toContain('后端会转发到此处填写的 API URL')
    expect(source).toContain('上方 API URL 仍会作为后端转发目标')
  })
})
