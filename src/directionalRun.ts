// src/directionalRun.ts
export type Direction = 'N' | 'E' | 'S' | 'W'

export interface DirectionalRun {
  id: string
  col: number
  row: number
  z: number
  direction: Direction
}

export const RUN_LENGTH = 2  // tiles from top floor to bottom floor

export const DIRECTION_DELTAS: Record<Direction, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
}

export const DIRECTION_CYCLE: Record<Direction, Direction> = { N: 'E', E: 'S', S: 'W', W: 'N' }

// Run-local frame: u runs 0..RUN_LENGTH along the descent, v runs 0..1 across it.
export function uvToGrid(run: DirectionalRun, u: number, v: number): { col: number; row: number } {
  switch (run.direction) {
    case 'E': return { col: run.col + u, row: run.row + v }
    case 'W': return { col: run.col + 1 - u, row: run.row + v }
    case 'S': return { col: run.col + v, row: run.row + u }
    case 'N': return { col: run.col + v, row: run.row + 1 - u }
  }
}

export function runTiles(run: DirectionalRun): { col: number; row: number }[] {
  const { dc, dr } = DIRECTION_DELTAS[run.direction]
  return Array.from({ length: RUN_LENGTH }, (_, i) => ({
    col: run.col + dc * i,
    row: run.row + dr * i,
  }))
}

export function topDownRunFaceRect(
  run: DirectionalRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  const len = RUN_LENGTH * tilePx
  switch (run.direction) {
    case 'E': return { x: run.col * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'W': return { x: (run.col - 1) * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'S': return { x: (run.col + 1) * tilePx, y: run.row * tilePx, width: facePx, height: len }
    case 'N': return { x: (run.col + 1) * tilePx, y: (run.row - 1) * tilePx, width: facePx, height: len }
  }
}

export function addRun<T extends DirectionalRun>(list: T[], run: T): T[] {
  return [...list, run]
}

export function removeRun<T extends DirectionalRun>(list: T[], id: string): T[] {
  return list.filter(r => r.id !== id)
}

export function rotateRun<T extends DirectionalRun>(list: T[], id: string): T[] {
  return list.map(r => r.id === id ? { ...r, direction: DIRECTION_CYCLE[r.direction] } : r)
}

export function moveRun<T extends DirectionalRun>(list: T[], id: string, col: number, row: number): T[] {
  return list.map(r => r.id === id ? { ...r, col, row } : r)
}
