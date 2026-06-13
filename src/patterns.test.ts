// src/patterns.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawHatching } from './patterns'
import { FLOOR, WALL } from './constants'

describe('drawHatching', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = {
      strokeStyle: '',
      lineWidth: 1,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  })

  it('draws nothing for an all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    drawHatching(ctx, grid, 2, 2, 20, '#000')
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('sets the stroke color before drawing', () => {
    const grid = new Uint8Array([FLOOR])
    drawHatching(ctx, grid, 1, 1, 12, '#ff0000')
    expect(ctx.strokeStyle).toBe('#ff0000')
  })

  it('draws strokes on all 4 sides of a 1x1 floor tile (all neighbors are off-grid = wall)', () => {
    // tileSize=12, spacing=max(3,round(12/6))=3, strokeLen=max(5,round(12*0.4))=5
    // Each edge length=12: t=1.5,4.5,7.5,10.5 → 4 strokes per edge × 4 edges = 16
    const grid = new Uint8Array([FLOOR])
    drawHatching(ctx, grid, 1, 1, 12, '#000')
    expect(ctx.stroke).toHaveBeenCalledTimes(16)
  })

  it('does not throw for an all-floor grid', () => {
    const grid = new Uint8Array(9).fill(FLOOR)
    expect(() => drawHatching(ctx, grid, 3, 3, 20, '#000')).not.toThrow()
  })

  it('draws strokes when floor tiles have wall neighbors', () => {
    const grid = new Uint8Array([FLOOR, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalled()
  })
})
