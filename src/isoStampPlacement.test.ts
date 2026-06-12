/**
 * Diagnostic tests for ISO stamp placement correctness.
 *
 * These tests do NOT take screenshots — they verify the mathematical invariants
 * that must hold for stamps to appear in the right place in ISO view:
 *
 *   A) Floor stamp projected corners land on tile diamond corners (rotation=0)
 *   B) Object stamp base (bottom-center) anchors at the tile's front-bottom y
 *   C) Click→tile round-trip: clicking at a tile's iso center resolves to that tile
 *   D) Export ImageSpec x/y matches isoProject of stamp tile center
 *
 * When a placement bug is present, run these tests first — whichever assertion
 * fails tells you exactly which invariant is broken.
 */

import { describe, it, expect } from 'vitest'
import { isoProject, isoUnproject } from './iso'
import { buildExportShapes } from './exportShapes'
import { createGrid } from './grid'
import type { ImageSpec } from './exportShapes'

const T = 60     // export tile size — same as handleExport uses
const ITW = T * 2
const ITH = T

function baseParams(cols = 4, rows = 4) {
  return {
    grid: createGrid(cols, rows),
    cols, rows,
    showIso: true,
    show3D: false,
    showGrid: false,
    wallColor: '#000000',
    wallOpacity: 0,
    stamps: [] as any[],
    exportTile: T,
  }
}

/**
 * Apply the iso floor projection to a pixel (px, py) in stamp-local space
 * (centred at origin, stamp is T×T pixels representing 1 tile).
 *
 * Derivation: pixel (px,py) represents tile offset (px/T, py/T).
 * isoProject gives screen offset (dc-dr)*ITW/2, (dc+dr)*ITH/2.
 * With ITW=2T, ITH=T this simplifies to (px-py, (px+py)/2).
 */
function projectStampPixel(px: number, py: number): { x: number; y: number } {
  return { x: px - py, y: (px + py) / 2 }
}

// ── A: Floor stamp projected corners land on tile diamond corners ───────────

describe('ISO floor stamp – projected corners (rotation=0)', () => {
  const col = 2
  const row = 1
  const center = isoProject(col + 0.5, row + 0.5, ITW, ITH)

  const tileCorners = {
    top:    isoProject(col,     row,     ITW, ITH),
    right:  isoProject(col + 1, row,     ITW, ITH),
    bottom: isoProject(col + 1, row + 1, ITW, ITH),
    left:   isoProject(col,     row + 1, ITW, ITH),
  }

  // Stamp corners in local space (T×T, centred at origin)
  const stampCorners = [
    { label: 'top-left',  px: -T / 2, py: -T / 2 },
    { label: 'top-right', px:  T / 2, py: -T / 2 },
    { label: 'bot-right', px:  T / 2, py:  T / 2 },
    { label: 'bot-left',  px: -T / 2, py:  T / 2 },
  ]

  const expectedDiamondCorners = [tileCorners.top, tileCorners.right, tileCorners.bottom, tileCorners.left]

  stampCorners.forEach(({ label, px, py }, i) => {
    it(`stamp corner ${label} projects onto tile diamond corner ${['top','right','bottom','left'][i]}`, () => {
      const { x: dx, y: dy } = projectStampPixel(px, py)
      const worldX = center.x + dx
      const worldY = center.y + dy
      expect(worldX).toBeCloseTo(expectedDiamondCorners[i].x, 4)
      expect(worldY).toBeCloseTo(expectedDiamondCorners[i].y, 4)
    })
  })
})

// ── B: Object stamp base anchored at tile front-bottom y ─────────────────────

