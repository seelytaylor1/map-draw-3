import { describe, expect, it } from 'vitest'
import { STEP_TREAD_COUNT, addStepRun, isoStepTreads, moveStepRun, removeStepRun, rotateStepRun, stepRunTiles, topDownStepRects, type StepRun } from './steps'
import { isoProject } from './iso'
import { Z_STEP_HEIGHT } from './constants'

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

describe('isoStepTreads', () => {
  const TILE_W = 40
  const TILE_H = 20

  it('returns STEP_TREAD_COUNT treads', () => {
    const treads = isoStepTreads(run({ direction: 'E' }), TILE_W, TILE_H)
    expect(treads.length).toBe(STEP_TREAD_COUNT)
  })

  it('first tread top is flush with the upper floor plane', () => {
    const r = run({ col: 0, row: 0, direction: 'E' })
    const treads = isoStepTreads(r, TILE_W, TILE_H)
    const u1 = 2 / STEP_TREAD_COUNT
    expect(treads[0].top).toEqual([
      isoProject(0, 0, TILE_W, TILE_H).x, isoProject(0, 0, TILE_W, TILE_H).y,
      isoProject(u1, 0, TILE_W, TILE_H).x, isoProject(u1, 0, TILE_W, TILE_H).y,
      isoProject(u1, 1, TILE_W, TILE_H).x, isoProject(u1, 1, TILE_W, TILE_H).y,
      isoProject(0, 1, TILE_W, TILE_H).x, isoProject(0, 1, TILE_W, TILE_H).y,
    ])
  })
})

describe('isoStepTreads descent', () => {
  const TILE_W = 40
  const TILE_H = 20
  const r = run({ col: 0, row: 0, direction: 'E' })
  const treads = isoStepTreads(r, TILE_W, TILE_H)
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT

  it('each tread sits one riser drop lower than the previous', () => {
    for (let i = 1; i < treads.length; i++) {
      // corner 0 of tread i shares u with corner 1 of tread i-1: same projected
      // point, one drop lower minus the riser already applied -- compare via
      // elevation: y of corner 0 minus plain projection equals i * drop
      const u0 = (i * 2) / STEP_TREAD_COUNT
      const flat = isoProject(u0, 0, TILE_W, TILE_H)
      expect(treads[i].top[0]).toBe(flat.x)
      expect(treads[i].top[1]).toBeCloseTo(flat.y + i * drop, 10)
    }
  })

  it('riser of each tread connects its top to the next tread elevation', () => {
    for (let i = 0; i < treads.length; i++) {
      const f = treads[i].front
      // front face top edge y values match tread top corners 1 and 2
      expect(f[1]).toBeCloseTo(treads[i].top[3], 10)
      expect(f[3]).toBeCloseTo(treads[i].top[5], 10)
      // bottom edge is exactly one riser drop lower (quad order: a-top, b-top, b-bottom, a-bottom)
      expect(f[5]).toBeCloseTo(f[3] + drop, 10)
      expect(f[7]).toBeCloseTo(f[1] + drop, 10)
    }
  })

  it('final riser lands exactly on the Z-1 floor plane', () => {
    const last = treads[treads.length - 1]
    const flatEnd = isoProject(2, 0, TILE_W, TILE_H)
    expect(last.front[7]).toBeCloseTo(flatEnd.y + Z_STEP_HEIGHT, 10)
  })

  it('direction N: first tread spans the far edge of the origin tile', () => {
    const north = isoStepTreads(run({ col: 3, row: 4, direction: 'N' }), TILE_W, TILE_H)
    const start = isoProject(3, 5, TILE_W, TILE_H) // u=0 maps to row+1 edge
    expect(north[0].top[0]).toBe(start.x)
    expect(north[0].top[1]).toBe(start.y)
  })
})

describe('topDownStepRects', () => {
  it('returns STEP_TREAD_COUNT rects', () => {
    expect(topDownStepRects(run()).length).toBe(STEP_TREAD_COUNT)
  })

  it('direction E: rects tile the 2x1 strip from origin eastward, in tile units', () => {
    const rects = topDownStepRects(run({ col: 3, row: 4, direction: 'E' }))
    const w = 2 / STEP_TREAD_COUNT
    rects.forEach((r, i) => {
      expect(r.x).toBeCloseTo(3 + i * w, 10)
      expect(r.y).toBe(4)
      expect(r.width).toBeCloseTo(w, 10)
      expect(r.height).toBe(1)
    })
  })

  it('direction W: rects tile westward from the origin tile east edge', () => {
    const rects = topDownStepRects(run({ col: 3, row: 4, direction: 'W' }))
    const w = 2 / STEP_TREAD_COUNT
    expect(rects[0].x).toBeCloseTo(4 - w, 10)
    expect(rects[0].y).toBe(4)
    const last = rects[rects.length - 1]
    expect(last.x).toBeCloseTo(2, 10)
  })

  it('direction S: rects descend southward, full tile wide', () => {
    const rects = topDownStepRects(run({ col: 3, row: 4, direction: 'S' }))
    const h = 2 / STEP_TREAD_COUNT
    rects.forEach((r, i) => {
      expect(r.x).toBe(3)
      expect(r.y).toBeCloseTo(4 + i * h, 10)
      expect(r.width).toBe(1)
      expect(r.height).toBeCloseTo(h, 10)
    })
  })

  it('direction N: rects ascend northward from the origin tile south edge', () => {
    const rects = topDownStepRects(run({ col: 3, row: 4, direction: 'N' }))
    const h = 2 / STEP_TREAD_COUNT
    expect(rects[0].y).toBeCloseTo(5 - h, 10)
    const last = rects[rects.length - 1]
    expect(last.y).toBeCloseTo(3, 10)
  })
})
