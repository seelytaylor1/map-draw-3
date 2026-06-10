import { describe, expect, it } from 'vitest'
import { buildIsoScene, type IsoSceneParams } from './isoScene'
import { createGrid, paintTiles } from './grid'
import { isoFloorPoints } from './iso'
import { FLOOR, FLOOR_COLOR } from './constants'
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
