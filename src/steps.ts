// src/steps.ts
import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'
import {
  type DirectionalRun, RUN_LENGTH,
  uvToGrid, runTiles, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
} from './directionalRun'

export type StepDirection = 'N' | 'E' | 'S' | 'W'

export interface StepRun extends DirectionalRun {
  direction: StepDirection
  ascending?: boolean
}

export const STEP_RUN_LENGTH = RUN_LENGTH

export function stepRunTiles(run: StepRun): { col: number; row: number }[] {
  return runTiles(run)
}

export const STEP_TREAD_COUNT = 6

export interface IsoTread {
  top: number[]   // closed quad, 4 points as flat [x, y, ...]
  front: number[] // vertical riser face at the tread's leading edge
}

// Grid-space center of each tread — painter depth anchors for render sorting.
export function stepTreadCenters(run: StepRun): { col: number; row: number }[] {
  const centers: { col: number; row: number }[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const uMid = ((i + 0.5) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    centers.push(uvToGrid(run, uMid, 0.5))
  }
  return centers
}

export interface StepSideFace {
  points: number[]
  side: 'south' | 'east'
}

export function isoStepSideFaces(run: StepRun, tileW: number, tileH: number, _faceH: number): StepSideFace[] {
  const side = run.direction === 'E' || run.direction === 'W' ? 'south' : 'east'
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const sign = run.ascending ? -1 : 1
  const faces: StepSideFace[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const start = i * drop * sign
    // A descending flight drops from this level to the one below, so its
    // exposed side reaches the lower floor plane. An ascending flight rises
    // from this level, so its exposed side must instead reach this level's
    // floor plane. Using the upper landing for both cases inverted the wall
    // beneath ascending stairs.
    const end = run.ascending ? 0 : Z_STEP_HEIGHT
    const ga = uvToGrid(run, u0, 1)
    const gb = uvToGrid(run, u1, 1)
    const a = isoProject(ga.col, ga.row, tileW, tileH)
    const b = isoProject(gb.col, gb.row, tileW, tileH)
    const aTop = a.y + start
    const bTop = b.y + start
    const aBottom = a.y + end
    const bBottom = b.y + end
    faces.push({
      side,
      points: start <= end
        ? [a.x, aTop, b.x, bTop, b.x, bBottom, a.x, aBottom]
        : [a.x, aBottom, b.x, bBottom, b.x, bTop, a.x, aTop],
    })
  }
  return faces
}

export function topDownStepFaceRect(
  run: StepRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  return topDownRunFaceRect(run, tilePx, facePx)
}

export interface TreadRect {
  x: number
  y: number
  width: number
  height: number
}

export function topDownStepRects(run: StepRun): TreadRect[] {
  const rects: TreadRect[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const a = uvToGrid(run, u0, 0)
    const b = uvToGrid(run, u1, 1)
    rects.push({
      x: Math.min(a.col, b.col),
      y: Math.min(a.row, b.row),
      width: Math.abs(b.col - a.col),
      height: Math.abs(b.row - a.row),
    })
  }
  return rects
}

export function isoStepTreads(run: StepRun, tileW: number, tileH: number): IsoTread[] {
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const sign = run.ascending ? -1 : 1
  const treads: IsoTread[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const d = i * drop * sign
    const corners = [
      uvToGrid(run, u0, 0),
      uvToGrid(run, u1, 0),
      uvToGrid(run, u1, 1),
      uvToGrid(run, u0, 1),
    ].map(g => isoProject(g.col, g.row, tileW, tileH))
    const top = corners.flatMap(p => [p.x, p.y + d])
    const a = corners[1]
    const b = corners[2]
    const front = [a.x, a.y + d, b.x, b.y + d, b.x, b.y + d + drop * sign, a.x, a.y + d + drop * sign]
    treads.push({ top, front })
  }
  return treads
}

export function addStepRun(steps: StepRun[], run: StepRun): StepRun[] { return addRun(steps, run) }
export function removeStepRun(steps: StepRun[], id: string): StepRun[] { return removeRun(steps, id) }
export function moveStepRun(steps: StepRun[], id: string, col: number, row: number): StepRun[] { return moveRun(steps, id, col, row) }
export function rotateStepRun(steps: StepRun[], id: string): StepRun[] { return rotateRun(steps, id) }
export function toggleStepRunAscending(steps: StepRun[], id: string): StepRun[] {
  return steps.map(r => r.id === id ? { ...r, ascending: !r.ascending } : r)
}
