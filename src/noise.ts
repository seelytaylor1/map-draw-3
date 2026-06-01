import { WALL, type TileState } from './constants'

export type Rect = { minC: number; minR: number; maxC: number; maxR: number }
export type TileFlip = { col: number; row: number; state: TileState }

const MAX_DEPTH = 3

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function tileDepth(rect: Rect, col: number, row: number): number {
  return Math.min(col - rect.minC, rect.maxC - col, row - rect.minR, rect.maxR - row)
}

export function applyTileLevelNoise(rect: Rect, intensity: number, seed: number): TileFlip[] {
  if (intensity <= 0) return []

  const maxDepth = Math.floor(intensity * MAX_DEPTH)
  const rand = mulberry32(seed)
  const flips: TileFlip[] = []

  for (let r = rect.minR; r <= rect.maxR; r++) {
    for (let c = rect.minC; c <= rect.maxC; c++) {
      const depth = tileDepth(rect, c, r)
      if (depth > maxDepth) continue
      const flipProb = intensity * (1 - depth / (maxDepth + 1))
      if (rand() < flipProb) {
        flips.push({ col: c, row: r, state: WALL })
      }
    }
  }

  return flips
}
