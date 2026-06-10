import { FACE_PX, FLOOR, FLOOR_COLOR, ISO_EAST_FACE_COLOR, ISO_FRONT_FACE_COLOR, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT } from './constants'
import { getTile } from './grid'
import { isoEastFacePoints, isoFloorPoints, isoFrontFacePoints, isoProject, isoWaterPoints } from './iso'
import { isoStepSideFaces, isoStepTreads, stepTreadCenters, type StepRun } from './steps'

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

function offsetY(points: number[], yOff: number): number[] {
  if (yOff === 0) return points
  return points.map((v, i) => (i % 2 === 1 ? v + yOff : v))
}

export function buildIsoScene(p: IsoSceneParams): IsoShape[] {
  const out: IsoShape[] = []

  if (p.wallOpacity > 0) {
    const tl = isoProject(0, 0, p.tileW, p.tileH)
    const tr = isoProject(p.cols, 0, p.tileW, p.tileH)
    const br = isoProject(p.cols, p.rows, p.tileW, p.tileH)
    const bl = isoProject(0, p.rows, p.tileW, p.tileH)
    out.push({
      points: [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y],
      fill: p.wallColor,
      opacity: p.wallOpacity,
    })
  }

  const zSet = new Set(p.grids.keys())
  for (const run of p.steps) zSet.add(run.z)
  const zs = [...zSet].sort((a, b) => a - b)
  for (const z of zs) {
    const grid = p.grids.get(z)
    const yOff = -z * Z_STEP_HEIGHT
    const items: Renderable[] = []
    if (grid) for (let r = 0; r < p.rows; r++) {
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
    for (const run of p.steps) {
      if (run.z !== z) continue
      const treads = isoStepTreads(run, p.tileW, p.tileH)
      const sideFaces = p.show3D ? isoStepSideFaces(run, p.tileW, p.tileH, FACE_PX) : null
      const centers = stepTreadCenters(run)
      const selected = run.id === p.selectedStepId
      treads.forEach((tread, i) => {
        const shapes: IsoShape[] = []
        if (sideFaces) {
          shapes.push({
            points: sideFaces[i].points,
            fill: sideFaces[i].side === 'south' ? ISO_FRONT_FACE_COLOR : ISO_EAST_FACE_COLOR,
            stepId: run.id,
          })
        }
        shapes.push({ points: tread.front, fill: ISO_FRONT_FACE_COLOR, stepId: run.id })
        shapes.push({
          points: tread.top,
          fill: FLOOR_COLOR,
          stroke: selected ? '#ffff00' : 'rgba(0,0,0,0.25)',
          strokeWidth: selected ? 1.5 : 0.5,
          stepId: run.id,
        })
        items.push({ depth: centers[i].col + centers[i].row, shapes })
      })
    }

    items.sort((a, b) => a.depth - b.depth)
    for (const item of items) {
      for (const shape of item.shapes) {
        out.push({ ...shape, points: offsetY(shape.points, yOff) })
      }
    }
  }
  return out
}
