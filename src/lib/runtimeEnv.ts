export function readRuntimeEnv(value: string | undefined): string {
  const trimmed = String.prototype.trim.call(value ?? '')
  return /^__[A-Z0-9_]+_PLACEHOLDER__$/.test(trimmed) ? '' : trimmed
}
