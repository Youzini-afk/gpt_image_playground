import { describe, expect, it } from 'vitest'
import { rectsIntersect, selectionBoxRect, deriveSelection } from './selectionGeometry'

describe('rectsIntersect', () => {
  it('returns true for overlapping rectangles', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 }
    const b = { left: 5, top: 5, right: 15, bottom: 15 }
    expect(rectsIntersect(a, b)).toBe(true)
    expect(rectsIntersect(b, a)).toBe(true)
  })

  it('returns false for non-overlapping rectangles', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 }
    const b = { left: 11, top: 11, right: 20, bottom: 20 }
    expect(rectsIntersect(a, b)).toBe(false)
  })

  it('returns false for edge-adjacent rectangles (no interior overlap)', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 }
    const b = { left: 10, top: 0, right: 20, bottom: 10 }
    expect(rectsIntersect(a, b)).toBe(false)
  })

  it('returns true for contained rectangles', () => {
    const outer = { left: 0, top: 0, right: 20, bottom: 20 }
    const inner = { left: 5, top: 5, right: 15, bottom: 15 }
    expect(rectsIntersect(outer, inner)).toBe(true)
  })
})

describe('selectionBoxRect', () => {
  it('computes rect from top-left to bottom-right drag', () => {
    expect(selectionBoxRect(0, 0, 10, 10)).toEqual({ left: 0, top: 0, right: 10, bottom: 10 })
  })

  it('computes rect from bottom-right to top-left drag', () => {
    expect(selectionBoxRect(10, 10, 0, 0)).toEqual({ left: 0, top: 0, right: 10, bottom: 10 })
  })

  it('computes rect for mixed-direction drag', () => {
    expect(selectionBoxRect(5, 10, 15, 2)).toEqual({ left: 5, top: 2, right: 15, bottom: 10 })
  })
})

describe('deriveSelection', () => {
  const geometries = [
    { taskId: 'a', rect: { left: 0, top: 0, right: 10, bottom: 10 } },
    { taskId: 'b', rect: { left: 20, top: 20, right: 30, bottom: 30 } },
    { taskId: 'c', rect: { left: 40, top: 40, right: 50, bottom: 50 } },
  ]

  it('adds intersecting cards not in initial selection', () => {
    const result = deriveSelection(geometries, { left: 5, top: 5, right: 15, bottom: 15 }, [])
    expect(result).toContain('a')
    expect(result).not.toContain('b')
    expect(result).not.toContain('c')
  })

  it('removes intersecting cards that were in initial selection (toggle)', () => {
    const result = deriveSelection(geometries, { left: 5, top: 5, right: 15, bottom: 15 }, ['a'])
    expect(result).not.toContain('a')
  })

  it('restores non-intersecting cards to their initial state', () => {
    const result = deriveSelection(geometries, { left: 5, top: 5, right: 15, bottom: 15 }, ['b'])
    expect(result).toContain('a')
    expect(result).toContain('b')
    expect(result).not.toContain('c')
  })

  it('toggles multiple intersecting cards', () => {
    const result = deriveSelection(
      geometries,
      { left: 5, top: 5, right: 35, bottom: 35 },
      ['a'],
    )
    expect(result).not.toContain('a')
    expect(result).toContain('b')
    expect(result).not.toContain('c')
  })

  it('returns initial selection when no intersection', () => {
    const result = deriveSelection(
      geometries,
      { left: 100, top: 100, right: 110, bottom: 110 },
      ['a', 'b'],
    )
    expect(result).toEqual(['a', 'b'])
  })

  it('handles empty geometries gracefully', () => {
    expect(deriveSelection([], { left: 0, top: 0, right: 10, bottom: 10 }, [])).toEqual([])
  })
})
