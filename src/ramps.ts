import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'

export type RampDirection = 'N' | 'E' | 'S' | 'W'

export interface RampRun {
  id: string
  col: number
  row: number
  z: number
  direction: RampDirection
}

const DIRECTION_DELTAS: Record<RampDirection, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
}

const DIRECTION_CYCLE: Record<RampDirection, RampDirection> = { N: 'E', E: 'S', S: 'W', W: 'N' }

export const RAMP_RUN_LENGTH = 2 // tiles from top floor to bottom floor

export function rampRunTiles(run: RampRun): { col: number; row: number }[] {
  const { dc, dr } = DIRECTION_DELTAS[run.direction]
  const tiles: { col: number; row: number }[] = []
  for (let i = 0; i < RAMP_RUN_LENGTH; i++) {
    tiles.push({ col: run.col + dc * i, row: run.row + dr * i })
  }
  return tiles
}

// Run-local frame: u runs 0..RAMP_RUN_LENGTH along the descent, v runs 0..1 across it.
function uvToGrid(run: RampRun, u: number, v: number): { col: number; row: number } {
  switch (run.direction) {
    case 'E': return { col: run.col + u, row: run.row + v }
    case 'W': return { col: run.col + 1 - u, row: run.row + v }
    case 'S': return { col: run.col + v, row: run.row + u }
    case 'N': return { col: run.col + v, row: run.row + 1 - u }
  }
}

// Linear elevation drop at distance u along the descent: 0 at the top edge,
// Z_STEP_HEIGHT where the ramp lands on the Z-1 floor plane.
function dropAt(u: number): number {
  return (u / RAMP_RUN_LENGTH) * Z_STEP_HEIGHT
}

// The ramp's single sloped top quad in Iso View, local to the run's Z level group
// (same frame as isoFloorPoints at that level). The u=0 edge sits flush with the
// upper floor; the u=RAMP_RUN_LENGTH edge lands exactly on the Z-1 floor plane.
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

// Grid-space center of the ramp — its painter depth anchor for render sorting.
// A ramp is a single solid (unlike a Step Run's per-tread anchors).
export function rampCenter(run: RampRun): { col: number; row: number } {
  return uvToGrid(run, RAMP_RUN_LENGTH / 2, 0.5)
}

// 3D Effect band for Top-Down View: a facePx-thick strip along the run's exposed
// edge (south for E/W runs, east for N/S runs), in pixels. Mirrors the ramp's
// run-local footprint so it cannot drift from topDownRampRect.
export function topDownRampFaceRect(
  run: RampRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  const len = RAMP_RUN_LENGTH * tilePx
  switch (run.direction) {
    case 'E': return { x: run.col * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'W': return { x: (run.col - 1) * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'S': return { x: (run.col + 1) * tilePx, y: run.row * tilePx, width: facePx, height: len }
    case 'N': return { x: (run.col + 1) * tilePx, y: (run.row - 1) * tilePx, width: facePx, height: len }
  }
}

export interface RampRect {
  x: number      // tile units
  y: number
  width: number
  height: number
}

// The ramp's footprint rectangle in tile units for Top-Down View, derived from
// the same run-local frame as isoRampSurface so the two views cannot drift.
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
  points: number[]            // closed quad, 4 points as flat [x, y, ...]
  side: 'south' | 'east'      // which exposed slab side this face represents
}

// The ramp's exposed side in Iso View: a single triangular wedge along the run's
// exposed edge (south for E/W runs, east for N/S runs). The top edge follows the
// sloped surface; the bottom edge sits on the Z-1 floor plane, so the wedge is
// full Z_STEP_HEIGHT tall at the top and tapers to nothing where the ramp lands.
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

export function addRampRun(ramps: RampRun[], run: RampRun): RampRun[] {
  return [...ramps, run]
}

export function removeRampRun(ramps: RampRun[], id: string): RampRun[] {
  return ramps.filter(r => r.id !== id)
}

export function moveRampRun(ramps: RampRun[], id: string, col: number, row: number): RampRun[] {
  return ramps.map(r => r.id === id ? { ...r, col, row } : r)
}

export function rotateRampRun(ramps: RampRun[], id: string): RampRun[] {
  return ramps.map(r => r.id === id ? { ...r, direction: DIRECTION_CYCLE[r.direction] } : r)
}
