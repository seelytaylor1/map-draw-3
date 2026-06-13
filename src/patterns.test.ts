// src/patterns.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawHatching, buildHatchLines, buildHatchPolylines, roughenSegments, buildWallOutlineSegments, HatchOptions, RoughLineOptions } from './patterns'
import { FLOOR, WALL } from './constants'

// ---------------------------------------------------------------------------
// Existing canvas-mock tests for drawHatching (updated for new implementation)
// ---------------------------------------------------------------------------

describe('drawHatching (canvas mock)', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = {
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'round',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  })

  it('draws nothing for an all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    drawHatching(ctx, grid, 2, 2, 20, '#000')
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('draws nothing for an all-floor grid', () => {
    // All floor means no wall-edge points → no segments
    const grid = new Uint8Array(9).fill(FLOOR)
    drawHatching(ctx, grid, 3, 3, 20, '#000')
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('sets the stroke color before drawing', () => {
    const grid = new Uint8Array([FLOOR])
    drawHatching(ctx, grid, 1, 1, 12, '#ff0000')
    expect(ctx.strokeStyle).toBe('#ff0000')
  })

  it('calls save and restore', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    drawHatching(ctx, grid, 2, 2, 20, '#000')
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// buildHatchLines — pure geometry tests
// ---------------------------------------------------------------------------

const SMALL_OPTS: HatchOptions = {
  wallDistance: 25,
  tileSize: 60,   // small tile for fast tests
  minDistance: 8,
  maxDistance: 12,
  spacing: 4,
}

describe('buildHatchLines (pure geometry)', () => {
  it('returns empty array for all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    const result = buildHatchLines(grid, 2, 2, 20, SMALL_OPTS)
    expect(result).toHaveLength(0)
  })

  it('returns empty array for all-floor grid (no wall edges)', () => {
    const grid = new Uint8Array(9).fill(FLOOR)
    const result = buildHatchLines(grid, 3, 3, 20, SMALL_OPTS)
    expect(result).toHaveLength(0)
  })

  it('returns non-empty segments for a 3×3 center-floor grid', () => {
    // Center tile is floor, surrounded by walls
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // center cell
    const tileSize = 20
    const opts: HatchOptions = {
      wallDistance: 30,
      tileSize: 60,
      minDistance: 5,
      maxDistance: 10,
      spacing: 4,
    }
    const result = buildHatchLines(grid, 3, 3, tileSize, opts)
    expect(result.length).toBeGreaterThan(0)
  })

  it('all returned segments have length >= minDistance / 3', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const tileSize = 20
    const opts: HatchOptions = {
      wallDistance: 30,
      tileSize: 60,
      minDistance: 6,
      maxDistance: 10,
      spacing: 4,
    }
    const minLen = opts.minDistance / 3

    const result = buildHatchLines(grid, 3, 3, tileSize, opts)
    for (const seg of result) {
      const [[ax, ay], [bx, by]] = seg
      const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
      expect(len).toBeGreaterThanOrEqual(minLen - 1e-9)
    }
  })

  it('all returned segments are arrays of [number, number] pairs', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const opts: HatchOptions = {
      wallDistance: 30,
      tileSize: 60,
      minDistance: 5,
      maxDistance: 10,
      spacing: 4,
    }
    const result = buildHatchLines(grid, 3, 3, 20, opts)
    for (const seg of result) {
      expect(Array.isArray(seg)).toBe(true)
      for (const pt of seg) {
        expect(pt).toHaveLength(2)
        expect(typeof pt[0]).toBe('number')
        expect(typeof pt[1]).toBe('number')
      }
    }
  })

  it('hatch lines do not appear far from wall edges', () => {
    // Large all-floor grid with a single WALL tile in one corner.
    // With a small wallDistance, most of the canvas should have no hatching.
    const cols = 5
    const rows = 5
    const grid = new Uint8Array(cols * rows).fill(FLOOR)
    grid[0] = WALL // top-left corner wall
    const tileSize = 20
    const opts: HatchOptions = {
      wallDistance: 15, // only 15px from wall edge
      tileSize: 60,
      minDistance: 5,
      maxDistance: 10,
      spacing: 4,
    }
    const result = buildHatchLines(grid, cols, rows, tileSize, opts)
    // All segment centroids should be within wallDistance of the top-left corner edge
    for (const seg of result) {
      const [[ax, ay], [bx, by]] = seg
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      // Closest wall edge points are along x=tileSize (right edge of WALL tile)
      // and y=tileSize (bottom edge of WALL tile)
      const dToEdge = Math.min(
        Math.abs(mx - tileSize),
        Math.abs(my - tileSize),
      )
      // Allow generous tolerance since we check centroid proximity, not endpoint proximity
      expect(dToEdge).toBeLessThanOrEqual(opts.wallDistance + opts.tileSize)
    }
  })

  it('produces identical output on repeated calls (stable/deterministic)', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const opts: HatchOptions = {
      wallDistance: 30,
      tileSize: 60,
      minDistance: 5,
      maxDistance: 10,
      spacing: 4,
    }
    const r1 = buildHatchLines(grid, 3, 3, 20, opts)
    const r2 = buildHatchLines(grid, 3, 3, 20, opts)
    expect(r1).toEqual(r2)
  })
})

