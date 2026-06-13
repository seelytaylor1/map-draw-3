import { WALL, type TileState } from './constants'

export function createGrid(cols: number, rows: number): Uint8Array {
  return new Uint8Array(cols * rows) // all zeros = all Wall
}

export function paintTiles(
  grid: Uint8Array,
  cols: number,
  positions: { col: number; row: number }[],
  state: TileState,
): Uint8Array {
  const next = grid.slice()
  const rows = grid.length / cols
  for (const { col, row } of positions) {
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue
    next[row * cols + col] = state
  }
  return next
}

export function resizeGrid(
  grid: Uint8Array,
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
): Uint8Array {
  const next = new Uint8Array(newCols * newRows) // fills with Wall
  const copyRows = Math.min(oldRows, newRows)
  const copyCols = Math.min(oldCols, newCols)
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      next[r * newCols + c] = grid[r * oldCols + c]
    }
  }
  return next
}

export function rectTiles(
  c1: number, r1: number, c2: number, r2: number,
): { col: number; row: number }[] {
  const minC = Math.min(c1, c2)
  const maxC = Math.max(c1, c2)
  const minR = Math.min(r1, r2)
  const maxR = Math.max(r1, r2)
  const tiles: { col: number; row: number }[] = []
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      tiles.push({ col: c, row: r })
    }
  }
  return tiles
}

export function squareBrushTiles(col: number, row: number, size: number): { col: number; row: number }[] {
  const half = Math.floor(size / 2)
  const tiles: { col: number; row: number }[] = []
  for (let dr = 0; dr < size; dr++) {
    for (let dc = 0; dc < size; dc++) {
      tiles.push({ col: col - half + dc, row: row - half + dr })
    }
  }
  return tiles
}

export function circleBrushTiles(col: number, row: number, radius: number): { col: number; row: number }[] {
  const tiles: { col: number; row: number }[] = []
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (Math.sqrt(dc * dc + dr * dr) <= radius) {
        tiles.push({ col: col + dc, row: row + dr })
      }
    }
  }
  return tiles
}

export function getTile(grid: Uint8Array, cols: number, col: number, row: number): TileState {
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= grid.length) return WALL
  return grid[row * cols + col] as TileState
}

export function getGrid(
  grids: Map<number, Uint8Array>,
  z: number,
  cols: number,
  rows: number,
): Uint8Array {
  return grids.get(z) ?? createGrid(cols, rows)
}

export function setGrid(
  grids: Map<number, Uint8Array>,
  z: number,
  grid: Uint8Array,
): Map<number, Uint8Array> {
  const next = new Map(grids)
  next.set(z, grid)
  return next
}

export function getPatternAtTile(patterns: Uint8Array, cols: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= cols) return 0
  if (row * cols + col >= patterns.length) return 0
  return patterns[row * cols + col]
}

export function setPatternAtTile(patterns: Uint8Array, cols: number, col: number, row: number, pattern: number): Uint8Array {
  const copy = new Uint8Array(patterns)
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= copy.length) return copy
  copy[row * cols + col] = pattern
  return copy
}

export function paintPatterns(patterns: Uint8Array, cols: number, tiles: { col: number; row: number }[], pattern: number): Uint8Array {
  let result = patterns
  for (const tile of tiles) {
    result = setPatternAtTile(result, cols, tile.col, tile.row, pattern)
  }
  return result
}

export function getPatternGrid(patterns: Map<number, Uint8Array>, z: number, cols: number, rows: number): Uint8Array {
  return patterns.get(z) ?? new Uint8Array(cols * rows).fill(0)
}

export function setPatternGrid(patterns: Map<number, Uint8Array>, z: number, grid: Uint8Array): Map<number, Uint8Array> {
  const copy = new Map(patterns)
  copy.set(z, grid)
  return copy
}
