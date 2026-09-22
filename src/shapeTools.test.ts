import { describe, expect, it } from 'vitest'
import { getShapePreviewPoints, rasterizeShape, type ShapePoint } from './shapeTools'

const outline: ShapePoint[] = [
  { col: 1, row: 1 }, { col: 5, row: 1 },
  { col: 5, row: 5 }, { col: 1, row: 5 },
]

describe('freehand path', () => {
  it('leaves an open trace unfilled', () => {
    const tiles = rasterizeShape('path', outline, 8, 8)
    expect(tiles).not.toContainEqual({ col: 3, row: 3 })
    expect(tiles).toContainEqual({ col: 3, row: 1 })
  })

  it('fills a loop when its end returns near its start', () => {
    const draft = {
      tool: 'path' as const,
      start: outline[0], end: { col: 1.4, row: 1.2 },
      points: [...outline, { col: 1.4, row: 1.2 }],
    }
    const preview = getShapePreviewPoints(draft, 6, 0.5)
    expect(preview[preview.length - 1]).toEqual(outline[0])

    const tiles = rasterizeShape('path', preview, 8, 8)
    expect(tiles).toContainEqual({ col: 3, row: 3 })
    expect(tiles).toContainEqual({ col: 3, row: 1 })
  })
})