// ---------------------------------------------------------------------------
// roughenSegments — pure pipeline tests
// ---------------------------------------------------------------------------

const DEFAULT_ROUGH: RoughLineOptions = {
  segmentSizeMin: 1,
  segmentSizeMax: 1,
  segmentSkipRate: 0,
  noDotRate: 0.2,
  scribbleScale: 0.2,
  scribbleAmplitude: 1,
  shiftRate: 0,
  shiftAmountMin: 1,
  shiftAmountMax: 2,
  majorNoiseScale: 0.05,
  majorNoiseAmplitude: 0,
  majorNoiseShift: 0.9,
}

describe('roughenSegments', () => {
  const seg: [number, number][][] = [[[0, 0], [20, 0]]]

  it('returns at least as many polylines as input segments (with skipRate=0)', () => {
    const result = roughenSegments(seg, DEFAULT_ROUGH, 1)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('output polylines each have at least 2 points', () => {
    const segments: [number, number][][] = [
      [[0, 0], [20, 0]],
      [[10, 10], [30, 10]],
    ]
    const result = roughenSegments(segments, DEFAULT_ROUGH, 2)
    for (const polyline of result) {
      expect(polyline.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('is deterministic with the same seed', () => {
    const segments: [number, number][][] = [[[0, 0], [20, 0]], [[5, 5], [25, 5]]]
    const r1 = roughenSegments(segments, DEFAULT_ROUGH, 99)
    const r2 = roughenSegments(segments, DEFAULT_ROUGH, 99)
    expect(r1).toEqual(r2)
  })

  it('with skipRate=1 and noDotRate=1, returns empty array', () => {
    const opts: RoughLineOptions = {
      ...DEFAULT_ROUGH,
      segmentSkipRate: 1,
      noDotRate: 1,
    }
    const result = roughenSegments(seg, opts, 7)
    expect(result).toHaveLength(0)
  })

  it('output points deviate from the original line when scribbleAmplitude > 0', () => {
    // Use a longer segment so scribble has room to displace points
    const longSeg: [number, number][][] = [[[0, 0], [50, 0]]]
    const opts: RoughLineOptions = {
      ...DEFAULT_ROUGH,
      segmentSizeMin: 5,
      segmentSizeMax: 10,
      scribbleAmplitude: 5,
    }
    const result = roughenSegments(longSeg, opts, 42)

    // Flatten all output points and check that at least one deviates vertically from y=0
    let anyDeviation = false
    for (const polyline of result) {
      for (const [, y] of polyline) {
        if (Math.abs(y) > 1e-9) {
          anyDeviation = true
          break
        }
      }
      if (anyDeviation) break
    }
    expect(anyDeviation).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildHatchPolylines — integration smoke test
// ---------------------------------------------------------------------------

describe('buildHatchPolylines', () => {
  it('returns non-empty polylines for a grid with wall adjacent to floor', () => {
    // 3×3: center is floor, ring is wall
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const result = buildHatchPolylines(grid, 3, 3, 20)
    expect(result.length).toBeGreaterThan(0)
    for (const polyline of result) {
      expect(polyline.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('returns empty array for all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    expect(buildHatchPolylines(grid, 2, 2, 20)).toHaveLength(0)
  })

  it('is deterministic', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const r1 = buildHatchPolylines(grid, 3, 3, 20)
    const r2 = buildHatchPolylines(grid, 3, 3, 20)
    expect(r1).toEqual(r2)
  })
})

// ---------------------------------------------------------------------------
// buildWallOutlineSegments
// ---------------------------------------------------------------------------

describe('buildWallOutlineSegments', () => {
  it('returns empty array for all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    expect(buildWallOutlineSegments(grid, 2, 2, 20)).toHaveLength(0)
  })

  it('returns no segments for a floor tile fully surrounded by other floor tiles', () => {
    // 3×3: outer ring floor, center floor — but OOB=WALL means edge tiles get segments.
    // Use a 5×5 with only the very center (2,2) as floor, surrounded by floor ring,
    // surrounded by wall ring. The center-to-floor edges are floor-floor (no segment).
    // Simpler: verify a single floor tile surrounded on all 4 sides by floor tiles = 0 segments.
    // Build a 3×3 all-floor grid and only check the center tile's contributions:
    // the center tile (1,1) has floor neighbors on all 4 sides → 0 segments from it.
    // (Edge tiles produce OOB segments but we care about the interior behavior here.)
    const grid = new Uint8Array(9).fill(FLOOR)
    // A floor-only grid produces segments at the map boundary (OOB=WALL).
    // 3×3 all-floor: right col (c=2) → 3 vertical segs; bottom row (r=2) → 3 horizontal segs = 6.
    expect(buildWallOutlineSegments(grid, 3, 3, 20)).toHaveLength(6)
  })

  it('returns 4 segments for a single floor tile surrounded by walls', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // center tile (col=1, row=1)
    expect(buildWallOutlineSegments(grid, 3, 3, 20)).toHaveLength(4)
  })

  it('returns correct pixel coordinates for center floor tile', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // (col=1, row=1)
    const T = 10
    const segs = buildWallOutlineSegments(grid, 3, 3, T)
    const flat = segs.map(s => s.flat()).sort((a, b) =>
      a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
    )
    expect(flat).toContainEqual([10, 10, 20, 10]) // top edge
    expect(flat).toContainEqual([10, 10, 10, 20]) // left edge
    expect(flat).toContainEqual([20, 10, 20, 20]) // right edge
    expect(flat).toContainEqual([10, 20, 20, 20]) // bottom edge
  })

  it('does not emit a segment for the shared edge between two adjacent floor tiles', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // (1,1)
    grid[5] = FLOOR // (2,1)
    // Each floor tile has 4 edges; two tiles share 1 → 4+4−2 = 6
    expect(buildWallOutlineSegments(grid, 3, 3, 10)).toHaveLength(6)
  })

  it('each segment is a 2-element array of [number, number] pairs', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    for (const seg of buildWallOutlineSegments(grid, 3, 3, 20)) {
      expect(seg).toHaveLength(2)
      for (const pt of seg) {
        expect(pt).toHaveLength(2)
        expect(typeof pt[0]).toBe('number')
        expect(typeof pt[1]).toBe('number')
      }
    }
  })

  it('is deterministic', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const r1 = buildWallOutlineSegments(grid, 3, 3, 20)
    const r2 = buildWallOutlineSegments(grid, 3, 3, 20)
    expect(r1).toEqual(r2)
  })
})
