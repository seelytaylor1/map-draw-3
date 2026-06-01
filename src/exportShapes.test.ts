import { describe, it, expect } from 'vitest'
import { buildExportShapes } from './exportShapes'
import { createGrid, paintTiles } from './grid'
import { FLOOR, FLOOR_COLOR } from './constants'
import { isoFloorPoints, isoFrontFacePoints, isoEastFacePoints } from './iso'

const ET = 60 // export tile size

function baseParams(cols: number, rows: number, grid?: Uint8Array) {
  return {
    grid: grid ?? createGrid(cols, rows),
    cols,
    rows,
    showIso: false,
    show3D: false,
    showGrid: false,
    wallColor: '#000000',
    wallOpacity: 0,
    stamps: [],
    exportTile: ET,
  }
}

// ── Top-down mode ─────────────────────────────────────────────────────────────

describe('buildExportShapes – top-down', () => {
  it('tracer bullet: floor tile at (1,1) produces a rect at col*ET, row*ET', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 1, row: 1 }], FLOOR)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid) })
    const floor = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === FLOOR_COLOR)
    expect(floor).toMatchObject({ x: ET, y: ET, w: ET, h: ET })
  })

  it('canvas size equals cols*ET × rows*ET', () => {
    const { canvasW, canvasH } = buildExportShapes(baseParams(5, 4))
    expect(canvasW).toBe(5 * ET)
    expect(canvasH).toBe(4 * ET)
  })

  it('wall background rect covers full canvas when wallOpacity > 0', () => {
    const { shapes, canvasW, canvasH } = buildExportShapes({ ...baseParams(3, 3), wallOpacity: 1, wallColor: '#ff0000' })
    const bg = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === '#ff0000')
    expect(bg).toMatchObject({ x: 0, y: 0, w: canvasW, h: canvasH })
  })

  it('omits wall background rect when wallOpacity is 0', () => {
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), wallOpacity: 0, wallColor: '#000000' })
    const bg = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === '#000000')
    expect(bg).toBeUndefined()
  })
})

// ── ISO mode ──────────────────────────────────────────────────────────────────

describe('buildExportShapes – ISO mode', () => {
  const ITW = ET * 2
  const ITH = ET

  it('tracer bullet: floor tile produces a polygon, not a rect', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 0, row: 0 }], FLOOR)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid), showIso: true })
    const floorPoly = shapes.find(s => s.kind === 'polygon')
    expect(floorPoly).toBeDefined()
    const floorRect = shapes.find(s => s.kind === 'rect' && 'fill' in s && (s as any).fill === FLOOR_COLOR)
    expect(floorRect).toBeUndefined()
  })

  it('ISO canvas width is (cols+rows)*ET', () => {
    const { canvasW } = buildExportShapes({ ...baseParams(5, 4), showIso: true })
    expect(canvasW).toBe((5 + 4) * ET)
  })

  it('ISO canvas height is (cols+rows)*ET/2', () => {
    const { canvasH } = buildExportShapes({ ...baseParams(5, 4), showIso: true })
    expect(canvasH).toBe((5 + 4) * ET / 2)
  })

  it('ISO offsetX equals rows*ET so that negative iso-x becomes positive', () => {
    const { offsetX } = buildExportShapes({ ...baseParams(5, 4), showIso: true })
    expect(offsetX).toBe(4 * ET)
  })

  it('floor tile (0,0) polygon points match isoFloorPoints(0,0,ITW,ITH)', () => {
    const grid = paintTiles(createGrid(2, 2), 2, [{ col: 0, row: 0 }], FLOOR)
    const { shapes } = buildExportShapes({ ...baseParams(2, 2, grid), showIso: true })
    const poly = shapes.find(s => s.kind === 'polygon') as any
    expect(poly).toBeDefined()
    expect(poly.points).toEqual(isoFloorPoints(0, 0, ITW, ITH))
  })

  it('floor tile (1,0) polygon points match isoFloorPoints(1,0,ITW,ITH)', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 1, row: 0 }], FLOOR)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid), showIso: true })
    const poly = shapes.find(s => s.kind === 'polygon') as any
    expect(poly).toBeDefined()
    expect(poly.points).toEqual(isoFloorPoints(1, 0, ITW, ITH))
  })

  it('ISO + show3D: south wall produces a front-face polygon', () => {
    // tile at (0,0) with no tile below — has a south wall
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 0, row: 0 }], FLOOR)
    const FACE = Math.round(8 * ET / 20) // FACE_PX scaled to export tile
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid), showIso: true, show3D: true })
    const polys = shapes.filter(s => s.kind === 'polygon') as any[]
    const frontFace = polys.find(p => JSON.stringify(p.points) === JSON.stringify(isoFrontFacePoints(0, 0, ITW, ITH, FACE)))
    expect(frontFace).toBeDefined()
  })

  it('ISO + show3D: east wall produces an east-face polygon', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 0, row: 0 }], FLOOR)
    const FACE = Math.round(8 * ET / 20)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid), showIso: true, show3D: true })
    const polys = shapes.filter(s => s.kind === 'polygon') as any[]
    const eastFace = polys.find(p => JSON.stringify(p.points) === JSON.stringify(isoEastFacePoints(0, 0, ITW, ITH, FACE)))
    expect(eastFace).toBeDefined()
  })
})
