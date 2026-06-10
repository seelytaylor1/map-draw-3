import { FACE_PX, FLOOR, FLOOR_COLOR, ISO_EAST_FACE_COLOR, ISO_FRONT_FACE_COLOR, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT } from './constants'
import { getTile } from './grid'
import { isoEastFacePoints, isoFloorPoints, isoFrontFacePoints, isoWaterPoints } from './iso'
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
        const state = getTile(grid, p.cols, c, r)
        if (state === FLOOR) {
          const shapes: IsoShape[] = [{
            points: isoFloorPoints(c, r, p.tileW, p.tileH),
            fill: FLOOR_COLOR,
            stroke: 'rgba(0,0,0,0.15)',
            strokeWidth: 0.5,
          }]
          if (p.show3D) {
            const southNeighbor = r + 1 < p.rows ? getTile(grid, p.cols, c, r + 1) : null
            const eastNeighbor = c + 1 < p.cols ? getTile(grid, p.cols, c + 1, r) : null
            const southExposed = r + 1 >= p.rows || southNeighbor === WALL || southNeighbor === WATER
            const eastExposed = c + 1 >= p.cols || eastNeighbor === WALL || eastNeighbor === WATER
            if (southExposed) {
              shapes.push({ points: isoFrontFacePoints(c, r, p.tileW, p.tileH, FACE_PX), fill: ISO_FRONT_FACE_COLOR })
            }
            if (eastExposed) {
              shapes.push({ points: isoEastFacePoints(c, r, p.tileW, p.tileH, FACE_PX), fill: ISO_EAST_FACE_COLOR })
            }
          }
          items.push({ depth: c + r + 1, shapes })
        } else if (state === WATER) {
          items.push({
            depth: c + r + 1,
            shapes: [{ points: isoWaterPoints(c, r, p.tileW, p.tileH), fill: WATER_COLOR }],
          })
        }
      }
    }
    items.sort((a, b) => a.depth - b.depth)
    for (const item of items) out.push(...item.shapes)
  }
  return out
}
