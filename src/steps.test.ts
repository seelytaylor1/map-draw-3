import { describe, expect, it } from 'vitest'
import { addStepRun, moveStepRun, removeStepRun, rotateStepRun, stepRunTiles, type StepRun } from './steps'

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

describe('step run list mutators', () => {
  it('addStepRun appends without mutating the original list', () => {
    const list: StepRun[] = []
    const result = addStepRun(list, run())
    expect(result).toEqual([run()])
    expect(list).toEqual([])
  })

  it('removeStepRun removes by id and leaves others', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    expect(removeStepRun(list, 'a')).toEqual([run({ id: 'b' })])
  })

  it('moveStepRun updates col/row of the matching run only', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    const result = moveStepRun(list, 'b', 7, 8)
    expect(result[0]).toEqual(run({ id: 'a' }))
    expect(result[1]).toEqual(run({ id: 'b', col: 7, row: 8 }))
  })

  it('rotateStepRun cycles direction N -> E -> S -> W -> N', () => {
    let list = [run({ direction: 'N' })]
    list = rotateStepRun(list, 'a')
    expect(list[0].direction).toBe('E')
    list = rotateStepRun(list, 'a')
    expect(list[0].direction).toBe('S')
    list = rotateStepRun(list, 'a')
    expect(list[0].direction).toBe('W')
    list = rotateStepRun(list, 'a')
    expect(list[0].direction).toBe('N')
  })

  it('rotateStepRun preserves all other fields', () => {
    const list = [run({ id: 'x', col: 9, row: 2, z: -3, direction: 'E' })]
    expect(rotateStepRun(list, 'x')[0]).toEqual(run({ id: 'x', col: 9, row: 2, z: -3, direction: 'S' }))
  })
})
