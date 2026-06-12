// src/topDownScene.test.ts
import { describe, expect, it } from 'vitest'
import { buildTopDownShapes } from './topDownScene'
import { createGrid, paintTiles } from './grid'
import { FLOOR, WATER, type TileState } from './constants'

function grid(cols: number, rows: number, tiles: { col: number; row: number }[], state: TileState = FLOOR) {
  return paintTiles(createGrid(cols, rows), cols, tiles, state)
}

describe('buildTopDownShapes: tile emission', () => {
  it('emits a floor shape for each painted floor tile', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes).toContainEqual({ kind: 'floor', col: 1, row: 1 })
  })

  it('emits a water shape for each painted water tile', () => {
    const g = grid(3, 3, [{ col: 0, row: 0 }], WATER)
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes).toContainEqual({ kind: 'water', col: 0, row: 0 })
  })

  it('emits nothing for wall tiles', () => {
    const g = createGrid(3, 3) // all wall
    expect(buildTopDownShapes(g, 3, 3, false)).toEqual([])
  })
})

describe('buildTopDownShapes: 3D faces', () => {
  it('emits no face shapes when show3D is false', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes.filter(s => s.kind === 'face')).toEqual([])
  })

  it('emits a south face when floor is adjacent to wall at row+1', () => {
    // floor at (1,1); (1,2) is wall by default
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 1, side: 'south' })
  })

  it('emits an east face when floor is adjacent to wall at col+1', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 1, side: 'east' })
  })

  it('does not emit a south face when floor neighbor to the south is also floor', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }, { col: 1, row: 2 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).not.toContainEqual({ kind: 'face', col: 1, row: 1, side: 'south' })
  })

  it('does not emit an east face when floor neighbor to the east is also floor', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).not.toContainEqual({ kind: 'face', col: 1, row: 1, side: 'east' })
  })

  it('emits a south face at the bottom map boundary', () => {
    const g = grid(3, 3, [{ col: 1, row: 2 }]) // bottom row
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 2, side: 'south' })
  })

  it('emits an east face at the right map boundary', () => {
    const g = grid(3, 3, [{ col: 2, row: 1 }]) // rightmost col
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 2, row: 1, side: 'east' })
  })
})

describe('buildTopDownShapes: shape ordering', () => {
  it('face shapes come after floor shape for the same tile (so they draw on top)', () => {
    const g = grid(3, 3, [{ col: 0, row: 0 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    const floorIdx = shapes.findIndex(s => s.kind === 'floor' && s.col === 0 && s.row === 0)
    const faceIdx = shapes.findIndex(s => s.kind === 'face' && s.col === 0 && s.row === 0)
    expect(floorIdx).toBeLessThan(faceIdx)
  })
})
