import { describe, expect, it } from 'vitest'
import { formatTileCoordinate } from './coordinates'

describe('formatTileCoordinate', () => {
  it('formats the zero-based grid coordinate used by the map generator', () => {
    expect(formatTileCoordinate({ col: 27, row: 15 })).toBe('27, 15')
  })
})
