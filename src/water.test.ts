import { describe, it, expect } from 'vitest'
import { darkenHex, shoreLinePoints, isoShoreLinePoints } from './water'
import { WATER_COLOR } from './constants'

// ── darkenHex ─────────────────────────────────────────────────────────────────

describe('darkenHex', () => {
  it('produces a darker color than the input', () => {
    const original = '#6baed6'
    const darkened = darkenHex(original, 0.7)
    // Each channel of darkened must be <= original
    const oR = parseInt(original.slice(1, 3), 16)
    const oG = parseInt(original.slice(3, 5), 16)
    const oB = parseInt(original.slice(5, 7), 16)
    const dR = parseInt(darkened.slice(1, 3), 16)
    const dG = parseInt(darkened.slice(3, 5), 16)
    const dB = parseInt(darkened.slice(5, 7), 16)
    expect(dR).toBeLessThanOrEqual(oR)
    expect(dG).toBeLessThanOrEqual(oG)
    expect(dB).toBeLessThanOrEqual(oB)
    // At least one channel must actually be smaller (the color must have changed)
    expect(dR < oR || dG < oG || dB < oB).toBe(true)
  })

  it('factor 0.7 on WATER_COLOR produces expected value', () => {
    // #6baed6 → r=107, g=174, b=214
    // × 0.7   → r=74.9→75, g=121.8→122, b=149.8→150
    const result = darkenHex(WATER_COLOR, 0.7)
    const r = parseInt(result.slice(1, 3), 16)
    const g = parseInt(result.slice(3, 5), 16)
    const b = parseInt(result.slice(5, 7), 16)
    expect(r).toBe(Math.round(107 * 0.7))
    expect(g).toBe(Math.round(174 * 0.7))
    expect(b).toBe(Math.round(214 * 0.7))
  })

  it('returns a valid 7-char hex string', () => {
    const result = darkenHex('#ffffff', 0.5)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('factor 1 returns the same color', () => {
    expect(darkenHex('#6baed6', 1)).toBe('#6baed6')
  })

  it('factor 0 returns #000000', () => {
    expect(darkenHex('#6baed6', 0)).toBe('#000000')
  })

  it('clamps result to 255 when factor > 1', () => {
    const result = darkenHex('#ffffff', 2)
    expect(result).toBe('#ffffff')
  })
})

// ── shoreLinePoints ───────────────────────────────────────────────────────────

describe('shoreLinePoints', () => {
  const TILE = 20

  it('returns (steps+1)*2 values for each edge (default steps=8)', () => {
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      const pts = shoreLinePoints(edge, 0, 0, TILE)
      expect(pts).toHaveLength((8 + 1) * 2)
    }
  })

  it('returns correct length for custom steps', () => {
    const pts = shoreLinePoints('top', 0, 0, TILE, 1.5, 4)
    expect(pts).toHaveLength((4 + 1) * 2)
  })

  it('top edge: first point x == tile origin x, last point x == tile origin x + tileSize', () => {
    const pts = shoreLinePoints('top', 10, 20, TILE)
    expect(pts[0]).toBe(10)               // first x
    expect(pts[pts.length - 2]).toBe(30)  // last x
  })

  it('top edge: all y values are at or near tile top (y ± amplitude)', () => {
    const amp = 1.5
    const pts = shoreLinePoints('top', 0, 0, TILE, amp)
    for (let i = 1; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(-amp)
      expect(pts[i]).toBeLessThanOrEqual(amp)
    }
  })

  it('bottom edge: first point x == tile origin x, last point x == tile origin x + tileSize', () => {
    const pts = shoreLinePoints('bottom', 10, 20, TILE)
    expect(pts[0]).toBe(10)
    expect(pts[pts.length - 2]).toBe(30)
  })

  it('bottom edge: all y values are at or near tile bottom (y+tileSize ± amplitude)', () => {
    const amp = 1.5
    const pts = shoreLinePoints('bottom', 0, 0, TILE, amp)
    for (let i = 1; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(TILE - amp)
      expect(pts[i]).toBeLessThanOrEqual(TILE + amp)
    }
  })

  it('left edge: first point y == tile origin y, last point y == tile origin y + tileSize', () => {
    const pts = shoreLinePoints('left', 10, 20, TILE)
    expect(pts[1]).toBe(20)               // first y
    expect(pts[pts.length - 1]).toBe(40)  // last y
  })

  it('left edge: all x values are at or near tile left (x ± amplitude)', () => {
    const amp = 1.5
    const pts = shoreLinePoints('left', 0, 0, TILE, amp)
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(-amp)
      expect(pts[i]).toBeLessThanOrEqual(amp)
    }
  })

  it('right edge: first point y == tile origin y, last point y == tile origin y + tileSize', () => {
    const pts = shoreLinePoints('right', 10, 20, TILE)
    expect(pts[1]).toBe(20)
    expect(pts[pts.length - 1]).toBe(40)
  })

  it('right edge: all x values are at or near tile right (x+tileSize ± amplitude)', () => {
    const amp = 1.5
    const pts = shoreLinePoints('right', 0, 0, TILE, amp)
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(TILE - amp)
      expect(pts[i]).toBeLessThanOrEqual(TILE + amp)
    }
  })

  it('produces distinct output for different edges', () => {
    const top = shoreLinePoints('top', 0, 0, TILE)
    const right = shoreLinePoints('right', 0, 0, TILE)
    const bottom = shoreLinePoints('bottom', 0, 0, TILE)
    const left = shoreLinePoints('left', 0, 0, TILE)
    // All four must differ from each other
    expect(top).not.toEqual(right)
    expect(top).not.toEqual(bottom)
    expect(top).not.toEqual(left)
    expect(right).not.toEqual(bottom)
    expect(right).not.toEqual(left)
    expect(bottom).not.toEqual(left)
  })

  it('sine wave starts and ends at zero perpendicular offset (i=0 and i=steps)', () => {
    // sin(2π*0) = 0, sin(2π*steps/steps) = sin(2π) = 0
    const pts = shoreLinePoints('top', 0, 0, TILE)
    expect(pts[1]).toBeCloseTo(0, 10)                  // first y offset
    expect(pts[pts.length - 1]).toBeCloseTo(0, 10)    // last y offset
  })

  it('tile offset is applied correctly: points shift with x,y', () => {
    const a = shoreLinePoints('top', 0, 0, TILE)
    const b = shoreLinePoints('top', 100, 200, TILE)
    for (let i = 0; i < a.length; i++) {
      if (i % 2 === 0) {
        expect(b[i]).toBeCloseTo(a[i] + 100, 10)  // x shifted by 100
      } else {
        expect(b[i]).toBeCloseTo(a[i] + 200, 10)  // y shifted by 200
      }
    }
  })
})

