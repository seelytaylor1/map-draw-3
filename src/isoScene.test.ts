import { describe, expect, it } from 'vitest'
import { buildIsoScene, type IsoSceneParams } from './isoScene'
import { createGrid, paintTiles } from './grid'
import { isoEastFacePoints, isoFloorPoints, isoFrontFacePoints, isoWaterPoints } from './iso'
import { FACE_PX, FLOOR, FLOOR_COLOR, ISO_EAST_FACE_COLOR, ISO_FRONT_FACE_COLOR, WATER, WATER_COLOR } from './constants'
import { type StepRun } from './steps'

const TILE_W = 40
const TILE_H = 20

function params(overrides: Partial<IsoSceneParams> = {}): IsoSceneParams {
  return {
    grids: new Map(),
    steps: [] as StepRun[],
    cols: 8,
    rows: 8,
    show3D: false,
    wallColor: '#000000',
    wallOpacity: 0,
    selectedStepId: null,
    tileW: TILE_W,
    tileH: TILE_H,
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

  it('water emits the sunken water quad with no faces', () => {
    const grid = paintTiles(createGrid(8, 8), 8, [{ col: 2, row: 2 }], WATER)
    const grids = new Map([[0, grid]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    expect(shapes.length).toBe(1)
    expect(shapes[0].points).toEqual(isoWaterPoints(2, 2, TILE_W, TILE_H))
    expect(shapes[0].fill).toBe(WATER_COLOR)
  })

  it('show3D floor emits its south and east faces immediately after its top', () => {
    // single floor tile surrounded by wall: both faces exposed
    const grids = new Map([[0, gridWith([{ col: 3, row: 3 }])]])
    const shapes = buildIsoScene(params({ grids, show3D: true }))
    expect(shapes.length).toBe(3)
    expect(shapes[0].points).toEqual(isoFloorPoints(3, 3, TILE_W, TILE_H))
    expect(shapes[1].points).toEqual(isoFrontFacePoints(3, 3, TILE_W, TILE_H, FACE_PX))
    expect(shapes[1].fill).toBe(ISO_FRONT_FACE_COLOR)
    expect(shapes[2].points).toEqual(isoEastFacePoints(3, 3, TILE_W, TILE_H, FACE_PX))
    expect(shapes[2].fill).toBe(ISO_EAST_FACE_COLOR)
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
