import { describe, expect, it } from 'vitest'
import { createGrid, paintTiles, resizeGrid, getTile, squareBrushTiles, rectTiles, circleBrushTiles } from './grid'
import { FLOOR, WALL } from './constants'

describe('createGrid', () => {
  it('creates all-Wall grid', () => {
    const g = createGrid(3, 2)
    expect(g.every(v => v === WALL)).toBe(true)
    expect(g.length).toBe(6)
  })
})

describe('paintTiles', () => {
  it('sets tiles to Floor', () => {
    const g = createGrid(5, 5)
    const next = paintTiles(g, 5, [{ col: 1, row: 2 }], FLOOR)
    expect(getTile(next, 5, 1, 2)).toBe(FLOOR)
  })

  it('sets tiles to Wall (erase)', () => {
    const g = createGrid(5, 5)
    const withFloor = paintTiles(g, 5, [{ col: 2, row: 2 }], FLOOR)
    const erased = paintTiles(withFloor, 5, [{ col: 2, row: 2 }], WALL)
    expect(getTile(erased, 5, 2, 2)).toBe(WALL)
  })

  it('ignores out-of-bounds coords', () => {
    const g = createGrid(3, 3)
    const next = paintTiles(g, 3, [{ col: -1, row: 0 }, { col: 3, row: 3 }], FLOOR)
    expect(next).toEqual(g)
  })

  it('does not mutate input grid', () => {
    const g = createGrid(3, 3)
    const copy = g.slice()
    paintTiles(g, 3, [{ col: 1, row: 1 }], FLOOR)
    expect(g).toEqual(copy)
  })

  it('paints multiple tiles at once', () => {
    const g = createGrid(5, 5)
    const tiles = [{ col: 0, row: 0 }, { col: 4, row: 4 }, { col: 2, row: 2 }]
    const next = paintTiles(g, 5, tiles, FLOOR)
    for (const t of tiles) expect(getTile(next, 5, t.col, t.row)).toBe(FLOOR)
  })
})

describe('rectTiles', () => {
  it('single tile when start equals end', () => {
    expect(rectTiles(2, 3, 2, 3)).toEqual([{ col: 2, row: 3 }])
  })

  it('2×2 rect from top-left to bottom-right', () => {
    const tiles = rectTiles(0, 0, 1, 1)
    expect(tiles).toHaveLength(4)
    expect(tiles).toContainEqual({ col: 0, row: 0 })
    expect(tiles).toContainEqual({ col: 1, row: 0 })
    expect(tiles).toContainEqual({ col: 0, row: 1 })
    expect(tiles).toContainEqual({ col: 1, row: 1 })
  })

  it('works when end is above-left of start (any drag direction)', () => {
    const tiles = rectTiles(3, 3, 1, 1)
    expect(tiles).toHaveLength(9)
    expect(tiles).toContainEqual({ col: 1, row: 1 })
    expect(tiles).toContainEqual({ col: 3, row: 3 })
  })
})

describe('squareBrushTiles', () => {
  it('size 1 returns only the center tile', () => {
    expect(squareBrushTiles(3, 4, 1)).toEqual([{ col: 3, row: 4 }])
  })

  it('size 3 returns 9 tiles centered on cursor', () => {
    const tiles = squareBrushTiles(2, 2, 3)
    expect(tiles).toHaveLength(9)
    expect(tiles).toContainEqual({ col: 1, row: 1 })
    expect(tiles).toContainEqual({ col: 2, row: 2 })
    expect(tiles).toContainEqual({ col: 3, row: 3 })
  })

  it('may include negative coords (paintTiles handles OOB)', () => {
    const tiles = squareBrushTiles(0, 0, 3)
    expect(tiles).toContainEqual({ col: -1, row: -1 })
  })
})

describe('circleBrushTiles', () => {
  it('radius 0 returns only the center tile', () => {
    expect(circleBrushTiles(3, 4, 0)).toEqual([{ col: 3, row: 4 }])
  })

  it('radius 1 returns center plus 4 cardinal neighbors (not diagonals)', () => {
    const tiles = circleBrushTiles(3, 3, 1)
    expect(tiles).toHaveLength(5)
    expect(tiles).toContainEqual({ col: 3, row: 3 })
    expect(tiles).toContainEqual({ col: 4, row: 3 })
    expect(tiles).toContainEqual({ col: 2, row: 3 })
    expect(tiles).toContainEqual({ col: 3, row: 4 })
    expect(tiles).toContainEqual({ col: 3, row: 2 })
  })

  it('radius 2 returns 13 tiles', () => {
    expect(circleBrushTiles(5, 5, 2)).toHaveLength(13)
  })

  it('may include negative coords (paintTiles handles OOB)', () => {
    const tiles = circleBrushTiles(0, 0, 2)
    expect(tiles.some(t => t.col < 0 || t.row < 0)).toBe(true)
  })
})

describe('resizeGrid', () => {
  it('crops to smaller dimensions', () => {
    const g = createGrid(5, 5)
    const filled = paintTiles(g, 5, [{ col: 4, row: 4 }], FLOOR)
    const small = resizeGrid(filled, 5, 5, 3, 3)
    expect(small.length).toBe(9)
    // tile at (4,4) cropped out
    expect(getTile(small, 3, 4, 4)).toBe(WALL)
  })

  it('expands with Wall tiles', () => {
    const g = createGrid(2, 2)
    const big = resizeGrid(g, 2, 2, 4, 4)
    expect(big.length).toBe(16)
    expect(big.every(v => v === WALL)).toBe(true)
  })

  it('preserves tiles within both bounds', () => {
    const g = createGrid(3, 3)
    const marked = paintTiles(g, 3, [{ col: 1, row: 1 }], FLOOR)
    const big = resizeGrid(marked, 3, 3, 5, 5)
    expect(getTile(big, 5, 1, 1)).toBe(FLOOR)
    // original tile (0,0) still Wall
    expect(getTile(big, 5, 0, 0)).toBe(WALL)
  })
})
