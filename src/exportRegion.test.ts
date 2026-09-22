import { describe, expect, it } from 'vitest'
import { exportDimensions, normalizeExportRegion, wholeMapRegion } from './exportRegion'

describe('export region', () => {
  it('defaults to the whole map and clamps a resized crop to map bounds', () => {
    expect(wholeMapRegion(10, 8)).toEqual({ col: 0, row: 0, cols: 10, rows: 8 })
    expect(normalizeExportRegion({ col: -2, row: 6, cols: 20, rows: 4 }, 10, 8)).toEqual({ col: 0, row: 6, cols: 10, rows: 2 })
  })

  it('reports dimensions from crop size and selected pixels per cell', () => {
    expect(exportDimensions({ col: 2, row: 1, cols: 4, rows: 3 }, 150)).toEqual({ width: 600, height: 450 })
  })
})
