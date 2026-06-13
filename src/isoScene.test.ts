import { describe, expect, it } from 'vitest'
import { buildIsoScene, type IsoSceneParams } from './isoScene'
import { createGrid, paintTiles } from './grid'
import { isoEastFacePoints, isoFloorPoints, isoFrontFacePoints, isoProject, isoWaterPoints } from './iso'
import { FACE_PX, FLOOR, FLOOR_COLOR, WATER, WATER_COLOR, WATER_OFFSET_Y, Z_STEP_HEIGHT } from './constants'
import { STEP_TREAD_COUNT, isoStepTreads, type StepRun } from './steps'
import { isoRampSurface, type RampRun } from './ramps'
import { deriveFaceColors } from './faceColors'

const TILE_W = 40
const TILE_H = 20

const { front: FRONT_COLOR, east: EAST_COLOR } = deriveFaceColors('#6a5040')

function offset(points: number[]): number[] {
  return points.map((v, i) => (i % 2 === 1 ? v - Z_STEP_HEIGHT : v))
}

function shiftY(points: number[], dy: number): number[] {
  return points.map((v, i) => (i % 2 === 1 ? v + dy : v))
}

function params(overrides: Partial<IsoSceneParams> = {}): IsoSceneParams {
  return {
    grids: new Map(),
    steps: [] as StepRun[],
    ramps: [] as RampRun[],
    cols: 8,
    rows: 8,
    show3D: false,
    wallColor: '#000000',
    wallOpacity: 0,
    selectedStepId: null,
    selectedRampId: null,
    tileW: TILE_W,
    tileH: TILE_H,
    frontFaceColor: FRONT_COLOR,
    eastFaceColor: EAST_COLOR,
    ...overrides,
  }
}

function gridWith(tiles: { col: number; row: number }[], cols = 8, rows = 8): Uint8Array {
  return paintTiles(createGrid(cols, rows), cols, tiles, FLOOR)
}

describe('buildIsoScene: flat tiles', () => {
  it('emits floor tiles in painter order (ascending col+row diagonal)', () => {
    // (5,0) has diagonal 5; (0,2) has diagonal 2 — despite row-major grid
    // order putting (5,0) first, the scene must emit (0,2) first.
    const grids = new Map([[0, gridWith([{ col: 5, row: 0 }, { col: 0, row: 2 }])]])
    const shapes = buildIsoScene(params({ grids }))
    expect(shapes.length).toBe(2)
    expect(shapes[0].points).toEqual(isoFloorPoints(0, 2, TILE_W, TILE_H))
    expect(shapes[1].points).toEqual(isoFloorPoints(5, 0, TILE_W, TILE_H))
    expect(shapes[0].fill).toBe(FLOOR_COLOR)
  })
})

