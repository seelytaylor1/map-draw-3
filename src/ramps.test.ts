import { describe, expect, it } from 'vitest'
import { addRampRun, isoRampSideFace, isoRampSurface, moveRampRun, rampCenter, rampRunTiles, removeRampRun, rotateRampRun, topDownRampFaceRect, topDownRampRect, type RampRun } from './ramps'
import { isoProject } from './iso'
import { Z_STEP_HEIGHT } from './constants'

const run = (overrides: Partial<RampRun> = {}): RampRun => ({
  id: 'a',
  col: 3,
  row: 4,
  z: 0,
  direction: 'E',
  ...overrides,
})

describe('rampRunTiles', () => {
  it('returns origin tile plus the next tile east for direction E', () => {
    expect(rampRunTiles(run({ direction: 'E' }))).toEqual([
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ])
  })

  it('extends west for direction W', () => {
    expect(rampRunTiles(run({ direction: 'W' }))).toEqual([
      { col: 3, row: 4 },
      { col: 2, row: 4 },
    ])
  })

  it('extends north (row decreases) for direction N', () => {
    expect(rampRunTiles(run({ direction: 'N' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 3 },
    ])
  })

  it('extends south (row increases) for direction S', () => {
    expect(rampRunTiles(run({ direction: 'S' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 5 },
    ])
  })
})

describe('isoRampSurface', () => {
  const TILE_W = 40
  const TILE_H = 20

  it('is a single quad: near edge flush with upper floor, far edge on the Z-1 floor plane', () => {
    const r = run({ col: 0, row: 0, direction: 'E' })
    const surface = isoRampSurface(r, TILE_W, TILE_H)
    const near0 = isoProject(0, 0, TILE_W, TILE_H)
    const far0 = isoProject(2, 0, TILE_W, TILE_H)
    const far1 = isoProject(2, 1, TILE_W, TILE_H)
    const near1 = isoProject(0, 1, TILE_W, TILE_H)
    expect(surface).toEqual([
      near0.x, near0.y,                       // u=0,v=0: drop 0
      far0.x, far0.y + Z_STEP_HEIGHT,          // u=2,v=0: full drop
      far1.x, far1.y + Z_STEP_HEIGHT,          // u=2,v=1: full drop
      near1.x, near1.y,                        // u=0,v=1: drop 0
    ])
  })

  it('direction N: near edge spans the far (row+1) edge of the origin tile', () => {
    const north = isoRampSurface(run({ col: 3, row: 4, direction: 'N' }), TILE_W, TILE_H)
    const start = isoProject(3, 5, TILE_W, TILE_H) // u=0 maps to row+1 edge
    expect(north[0]).toBe(start.x)
    expect(north[1]).toBe(start.y)
  })
})

describe('isoRampSideFace', () => {
  const TILE_W = 40
  const TILE_H = 20

  it('direction E: a south-side wedge full Z_STEP_HEIGHT tall at the top, tapering to the floor', () => {
    const face = isoRampSideFace(run({ col: 0, row: 0, direction: 'E' }), TILE_W, TILE_H)
    const a = isoProject(0, 1, TILE_W, TILE_H) // u=0 edge: surface flush, full slab below
    const b = isoProject(2, 1, TILE_W, TILE_H) // u=2 edge: surface on floor plane, no slab
    expect(face.side).toBe('south')
    expect(face.points).toEqual([
      a.x, a.y,                       // top at u=0: ramp surface (drop 0)
      b.x, b.y + Z_STEP_HEIGHT,        // top at u=2: ramp surface on floor plane
      b.x, b.y + Z_STEP_HEIGHT,        // bottom at u=2: floor plane (degenerate apex)
      a.x, a.y + Z_STEP_HEIGHT,        // bottom at u=0: floor plane
    ])
  })

  it('direction W: wedge is south-side', () => {
    expect(isoRampSideFace(run({ direction: 'W' }), TILE_W, TILE_H).side).toBe('south')
  })

  it('directions N and S: wedge is east-side', () => {
    expect(isoRampSideFace(run({ direction: 'N' }), TILE_W, TILE_H).side).toBe('east')
    expect(isoRampSideFace(run({ direction: 'S' }), TILE_W, TILE_H).side).toBe('east')
  })
})

describe('topDownRampRect', () => {
  it('direction E: a 2x1 strip from the origin eastward, in tile units', () => {
    expect(topDownRampRect(run({ col: 3, row: 4, direction: 'E' }))).toEqual(
      { x: 3, y: 4, width: 2, height: 1 },
    )
  })

  it('direction W: a 2x1 strip covering both tiles west of origin', () => {
    expect(topDownRampRect(run({ col: 3, row: 4, direction: 'W' }))).toEqual(
      { x: 2, y: 4, width: 2, height: 1 },
    )
  })

  it('direction S: a 1x2 strip descending southward', () => {
    expect(topDownRampRect(run({ col: 3, row: 4, direction: 'S' }))).toEqual(
      { x: 3, y: 4, width: 1, height: 2 },
    )
  })

  it('direction N: a 1x2 strip covering both tiles north of origin', () => {
    expect(topDownRampRect(run({ col: 3, row: 4, direction: 'N' }))).toEqual(
      { x: 3, y: 3, width: 1, height: 2 },
    )
  })
})

describe('topDownRampFaceRect', () => {
  it('direction E: band runs under the south edge of the strip', () => {
    expect(topDownRampFaceRect(run({ col: 3, row: 4, direction: 'E' }), 20, 8)).toEqual(
      { x: 60, y: 100, width: 40, height: 8 },
    )
  })

  it('direction W: band covers both tiles west of origin', () => {
    expect(topDownRampFaceRect(run({ col: 3, row: 4, direction: 'W' }), 20, 8)).toEqual(
      { x: 40, y: 100, width: 40, height: 8 },
    )
  })

  it('direction S: band runs along the east edge of the strip', () => {
    expect(topDownRampFaceRect(run({ col: 3, row: 4, direction: 'S' }), 20, 8)).toEqual(
      { x: 80, y: 80, width: 8, height: 40 },
    )
  })

  it('direction N: band covers both tiles north of origin east edge', () => {
    expect(topDownRampFaceRect(run({ col: 3, row: 4, direction: 'N' }), 20, 8)).toEqual(
      { x: 80, y: 60, width: 8, height: 40 },
    )
  })
})

describe('rampCenter', () => {
  it('direction E: sits at the middle of the 2x1 footprint', () => {
    expect(rampCenter(run({ col: 3, row: 4, direction: 'E' }))).toEqual({ col: 4, row: 4.5 })
  })

  it('direction N: sits at the middle of the 1x2 footprint', () => {
    expect(rampCenter(run({ col: 3, row: 4, direction: 'N' }))).toEqual({ col: 3.5, row: 4 })
  })
})

describe('ramp run list mutators', () => {
  it('addRampRun appends without mutating the original list', () => {
    const list: RampRun[] = []
    const result = addRampRun(list, run())
    expect(result).toEqual([run()])
    expect(list).toEqual([])
  })

  it('removeRampRun removes by id and leaves others', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    expect(removeRampRun(list, 'a')).toEqual([run({ id: 'b' })])
  })

  it('moveRampRun updates col/row of the matching run only', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    const result = moveRampRun(list, 'b', 7, 8)
    expect(result[0]).toEqual(run({ id: 'a' }))
    expect(result[1]).toEqual(run({ id: 'b', col: 7, row: 8 }))
  })

  it('rotateRampRun cycles direction N -> E -> S -> W -> N', () => {
    let list = [run({ direction: 'N' })]
    list = rotateRampRun(list, 'a')
    expect(list[0].direction).toBe('E')
    list = rotateRampRun(list, 'a')
    expect(list[0].direction).toBe('S')
    list = rotateRampRun(list, 'a')
    expect(list[0].direction).toBe('W')
    list = rotateRampRun(list, 'a')
    expect(list[0].direction).toBe('N')
  })

  it('rotateRampRun preserves all other fields', () => {
    const list = [run({ id: 'x', col: 9, row: 2, z: -3, direction: 'E' })]
    expect(rotateRampRun(list, 'x')[0]).toEqual(run({ id: 'x', col: 9, row: 2, z: -3, direction: 'S' }))
  })
})
