export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface CardGeometry {
  taskId: string
  rect: Rect
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function selectionBoxRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): Rect {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    right: Math.max(startX, currentX),
    bottom: Math.max(startY, currentY),
  }
}

export function deriveSelection(
  geometries: CardGeometry[],
  selectionRect: Rect,
  initialSelection: string[],
): string[] {
  const initialSet = new Set(initialSelection)
  const newSelected = new Set(initialSelection)

  for (const { taskId, rect } of geometries) {
    const isIntersecting = rectsIntersect(selectionRect, rect)
    if (isIntersecting) {
      if (initialSet.has(taskId)) {
        newSelected.delete(taskId)
      } else {
        newSelected.add(taskId)
      }
    } else if (!initialSet.has(taskId)) {
      newSelected.delete(taskId)
    }
  }

  return Array.from(newSelected)
}
