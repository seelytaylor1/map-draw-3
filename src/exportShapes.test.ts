import { describe, it, expect } from 'vitest'
import { buildExportShapes } from './exportShapes'
import { createGrid, paintTiles } from './grid'
import { FLOOR, FLOOR_COLOR, WATER, WATER_COLOR } from './constants'
import { isoFloorPoints, isoFrontFacePoints, isoEastFacePoints, isoProject } from './iso'
import { type Stamp } from './stamps'

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

// ── Water tiles ───────────────────────────────────────────────────────────────

describe('buildExportShapes – water tiles (top-down)', () => {
  it('water tile at (1,1) produces a rect with WATER_COLOR fill', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 1, row: 1 }], WATER)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid) })
    const water = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === WATER_COLOR)
    expect(water).toBeDefined()
    expect(water).toMatchObject({ x: ET, y: ET, w: ET, h: ET })
  })

  it('water tile does not produce a FLOOR_COLOR rect', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 1, row: 1 }], WATER)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid) })
    const floor = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === FLOOR_COLOR)
    expect(floor).toBeUndefined()
  })

  it('floor and water tiles can coexist in the same export', () => {
    let grid = createGrid(3, 3)
    grid = paintTiles(grid, 3, [{ col: 0, row: 0 }], FLOOR)
    grid = paintTiles(grid, 3, [{ col: 1, row: 1 }], WATER)
    const { shapes } = buildExportShapes({ ...baseParams(3, 3, grid) })
    const floorRect = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === FLOOR_COLOR)
    const waterRect = shapes.find(s => s.kind === 'rect' && 'fill' in s && s.fill === WATER_COLOR)
    expect(floorRect).toBeDefined()
    expect(waterRect).toBeDefined()
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

  it('ISO stamp uses natural tile size (ET×ET), not doubled width', () => {
    const stamp = { id: 'x', type: 'star' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img).toBeDefined()
    expect(img.w).toBe(ET)
    expect(img.h).toBe(ET)
  })

  it('ISO stamp center position matches isoProject of tile center', () => {
    const stamp = { id: 'x', type: 'star' as const, col: 2, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    const expected = isoProject(stamp.col + 0.5, stamp.row + 0.5, ITW, ITH)
    expect(img.x).toBe(expected.x)
    expect(img.y).toBe(expected.y)
  })

  it('ISO stamp rotation=0 gets iso floor projection: rotation≈26.6°, scaleX, scaleY, skewX≈-0.6', () => {
    const stamp = { id: 'x', type: 'star' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img.rotation).toBeCloseTo(Math.atan(0.5) * 180 / Math.PI, 2)
    expect(img.scaleX).toBeCloseTo(Math.sqrt(5) / 2, 4)
    expect(img.scaleY).toBeCloseTo(2 / Math.sqrt(5), 4)
    expect(img.skewX).toBeCloseTo(-0.6, 4)
  })

  it('ISO stamp rotation=90 gets different iso rotation and skewX≈+0.6', () => {
    const stamp = { id: 'x', type: 'star' as const, col: 1, row: 1, rotation: 90 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    const ISO_ANGLE = Math.atan(0.5) * 180 / Math.PI
    expect(img.rotation).toBeCloseTo(180 - ISO_ANGLE, 2)
    expect(img.skewX).toBeCloseTo(0.6, 4)
  })
})

// ── Object stamp export behaviour ─────────────────────────────────────────────

describe('buildExportShapes – object stamps', () => {
  const ITW = ET * 2
  const ITH = ET

  it('flat export: object stamp (archway) produces no image shapes', () => {
    const stamp = { id: 'a', type: 'archway' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps: [stamp] })
    const imgs = shapes.filter(s => s.kind === 'image')
    expect(imgs).toHaveLength(0)
  })

  it('flat export: floor stamp (star) still appears when mixed with object stamp', () => {
    const stamps = [
      { id: 'a', type: 'archway' as const, col: 0, row: 0, rotation: 0 as const },
      { id: 's', type: 'star' as const, col: 1, row: 1, rotation: 0 as const },
    ]
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps })
    const imgs = shapes.filter(s => s.kind === 'image')
    expect(imgs).toHaveLength(1)
    expect((imgs[0] as any).stampType).toBe('star')
  })

  it('ISO export: object stamp appears as an image shape', () => {
    const stamp = { id: 'a', type: 'archway' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const imgs = shapes.filter(s => s.kind === 'image')
    expect(imgs).toHaveLength(1)
    expect((imgs[0] as any).stampType).toBe('archway')
  })

  it('ISO export: object stamp is billboard — no scaleX, no skewX, rotation=0', () => {
    const stamp = { id: 'a', type: 'archway' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img.rotation).toBe(0)
    expect(img.scaleX).toBeUndefined()
    expect(img.skewX).toBeUndefined()
  })

  it('ISO export: object stamp base anchored at tile bottom corner (x=center.x, y=bottom.y)', () => {
    const stamp = { id: 'a', type: 'archway' as const, col: 2, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    const center = isoProject(stamp.col + 0.5, stamp.row + 0.5, ITW, ITH)
    const bottom = isoProject(stamp.col + 1, stamp.row + 1, ITW, ITH)
    expect(img.x).toBe(center.x)
    expect(img.y).toBe(bottom.y)
    expect(img.w).toBe(ITW)
    expect(img.offsetX).toBe(img.w / 2)
    expect(img.offsetY).toBe(img.h)
  })
})

// ── Stamp scale ───────────────────────────────────────────────────────────────

describe('buildExportShapes – stamp scale', () => {
  it('top-down: a floor stamp at scale 2 doubles its rendered w and h', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const, scale: 2 }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img).toBeDefined()
    expect(img.w).toBe(ET * 2)
    expect(img.h).toBe(ET * 2)
  })

  it('top-down: a floor stamp at scale 0.5 halves its rendered w and h', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const, scale: 0.5 }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img.w).toBe(ET * 0.5)
    expect(img.h).toBe(ET * 0.5)
  })

  it('top-down: a floor stamp with no scale uses default size', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as any
    expect(img.w).toBe(ET)
    expect(img.h).toBe(ET)
  })
})

// ── Stamp mirrored ────────────────────────────────────────────────────────────

describe('buildExportShapes – stamp mirrored', () => {
  it('top-down mirrored stamp has mirrored: true in image spec', () => {
    const stamp: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0, mirrored: true }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec | undefined
    expect(img?.mirrored).toBe(true)
  })

  it('top-down un-mirrored stamp has mirrored falsy', () => {
    const stamp: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0 }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec | undefined
    expect(img?.mirrored).toBeFalsy()
  })

  it('iso floor mirrored stamp has negated scaleX vs un-mirrored', () => {
    const base: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0 }
    const mirrored: Stamp = { ...base, mirrored: true }
    const normalShapes = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [base] }).shapes
    const mirroredShapes = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [mirrored] }).shapes
    const normalImg = normalShapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec
    const mirroredImg = mirroredShapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec
    expect(mirroredImg.scaleX).toBe(-(normalImg.scaleX!))
  })

  it('iso billboard mirrored stamp has mirrored: true in image spec', () => {
    const stamp: Stamp = { id: 'a', type: 'archway', col: 0, row: 0, rotation: 0, mirrored: true }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec | undefined
    expect(img?.mirrored).toBe(true)
  })
})
