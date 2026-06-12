import { FLOOR, WALL, WATER } from './constants'
import { getTile } from './grid'

export type TileShape =
  | { kind: 'floor'; col: number; row: number }
  | { kind: 'water'; col: number; row: number }
  | { kind: 'face'; col: number; row: number; side: 'south' | 'east' }

export function buildTopDownShapes(
  grid: Uint8Array,
  cols: number,
  rows: number,
  show3D: boolean,
): TileShape[] {
  const out: TileShape[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const state = getTile(grid, cols, c, r)
      if (state === FLOOR) {
        out.push({ kind: 'floor', col: c, row: r })
        if (show3D) {
          const southNeighbor = r + 1 < rows ? getTile(grid, cols, c, r + 1) : null
          const eastNeighbor  = c + 1 < cols ? getTile(grid, cols, c + 1, r) : null
          if (r + 1 >= rows || southNeighbor === WALL) {
            out.push({ kind: 'face', col: c, row: r, side: 'south' })
          }
          if (c + 1 >= cols || eastNeighbor === WALL) {
            out.push({ kind: 'face', col: c, row: r, side: 'east' })
          }
        }
      } else if (state === WATER) {
        out.push({ kind: 'water', col: c, row: r })
      }
    }
  }

  return out
}
