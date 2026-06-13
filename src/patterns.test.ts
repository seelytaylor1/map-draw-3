import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawPattern, type PatternType } from './patterns'

describe('patterns', () => {
  const patternTypes: PatternType[] = ['none', 'diagonal', 'cross', 'dots']
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    // Mock canvas context
    ctx = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  })

  it('knows all pattern types', () => {
    expect(patternTypes).toContain('none')
    expect(patternTypes).toContain('diagonal')
  })

  it('does not draw anything for none pattern', () => {
    drawPattern(ctx, 'none', 20, 20, '#000')
    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('draws diagonal pattern on canvas', () => {
    drawPattern(ctx, 'diagonal', 20, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws cross pattern on canvas', () => {
    drawPattern(ctx, 'cross', 20, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('draws dots pattern on canvas', () => {
    drawPattern(ctx, 'dots', 20, 20, '#000')
    expect(ctx.fill).toHaveBeenCalled()
  })
})
