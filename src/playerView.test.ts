import { describe, expect, it } from 'vitest'
import { FLOOR, WALL } from './constants'
import { createGrid } from './grid'
import { buildPlayerViewExport } from './playerView'
import type { Stamp } from './stamps'

describe('player-view export layers', () => {
  it('conceals secret doors, removes hidden markers, and regularizes locked doors', () => {
    const grid = createGrid(4, 2)
    grid[1] = FLOOR
    const stamps: Stamp[] = [
      { id: 'secret', type: 'DoorSecret1x1', col: 1, row: 0, rotation: 0, z: 0 },
      { id: 'trap', type: 'Trap1x1', col: 2, row: 0, rotation: 0, z: 0 },
      { id: 'chest', type: 'Chest1x1', col: 3, row: 0, rotation: 0, z: 0 },
      { id: 'locked', type: 'DoorLocked1x1', col: 0, row: 1, rotation: 0, z: 0 },
    ]

    const result = buildPlayerViewExport(grid, 4, 2, 0, stamps)

    expect(result.grid[1]).toBe(WALL)
    expect(result.stamps.map(stamp => stamp.id)).toEqual(['locked'])
    expect(result.stamps[0]).toMatchObject({ type: 'Door1x1' })
  })
})