describe('ISO object stamp – base anchor', () => {
  /**
   * A billboard object stamp should have its bottom-center at the LOWEST
   * visible point of the tile floor — the bottom corner of the diamond.
   * That point is isoProject(col+1, row+1), and its y-coord is the max-y of
   * all four diamond corners.
   *
   * The current export spec uses iso = isoProject(col+0.5, row+0.5) as the
   * anchor, setting offsetY = h so the image bottom is at iso.y.
   * This test documents what the anchor y SHOULD be.
   */

  for (const [col, row] of [[0, 0], [2, 1], [3, 3]]) {
    it(`stamp at (${col},${row}): export image bottom-y equals tile bottom-corner y`, () => {
      const stamp = { id: 'a', type: 'archway' as const, col, row, rotation: 0 as const, z: 0 }
      const { shapes } = buildExportShapes({ ...baseParams(), stamps: [stamp] })
      const img = shapes.find(s => s.kind === 'image') as ImageSpec | undefined
      expect(img).toBeDefined()

      // The bottom of the image in Konva = y + h - offsetY  (offsetY shifts the pivot)
      const imageBottomY = img!.y + img!.h - img!.offsetY

      // Expected: the bottom corner of the tile diamond
      const expectedBottomY = isoProject(col + 1, row + 1, ITW, ITH).y

      expect(imageBottomY).toBeCloseTo(expectedBottomY, 4)
    })
  }
})

// ── C: Click→tile round-trip ─────────────────────────────────────────────────

describe('ISO click→tile round-trip', () => {
  /**
   * Clicking at the iso-projected center of tile (c,r) should unproject to a
   * fractional (col,row) that floors to exactly (c,r).
   */

  const cases = [
    [0, 0], [1, 0], [0, 1], [3, 2], [0, 3], [3, 0],
  ] as [number, number][]

  for (const [c, r] of cases) {
    it(`click at center of tile (${c},${r}) unprojected and floored gives (${c},${r})`, () => {
      const center = isoProject(c + 0.5, r + 0.5, ITW, ITH)
      const { col: fc, row: fr } = isoUnproject(center.x, center.y, ITW, ITH)
      expect(Math.floor(fc)).toBe(c)
      expect(Math.floor(fr)).toBe(r)
    })
  }

  it('click exactly on a diamond corner resolves to the same tile as the interior', () => {
    // The "top" corner of tile (2,1) is shared by four tiles; Math.floor should give (2,1).
    const topCorner = isoProject(2, 1, ITW, ITH)
    // Slightly inside the tile from the top corner
    const slightlyInside = { x: topCorner.x + 0.01, y: topCorner.y + 0.01 }
    const { col: fc, row: fr } = isoUnproject(slightlyInside.x, slightlyInside.y, ITW, ITH)
    expect(Math.floor(fc)).toBe(2)
    expect(Math.floor(fr)).toBe(1)
  })
})

// ── D: Export ImageSpec position matches isoProject of tile center ────────────

describe('ISO floor stamp – export ImageSpec x/y', () => {
  for (const [col, row] of [[0, 0], [1, 2], [3, 3]]) {
    it(`floor stamp at (${col},${row}) has x/y = isoProject(col+0.5, row+0.5)`, () => {
      const stamp = { id: 'x', type: 'star' as const, col, row, rotation: 0 as const, z: 0 }
      const { shapes } = buildExportShapes({ ...baseParams(), stamps: [stamp] })
      const img = shapes.find(s => s.kind === 'image') as ImageSpec | undefined
      expect(img).toBeDefined()
      const expected = isoProject(col + 0.5, row + 0.5, ITW, ITH)
      expect(img!.x).toBeCloseTo(expected.x, 4)
      expect(img!.y).toBeCloseTo(expected.y, 4)
    })
  }
})

// ── E: Floor stamp centre stays at tile centre after rotation ─────────────────

describe('ISO floor stamp – group origin stays at tile centre for all rotations', () => {
  /**
   * isoStampTransform rotates the stamp image but the GROUP is always
   * positioned at isoProject(col+0.5, row+0.5). So img.x and img.y in the
   * export spec should always equal that point regardless of rotation.
   */
  const col = 2
  const row = 1

  for (const rotation of [0, 90, 180, 270] as const) {
    it(`rotation=${rotation}: export x/y still at tile iso-center`, () => {
      const stamp = { id: 'x', type: 'star' as const, col, row, rotation, z: 0 }
      const { shapes } = buildExportShapes({ ...baseParams(), stamps: [stamp] })
      const img = shapes.find(s => s.kind === 'image') as ImageSpec | undefined
      expect(img).toBeDefined()
      const expected = isoProject(col + 0.5, row + 0.5, ITW, ITH)
      expect(img!.x).toBeCloseTo(expected.x, 4)
      expect(img!.y).toBeCloseTo(expected.y, 4)
    })
  }
})
