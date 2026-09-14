import { describe, expect, it } from 'vitest'
import { DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_TILES_PER_INCH, getExportTilePixels, PRINT_DPI, TILES_PER_INCH_OPTIONS } from './constants'

describe('physical square scale', () => {
  it('defaults to one-eighth-inch squares on an 11 by 8.5 inch canvas', () => {
    expect(DEFAULT_TILES_PER_INCH).toBe(8)
    expect(DEFAULT_COLS).toBe(88)
    expect(DEFAULT_ROWS).toBe(68)
  })

  it('offers half-inch, quarter-inch, and one-eighth-inch square scales', () => {
    expect(TILES_PER_INCH_OPTIONS).toEqual([2, 4, 8])
  })

  it('renders each supported square at its true 300 DPI size', () => {
    expect(getExportTilePixels(2)).toBe(PRINT_DPI / 2)
    expect(getExportTilePixels(4)).toBe(PRINT_DPI / 4)
    expect(getExportTilePixels(8)).toBe(PRINT_DPI / 8)
  })
})
