import { FLOOR, FLOOR_COLOR, Z_STEP_HEIGHT } from './constants'
import { getTile } from './grid'
import { isoFloorPoints } from './iso'
import { type StepRun } from './steps'

export interface IsoSceneParams {
  grids: Map<number, Uint8Array>
  steps: StepRun[]
  cols: number
  rows: number
  show3D: boolean
  wallColor: string
  wallOpacity: number
  selectedStepId?: string | null
  tileW: number
  tileH: number
}

export interface IsoShape {
  points: number[]
  fill?: string
  opacity?: number
  stroke?: string
  strokeWidth?: number
  stepId?: string
}

// A renderable is one solid drawn as a unit: a tile (top + its faces) or a
// single step tread. Painter depth is the col+row diagonal of its center —
// greater diagonal = nearer the viewer = drawn later.
interface Renderable {
  depth: number
  shapes: IsoShape[]
}

export function buildIsoScene(p: IsoSceneParams): IsoShape[] {
  void Z_STEP_HEIGHT
  const out: IsoShape[] = []
  const zs = [...p.grids.keys()].sort((a, b) => a - b)
  for (const z of zs) {
    const grid = p.grids.get(z)!
    const items: Renderable[] = []
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        if (getTile(grid, p.cols, c, r) === FLOOR) {
          items.push({
            depth: c + r + 1,
            shapes: [{ points: isoFloorPoints(c, r, p.tileW, p.tileH), fill: FLOOR_COLOR }],
          })
        }
      }
    }
    items.sort((a, b) => a.depth - b.depth)
    for (const item of items) out.push(...item.shapes)
  }
  return out
}
