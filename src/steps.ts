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