// ── isoShoreLinePoints ────────────────────────────────────────────────────────

describe('isoShoreLinePoints', () => {
  it('returns (steps+1)*2 values (default steps=8)', () => {
    const pts = isoShoreLinePoints(0, 0, 40, 20)
    expect(pts).toHaveLength((8 + 1) * 2)
  })

  it('returns correct length for custom steps', () => {
    const pts = isoShoreLinePoints(0, 0, 40, 20, 1.5, 4)
    expect(pts).toHaveLength((4 + 1) * 2)
  })

  it('first point equals (x1, y1) — sin(0)=0 so no perpendicular offset', () => {
    const pts = isoShoreLinePoints(10, 5, 50, 25)
    expect(pts[0]).toBeCloseTo(10, 10)
    expect(pts[1]).toBeCloseTo(5, 10)
  })

  it('last point equals (x2, y2) — sin(2π)=0 so no perpendicular offset', () => {
    const pts = isoShoreLinePoints(10, 5, 50, 25)
    expect(pts[pts.length - 2]).toBeCloseTo(50, 10)
    expect(pts[pts.length - 1]).toBeCloseTo(25, 10)
  })

  it('middle points differ from the straight edge (squiggle is not a straight line)', () => {
    // Use a horizontal edge so the perpendicular is vertical — easy to check
    const pts = isoShoreLinePoints(0, 0, 80, 0, 1.5, 8)
    // midpoint is at index 4 (step 4/8 = 0.5), sin(π) ≈ 0 but step 2 (sin(π/2)=1) should deviate
    const midX = pts[4]  // step 2 x
    const midY = pts[5]  // step 2 y
    const linearY = 0    // straight line y at any point on a horizontal edge is 0
    // step 2: t=2/8=0.25, sin(2π*0.25)=sin(π/2)=1, offset=amplitude*1=1.5 in perpendicular direction
    expect(Math.abs(midY - linearY)).toBeGreaterThan(0.5)
  })
})
