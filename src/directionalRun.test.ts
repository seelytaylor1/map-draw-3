import { describe, expect, it } from 'vitest'
import {
  runTiles, uvToGrid, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
  type DirectionalRun,
} from './directionalRun'

function run(overrides: Partial<DirectionalRun> = {}): DirectionalRun {
  return { id: 'a', col: 3, row: 4, z: 0, direction: 'E', ...overrides }
}

describe('runTiles', () => {
  it('extends east (col increases) for direction E', () => {
    expect(runTiles(run({ direction: 'E' }))).toEqual([
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ])
  })
  it('extends west (col decreases) for direction W', () => {
    expect(runTiles(run({ direction: 'W' }))).toEqual([
      { col: 3, row: 4 },
      { col: 2, row: 4 },
    ])
  })
  it('extends north (row decreases) for direction N', () => {
    expect(runTiles(run({ direction: 'N' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 3 },
    ])
  })
  it('extends south (row increases) for direction S', () => {
    expect(runTiles(run({ direction: 'S' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 5 },
    ])
  })
})

describe('uvToGrid', () => {
  it('E: u along col, v along row', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'E' }), 1.5, 0.5)).toEqual({ col: 3.5, row: 1.5 })
  })
  it('W: u inverted along col, v along row', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'W' }), 0, 0)).toEqual({ col: 3, row: 1 })
  })
  it('S: u along row, v along col', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'S' }), 1, 0.5)).toEqual({ col: 2.5, row: 2 })
  })
  it('N: u inverted along row, v along col', () => {
    expect(uvToGrid(run({ col: 2, row: 3, direction: 'N' }), 0, 0)).toEqual({ col: 2, row: 4 })
  })
})

describe('topDownRunFaceRect', () => {
  it('E: face below the run (south), full 2-tile width', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'E' }), 20, 8)).toEqual(
      { x: 60, y: 100, width: 40, height: 8 }
    )
  })
  it('W: face below origin shifted one tile left', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'W' }), 20, 8)).toEqual(
      { x: 40, y: 100, width: 40, height: 8 }
    )
  })
  it('S: face to the right of the run (east), full 2-tile height', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'S' }), 20, 8)).toEqual(
      { x: 80, y: 80, width: 8, height: 40 }
    )
  })
  it('N: face to the right shifted one tile up', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'N' }), 20, 8)).toEqual(
      { x: 80, y: 60, width: 8, height: 40 }
    )
  })
})

describe('list mutations', () => {
  it('addRun appends without mutating the original', () => {
    const list: DirectionalRun[] = []
    const result = addRun(list, run())
    expect(result).toEqual([run()])
    expect(list).toEqual([])
  })

  it('removeRun removes by id and leaves others', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    expect(removeRun(list, 'a')).toEqual([run({ id: 'b' })])
  })

  it('rotateRun cycles direction N→E→S→W→N', () => {
    const directions: Array<'N' | 'E' | 'S' | 'W'> = ['N', 'E', 'S', 'W']
    for (let i = 0; i < directions.length; i++) {
      const from = directions[i]
      const to = directions[(i + 1) % 4]
      const list = [run({ id: 'a', direction: from })]
      expect(rotateRun(list, 'a')[0].direction).toBe(to)
    }
  })

  it('moveRun updates col/row of the matching id only', () => {
    const list = [run({ id: 'a', col: 0, row: 0 }), run({ id: 'b', col: 5, row: 5 })]
    const result = moveRun(list, 'a', 7, 8)
    expect(result[0]).toEqual({ id: 'a', col: 7, row: 8, z: 0, direction: 'E' })
    expect(result[1]).toEqual(list[1])
    expect(list[0].col).toBe(0) // original not mutated
  })

  it('rotateRun preserves all fields except direction', () => {
    const list = [run({ id: 'x', col: 9, row: 2, z: -3, direction: 'E' })]
    expect(rotateRun(list, 'x')[0]).toEqual({ id: 'x', col: 9, row: 2, z: -3, direction: 'S' })
  })

  it('rotateRun does not mutate original', () => {
    const list = [run({ id: 'a', direction: 'N' })]
    rotateRun(list, 'a')
    expect(list[0].direction).toBe('N')
  })
})
