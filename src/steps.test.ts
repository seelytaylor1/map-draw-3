import { describe, expect, it } from 'vitest'
import { stepRunTiles, type StepRun } from './steps'

const run = (overrides: Partial<StepRun> = {}): StepRun => ({
  id: 'a',
  col: 3,
  row: 4,
  z: 0,
  direction: 'E',
  ...overrides,
})

describe('stepRunTiles', () => {
  it('returns origin tile plus the next tile east for direction E', () => {
    expect(stepRunTiles(run({ direction: 'E' }))).toEqual([
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ])
  })

  it('extends west for direction W', () => {
    expect(stepRunTiles(run({ direction: 'W' }))).toEqual([
      { col: 3, row: 4 },
      { col: 2, row: 4 },
    ])
  })

  it('extends north (row decreases) for direction N', () => {
    expect(stepRunTiles(run({ direction: 'N' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 3 },
    ])
  })

  it('extends south (row increases) for direction S', () => {
    expect(stepRunTiles(run({ direction: 'S' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 5 },
    ])
  })
})
