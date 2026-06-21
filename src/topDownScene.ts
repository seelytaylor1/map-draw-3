import { FLOOR, LAVA, DARKNESS, WALL, WATER, GRASS, ROAD, SAND, MUD, STONE, MOSSY_STONE, RUBBLE } from './constants'
import { getTile } from './grid'

export type TileShape =
  | { kind: 'floor'; col: number; row: number }
  | { kind: 'water'; col: number; row: number }
  | { kind: 'lava'; col: number; row: number }
  | { kind: 'darkness'; col: number; row: number }
  | { kind: 'environmental'; col: number; row: number; tileState: number }
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
          if (r + 1 >= rows || southNeighbor === WALL || southNeighbor === WATER || southNeighbor === LAVA || southNeighbor === DARKNESS) {
            out.push({ kind: 'face', col: c, row: r, side: 'south' })
          }
          if (c + 1 >= cols || eastNeighbor === WALL || eastNeighbor === WATER || eastNeighbor === LAVA || eastNeighbor === DARKNESS) {
            out.push({ kind: 'face', col: c, row: r, side: 'east' })
          }
        }
      } else if (state === WATER) {
        out.push({ kind: 'water', col: c, row: r })
      } else if (state === LAVA) {
        out.push({ kind: 'lava', col: c, row: r })
      } else if (state === DARKNESS) {
        out.push({ kind: 'darkness', col: c, row: r })
      } else if (state === GRASS || state === ROAD || state === SAND || state === MUD || state === STONE || state === MOSSY_STONE || state === RUBBLE) {
        out.push({ kind: 'environmental', col: c, row: r, tileState: state })
      }
    }
  }

  return out
}