describe('buildIsoScene: tile emission', () => {
  it('floor tops carry the standard tile stroke', () => {
    const grids = new Map([[0, gridWith([{ col: 1, row: 1 }])]])
    const shapes = buildIsoScene(params({ grids }))
    expect(shapes[0].stroke).toBe('rgba(0,0,0,0.15)')
    expect(shapes[0].strokeWidth).toBe(0.5)
  })

  it('water with show3D off emits only the sunken surface quad', () => {
    const grid = paintTiles(createGrid(8, 8), 8, [{ col: 2, row: 2 }], WATER)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: false }))
    expect(shapes.length).toBe(1)
    expect(shapes[0].points).toEqual(isoWaterPoints(2, 2, TILE_W, TILE_H))
    expect(shapes[0].fill).toBe(WATER_COLOR)
  })

  it('show3D water emits surface + south + east faces when surrounded by walls', () => {
    const grid = paintTiles(createGrid(8, 8), 8, [{ col: 2, row: 2 }], WATER)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    const waterFaceH = FACE_PX - WATER_OFFSET_Y
    expect(shapes.length).toBe(3)
    expect(shapes[0].points).toEqual(isoWaterPoints(2, 2, TILE_W, TILE_H))
    expect(shapes[0].fill).toBe(WATER_COLOR)
    expect(shapes[1].points).toEqual(shiftY(isoFrontFacePoints(2, 2, TILE_W, TILE_H, waterFaceH), WATER_OFFSET_Y))
    expect(shapes[1].fill).toBe(WATER_COLOR)
    expect(shapes[2].points).toEqual(shiftY(isoEastFacePoints(2, 2, TILE_W, TILE_H, waterFaceH), WATER_OFFSET_Y))
    expect(shapes[2].fill).toBe(WATER_COLOR)
  })

  it('show3D water has no face on the edge shared with an adjacent water tile', () => {
    let grid = paintTiles(createGrid(8, 8), 8, [{ col: 3, row: 3 }], WATER)
    grid = paintTiles(grid, 8, [{ col: 4, row: 3 }], WATER)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    // (3,3): surface + south face (wall to south), no east face (water to east) = 2 shapes
    // (4,3): surface + south face + east face = 3 shapes
    expect(shapes.length).toBe(5)
  })

  it('show3D water emits a south face toward an adjacent floor tile', () => {
    let grid = paintTiles(createGrid(8, 8), 8, [{ col: 3, row: 3 }], WATER)
    grid = paintTiles(grid, 8, [{ col: 3, row: 4 }], FLOOR)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    const waterFaceH = FACE_PX - WATER_OFFSET_Y
    // water(3,3): surface + south face (floor to south) + east face (wall to east) = 3 shapes
    // floor(3,4): top + south face (wall to south) + east face (wall to east) = 3 shapes
    expect(shapes.length).toBe(6)
    const southWaterFace = shiftY(isoFrontFacePoints(3, 3, TILE_W, TILE_H, waterFaceH), WATER_OFFSET_Y)
    expect(shapes.some(s => JSON.stringify(s.points) === JSON.stringify(southWaterFace) && s.fill === WATER_COLOR)).toBe(true)
  })

  it('show3D floor emits its south and east faces immediately after its top', () => {
    // single floor tile surrounded by wall: both faces exposed
    const grids = new Map([[0, gridWith([{ col: 3, row: 3 }])]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    expect(shapes.length).toBe(3)
    expect(shapes[0].points).toEqual(isoFloorPoints(3, 3, TILE_W, TILE_H))
    expect(shapes[1].points).toEqual(isoFrontFacePoints(3, 3, TILE_W, TILE_H, FACE_PX))
    expect(shapes[1].fill).toBe(FRONT_COLOR)
    expect(shapes[2].points).toEqual(isoEastFacePoints(3, 3, TILE_W, TILE_H, FACE_PX))
    expect(shapes[2].fill).toBe(EAST_COLOR)
  })

  it('no face on an edge shared with another floor tile', () => {
    // two floor tiles side by side: west tile has floor to its east -> only south face
    const grids = new Map([[0, gridWith([{ col: 3, row: 3 }, { col: 4, row: 3 }])]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    // tile (3,3): top + south face; tile (4,3): top + south + east faces
    expect(shapes.length).toBe(5)
    expect(shapes[1].points).toEqual(isoFrontFacePoints(3, 3, TILE_W, TILE_H, FACE_PX))
    expect(shapes[2].points).toEqual(isoFloorPoints(4, 3, TILE_W, TILE_H))
  })

  it('floor adjacent to water emits a bank face toward the water', () => {
    let grid = paintTiles(createGrid(8, 8), 8, [{ col: 3, row: 3 }], FLOOR)
    grid = paintTiles(grid, 8, [{ col: 3, row: 4 }], WATER)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    // floor (diag 7): top + south bank + east face; water (diag 8): quad — drawn after the bank
    const bankIndex = shapes.findIndex(s => JSON.stringify(s.points) === JSON.stringify(isoFrontFacePoints(3, 3, TILE_W, TILE_H, FACE_PX)))
    const waterIndex = shapes.findIndex(s => s.fill === WATER_COLOR)
    expect(bankIndex).toBeGreaterThan(-1)
    expect(waterIndex).toBeGreaterThan(bankIndex)
  })

  it('no faces at all when show3D is off', () => {
    const grids = new Map([[0, gridWith([{ col: 3, row: 3 }])]])
    expect(buildIsoScene(params({ grids, show3D: false })).length).toBe(1)
  })
})

describe('buildIsoScene: multiple z levels', () => {
  it('emits all lower-level shapes before any higher-level shapes', () => {
    const grids = new Map([
      [1, gridWith([{ col: 0, row: 0 }])],
      [0, gridWith([{ col: 7, row: 7 }])],
    ])
    const shapes = buildIsoScene(params({ grids }))
    expect(shapes.length).toBe(2)
    // z=0 tile first even though its diagonal (14) is far greater than z=1 tile (0)
    expect(shapes[0].points).toEqual(isoFloorPoints(7, 7, TILE_W, TILE_H))
  })

  it('bakes the z vertical offset into shape points', () => {
    const grids = new Map([[1, gridWith([{ col: 2, row: 2 }])]])
    const shapes = buildIsoScene(params({ grids }))
    const flat = isoFloorPoints(2, 2, TILE_W, TILE_H)
    shapes[0].points.forEach((v, i) => {
      expect(v).toBe(i % 2 === 1 ? flat[i] - Z_STEP_HEIGHT : flat[i])
    })
  })

  it('emits the wall background diamond first when wallOpacity > 0', () => {
    const grids = new Map([[0, gridWith([{ col: 0, row: 0 }])]])
    const shapes = buildIsoScene(params({ grids, wallColor: '#112233', wallOpacity: 0.8 }))
    expect(shapes.length).toBe(2)
    expect(shapes[0].fill).toBe('#112233')
    expect(shapes[0].opacity).toBe(0.8)
    const tl = isoProject(0, 0, TILE_W, TILE_H)
    const br = isoProject(8, 8, TILE_W, TILE_H)
    expect(shapes[0].points[0]).toBe(tl.x)
    expect(shapes[0].points[5]).toBe(br.y)
  })
})

describe('buildIsoScene: step runs', () => {
  const RUN: StepRun = { id: 'run1', col: 3, row: 3, z: 1, direction: 'E' }

  it('treads interleave with same-level tiles by painter depth', () => {
    // z=1: tile behind the stairs (2,3) diag 6, tile in front (5,3) diag 9.
    // Tread center diagonals run 6.67 .. 8.33 — strictly between the two.
    const grids = new Map([[1, gridWith([{ col: 2, row: 3 }, { col: 5, row: 3 }])]])
    const shapes = buildIsoScene(params({ grids, steps: [RUN] }))
    const behindIdx = shapes.findIndex(s => JSON.stringify(s.points) === JSON.stringify(offset(isoFloorPoints(2, 3, TILE_W, TILE_H))))
    const frontIdx = shapes.findIndex(s => JSON.stringify(s.points) === JSON.stringify(offset(isoFloorPoints(5, 3, TILE_W, TILE_H))))
    const treadIdxs = shapes.flatMap((s, i) => (s.stepId === 'run1' ? [i] : []))
    expect(treadIdxs.length).toBeGreaterThan(0)
    expect(behindIdx).toBeGreaterThan(-1)
    expect(frontIdx).toBeGreaterThan(-1)
    expect(Math.min(...treadIdxs)).toBeGreaterThan(behindIdx)
    expect(Math.max(...treadIdxs)).toBeLessThan(frontIdx)
  })

  it('every tread shape carries its run id', () => {
    const shapes = buildIsoScene(params({ steps: [RUN], grids: new Map([[1, gridWith([])]]) }))
    expect(shapes.length).toBe(STEP_TREAD_COUNT * 2) // riser + top per tread, no 3D
    expect(shapes.every(s => s.stepId === 'run1')).toBe(true)
  })

  it('with 3D each tread emits side face, riser, then top', () => {
    const shapes = buildIsoScene(params({ steps: [RUN], grids: new Map([[1, gridWith([])]]), show3D: true }))
    expect(shapes.length).toBe(STEP_TREAD_COUNT * 3)
    expect(shapes[0].fill).toBe(FRONT_COLOR) // side face (south, E run)
    expect(shapes[1].fill).toBe(FRONT_COLOR) // riser
    expect(shapes[2].fill).toBe(FLOOR_COLOR)          // top
  })

  it('selected run treads get the selection stroke', () => {
    const shapes = buildIsoScene(params({ steps: [RUN], grids: new Map([[1, gridWith([])]]), selectedStepId: 'run1' }))
    const tops = shapes.filter(s => s.fill === FLOOR_COLOR)
    expect(tops.every(s => s.stroke === '#ffff00')).toBe(true)
  })

  it('tread points carry the z=1 vertical offset', () => {
    const shapes = buildIsoScene(params({ steps: [RUN], grids: new Map([[1, gridWith([])]]) }))
    const localTreads = isoStepTreads(RUN, TILE_W, TILE_H)
    expect(shapes[1].points).toEqual(localTreads[0].top.map((v, i) => (i % 2 === 1 ? v - Z_STEP_HEIGHT : v)))
  })
})

describe('buildIsoScene: steps across levels', () => {
  it('the entire landing level draws before any tread of the level above', () => {
    const grids = new Map([
      [0, gridWith([{ col: 7, row: 7 }, { col: 4, row: 3 }])], // includes max-diagonal tile
      [1, gridWith([{ col: 2, row: 3 }])],
    ])
    const run: StepRun = { id: 'r', col: 3, row: 3, z: 1, direction: 'E' }
    const shapes = buildIsoScene(params({ grids, steps: [run] }))
    const lastZ0 = shapes.map((s, i) => ({ s, i })).filter(({ s }) => !s.stepId && JSON.stringify(s.points).includes(JSON.stringify(isoFloorPoints(7, 7, TILE_W, TILE_H)[0])))
    const firstTread = shapes.findIndex(s => s.stepId === 'r')
    expect(lastZ0.length).toBeGreaterThan(0)
    expect(firstTread).toBeGreaterThan(lastZ0[lastZ0.length - 1].i)
  })

  it('a run on a z level with no painted grid still renders', () => {
    const grids = new Map([[0, gridWith([{ col: 3, row: 3 }])]])
    const run: StepRun = { id: 'lonely', col: 3, row: 3, z: 2, direction: 'S' }
    const shapes = buildIsoScene(params({ grids, steps: [run] }))
    const treads = shapes.filter(s => s.stepId === 'lonely')
    expect(treads.length).toBe(STEP_TREAD_COUNT * 2)
    // offset for z=2 baked in
    const local = isoStepTreads(run, TILE_W, TILE_H)
    expect(treads[1].points).toEqual(local[0].top.map((v, i) => (i % 2 === 1 ? v - 2 * Z_STEP_HEIGHT : v)))
  })
})

describe('buildIsoScene: ramps', () => {
  const RAMP: RampRun = { id: 'ramp1', col: 3, row: 3, z: 1, direction: 'E' }

  it('emits a single surface shape carrying the ramp id', () => {
    const shapes = buildIsoScene(params({ ramps: [RAMP], grids: new Map([[1, gridWith([])]]) }))
    const rampShapes = shapes.filter(s => s.rampId === 'ramp1')
    expect(rampShapes.length).toBe(1) // surface only, no 3D
    expect(rampShapes[0].fill).toBe(FLOOR_COLOR)
  })

  it('surface points carry the z=1 vertical offset', () => {
    const shapes = buildIsoScene(params({ ramps: [RAMP], grids: new Map([[1, gridWith([])]]) }))
    const surface = shapes.find(s => s.rampId === 'ramp1' && s.fill === FLOOR_COLOR)!
    const local = isoRampSurface(RAMP, TILE_W, TILE_H)
    expect(surface.points).toEqual(local.map((v, i) => (i % 2 === 1 ? v - Z_STEP_HEIGHT : v)))
  })

  it('with 3D emits the wedge side face beneath the surface', () => {
    const shapes = buildIsoScene(params({ ramps: [RAMP], grids: new Map([[1, gridWith([])]]), show3D: true }))
    const rampShapes = shapes.filter(s => s.rampId === 'ramp1')
    expect(rampShapes.length).toBe(2)
    expect(rampShapes[0].fill).toBe(FRONT_COLOR) // south wedge for an E run, drawn first
    expect(rampShapes[1].fill).toBe(FLOOR_COLOR)          // surface on top
  })

  it('selected ramp surface gets the selection stroke', () => {
    const shapes = buildIsoScene(params({ ramps: [RAMP], grids: new Map([[1, gridWith([])]]), selectedRampId: 'ramp1' }))
    const surface = shapes.find(s => s.rampId === 'ramp1' && s.fill === FLOOR_COLOR)!
    expect(surface.stroke).toBe('#ffff00')
  })

  it('interleaves with same-level tiles by painter depth', () => {
    // tile behind (2,3) diag 6, tile in front (5,3) diag 9; ramp center diag ~7.5
    const grids = new Map([[1, gridWith([{ col: 2, row: 3 }, { col: 5, row: 3 }])]])
    const shapes = buildIsoScene(params({ grids, ramps: [RAMP] }))
    const behindIdx = shapes.findIndex(s => JSON.stringify(s.points) === JSON.stringify(offset(isoFloorPoints(2, 3, TILE_W, TILE_H))))
    const frontIdx = shapes.findIndex(s => JSON.stringify(s.points) === JSON.stringify(offset(isoFloorPoints(5, 3, TILE_W, TILE_H))))
    const rampIdx = shapes.findIndex(s => s.rampId === 'ramp1')
    expect(rampIdx).toBeGreaterThan(behindIdx)
    expect(rampIdx).toBeLessThan(frontIdx)
  })
})
