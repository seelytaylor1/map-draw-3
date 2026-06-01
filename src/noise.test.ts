import { describe, it, expect } from 'vitest'
import { applyTileLevelNoise } from './noise'
import { WALL } from './constants'

const rect = { minC: 2, minR: 2, maxC: 6, maxR: 5 }

describe('applyTileLevelNoise', () => {
  it('intensity 0 returns no flips', () => {
    expect(applyTileLevelNoise(rect, 0, 42)).toEqual([])
  })

  it('all returned tiles bounded within rect', () => {
    const flips = applyTileLevelNoise(rect, 0.8, 99)
    for (const { col, row } of flips) {
      expect(col).toBeGreaterThanOrEqual(rect.minC)
      expect(col).toBeLessThanOrEqual(rect.maxC)
      expect(row).toBeGreaterThanOrEqual(rect.minR)
      expect(row).toBeLessThanOrEqual(rect.maxR)
    }
  })

  it('same seed produces same result', () => {
    const a = applyTileLevelNoise(rect, 0.6, 7)
    const b = applyTileLevelNoise(rect, 0.6, 7)
    expect(a).toEqual(b)
  })

  it('higher intensity produces more flips', () => {
    const low = applyTileLevelNoise(rect, 0.2, 1234)
    const high = applyTileLevelNoise(rect, 1.0, 1234)
    expect(high.length).toBeGreaterThan(low.length)
  })

  it('all flips have state WALL', () => {
    const flips = applyTileLevelNoise(rect, 1.0, 55)
    for (const flip of flips) {
      expect(flip.state).toBe(WALL)
    }
  })
})
