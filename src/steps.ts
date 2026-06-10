import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'

export type StepDirection = 'N' | 'E' | 'S' | 'W'

export interface StepRun {
  id: string
  col: number
  row: number
  z: number
  direction: StepDirection
}

const DIRECTION_DELTAS: Record<StepDirection, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
}

export const STEP_RUN_LENGTH = 2 // tiles from top floor to bottom floor

export function stepRunTiles(run: StepRun): { col: number; row: number }[] {
  const { dc, dr } = DIRECTION_DELTAS[run.direction]
  const tiles: { col: number; row: number }[] = []
  for (let i = 0; i < STEP_RUN_LENGTH; i++) {
    tiles.push({ col: run.col + dc * i, row: run.row + dr * i })
  }
  return tiles
}

const DIRECTION_CYCLE: Record<StepDirection, StepDirection> = { N: 'E', E: 'S', S: 'W', W: 'N' }

export const STEP_TREAD_COUNT = 6

export interface IsoTread {
  top: number[]   // closed quad, 4 points as flat [x, y, ...]
  front: number[] // vertical riser face at the tread's leading edge
}

// Run-local frame: u runs 0..STEP_RUN_LENGTH along the descent, v runs 0..1 across it.
function uvToGrid(run: StepRun, u: number, v: number): { col: number; row: number } {
  switch (run.direction) {
    case 'E': return { col: run.col + u, row: run.row + v }
    case 'W': return { col: run.col + 1 - u, row: run.row + v }
    case 'S': return { col: run.col + v, row: run.row + u }
    case 'N': return { col: run.col + v, row: run.row + 1 - u }
  }
}

export interface StepSideFace {
  points: number[]            // closed quad, 4 points as flat [x, y, ...]
  side: 'south' | 'east'      // which exposed slab side this face represents
}

// 3D Effect side faces for a step run in Iso View. The viewer sees south and
// east slab faces; in the run-local frame the v=1 edge is always the exposed
// one (south for E/W runs, east for N/S runs). One face per tread, stepped to
// the tread's elevation, faceH tall — matching the Extruded Side Faces look.
export function isoStepSideFaces(run: StepRun, tileW: number, tileH: number, faceH: number): StepSideFace[] {
  const side = run.direction === 'E' || run.direction === 'W' ? 'south' : 'east'
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const faces: StepSideFace[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const d = i * drop
    const ga = uvToGrid(run, u0, 1)
    const gb = uvToGrid(run, u1, 1)
    const a = isoProject(ga.col, ga.row, tileW, tileH)
    const b = isoProject(gb.col, gb.row, tileW, tileH)
    faces.push({
      side,
      points: [a.x, a.y + d, b.x, b.y + d, b.x, b.y + d + faceH, a.x, a.y + d + faceH],
    })
  }
  return faces
}

// 3D Effect band for Top-Down View: a facePx-thick strip along the run's
// exposed edge (south for E/W runs, east for N/S runs), in pixels.
export function topDownStepFaceRect(
  run: StepRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  const len = STEP_RUN_LENGTH * tilePx
  switch (run.direction) {
    case 'E': return { x: run.col * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'W': return { x: (run.col - 1) * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'S': return { x: (run.col + 1) * tilePx, y: run.row * tilePx, width: facePx, height: len }
    case 'N': return { x: (run.col + 1) * tilePx, y: (run.row - 1) * tilePx, width: facePx, height: len }
  }
}

export interface TreadRect {
  x: number      // tile units
  y: number
  width: number
  height: number
}

// Tread rectangles in tile units for Top-Down View, derived from the same
// run-local frame as isoStepTreads so the two views cannot drift.
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

// Geometry is local to the run's Z level group (same frame as isoFloorPoints at that level).
// Tread 0 sits flush with the upper floor; each riser drops Z_STEP_HEIGHT / STEP_TREAD_COUNT,
// so the final riser lands exactly on the Z−1 floor plane.
export function isoStepTreads(run: StepRun, tileW: number, tileH: number): IsoTread[] {
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const treads: IsoTread[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const d = i * drop
    const corners = [
      uvToGrid(run, u0, 0),
      uvToGrid(run, u1, 0),
      uvToGrid(run, u1, 1),
      uvToGrid(run, u0, 1),
    ].map(g => isoProject(g.col, g.row, tileW, tileH))
    const top = corners.flatMap(p => [p.x, p.y + d])
    const a = corners[1]
    const b = corners[2]
    const front = [a.x, a.y + d, b.x, b.y + d, b.x, b.y + d + drop, a.x, a.y + d + drop]
    treads.push({ top, front })
  }
  return treads
}

export function addStepRun(steps: StepRun[], run: StepRun): StepRun[] {
  return [...steps, run]
}

export function removeStepRun(steps: StepRun[], id: string): StepRun[] {
  return steps.filter(s => s.id !== id)
}

export function moveStepRun(steps: StepRun[], id: string, col: number, row: number): StepRun[] {
  return steps.map(s => s.id === id ? { ...s, col, row } : s)
}

export function rotateStepRun(steps: StepRun[], id: string): StepRun[] {
  return steps.map(s => s.id === id ? { ...s, direction: DIRECTION_CYCLE[s.direction] } : s)
}
