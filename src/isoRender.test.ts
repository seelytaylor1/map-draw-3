import { describe, expect, it } from 'vitest'
import { getIsoShapeBounds, groupIsoShapes } from './isoRender'
import type { IsoShape } from './isoScene'

const floor = (x: number): IsoShape => ({
  points: [x, 0, x + 1, 0, x + 1, 1, x, 1],
  fill: '#fff',
})

describe('groupIsoShapes', () => {
  it('batches ordinary iso polygons while preserving structure boundaries', () => {
    const shapes: IsoShape[] = [
      floor(0),
      floor(2),
      { ...floor(4), stepId: 'stairs' },
      { ...floor(5), stepId: 'stairs' },
      floor(6),
    ]

    expect(groupIsoShapes(shapes)).toEqual([
      { kind: 'batch', shapes: [shapes[0], shapes[1]] },
      { kind: 'shape', shape: shapes[2] },
      { kind: 'shape', shape: shapes[3] },
      { kind: 'batch', shapes: [shapes[4]] },
    ])
  })

  it('keeps opacity-bearing polygons separate so per-shape opacity is preserved', () => {
    const shapes = [floor(0), { ...floor(2), opacity: 0.5 }, floor(4)]

    expect(groupIsoShapes(shapes)).toEqual([
      { kind: 'batch', shapes: [shapes[0]] },
      { kind: 'shape', shape: shapes[1] },
      { kind: 'batch', shapes: [shapes[2]] },
    ])
  })

  it('calculates cache bounds across all polygons in a batch', () => {
    expect(getIsoShapeBounds([floor(-4), floor(8)])).toEqual({ x: -4, y: 0, width: 13, height: 1 })
    expect(getIsoShapeBounds([])).toBeNull()
  })
})
