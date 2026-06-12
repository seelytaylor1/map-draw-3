// src/ramps.ts
import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'
import {
  type DirectionalRun, RUN_LENGTH,
  uvToGrid, runTiles, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
} from './directionalRun'

export type RampDirection = 'N' | 'E' | 'S' | 'W'

export interface RampRun extends DirectionalRun {
  direction: RampDirection
}

export const RAMP_RUN_LENGTH = RUN_LENGTH

export function rampRunTiles(run: RampRun): { col: number; row: number }[] {
  return runTiles(run)
}

// Linear elevation drop at distance u along the descent.
function dropAt(u: number): number {
  return (u / RAMP_RUN_LENGTH) * Z_STEP_HEIGHT
}

export function isoRampSurface(run: RampRun, tileW: number, tileH: number): number[] {
  const L = RAMP_RUN_LENGTH
  const corners: { u: number; v: number }[] = [
    { u: 0, v: 0 },
    { u: L, v: 0 },
    { u: L, v: 1 },
    { u: 0, v: 1 },
  ]
  return corners.flatMap(({ u, v }) => {
    const g = uvToGrid(run, u, v)
    const p = isoProject(g.col, g.row, tileW, tileH)
    return [p.x, p.y + dropAt(u)]
  })
}

export function rampCenter(run: RampRun): { col: number; row: number } {
  return uvToGrid(run, RAMP_RUN_LENGTH / 2, 0.5)
}

export function topDownRampFaceRect(
  run: RampRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  return topDownRunFaceRect(run, tilePx, facePx)
}

export interface RampRect {
  x: number
  y: number
  width: number
  height: number
}

export function topDownRampRect(run: RampRun): RampRect {
  const a = uvToGrid(run, 0, 0)
  const b = uvToGrid(run, RAMP_RUN_LENGTH, 1)
  return {
    x: Math.min(a.col, b.col),
    y: Math.min(a.row, b.row),
    width: Math.abs(b.col - a.col),
    height: Math.abs(b.row - a.row),
  }
}

export interface RampSideFace {
  points: number[]
  side: 'south' | 'east'
}

export function isoRampSideFace(run: RampRun, tileW: number, tileH: number): RampSideFace {
  const side = run.direction === 'E' || run.direction === 'W' ? 'south' : 'east'
  const ga = uvToGrid(run, 0, 1)
  const gb = uvToGrid(run, RAMP_RUN_LENGTH, 1)
  const a = isoProject(ga.col, ga.row, tileW, tileH)
  const b = isoProject(gb.col, gb.row, tileW, tileH)
  return {
    side,
    points: [
      a.x, a.y + dropAt(0),
      b.x, b.y + dropAt(RAMP_RUN_LENGTH),
      b.x, b.y + Z_STEP_HEIGHT,
      a.x, a.y + Z_STEP_HEIGHT,
    ],
  }
}

export function addRampRun(ramps: RampRun[], run: RampRun): RampRun[] { return addRun(ramps, run) }
export function removeRampRun(ramps: RampRun[], id: string): RampRun[] { return removeRun(ramps, id) }
export function moveRampRun(ramps: RampRun[], id: string, col: number, row: number): RampRun[] { return moveRun(ramps, id, col, row) }
export function rotateRampRun(ramps: RampRun[], id: string): RampRun[] { return rotateRun(ramps, id) }
