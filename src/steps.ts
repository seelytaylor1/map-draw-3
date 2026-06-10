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
