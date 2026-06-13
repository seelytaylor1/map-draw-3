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

  it('draws only boundary strokes for a 3x3 all-floor grid (interior tile has no wall neighbors)', () => {
    // tileSize=20: spacing=max(3,round(20/6))=3, edgeLen=20
    // t=1.5,4.5,7.5,10.5,13.5,16.5,19.5 → 7 strokes per wall edge
    // 4 corner tiles × 2 off-grid edges × 7 = 56
    // 4 edge tiles × 1 off-grid edge × 7 = 28
    // 1 center tile × 0 wall edges = 0
    // Total = 84
    const grid = new Uint8Array(9).fill(FLOOR)
    drawHatching(ctx, grid, 3, 3, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalledTimes(84)
  })

  it('counts correct strokes for a 2x1 all-floor grid', () => {
    // tileSize=20: spacing=3, 7 strokes per wall edge
    // Tile (0,0): N, S, W all off-grid (wall) → 3 edges × 7 = 21 strokes
    // Tile (1,0): N, S, E all off-grid (wall) → 3 edges × 7 = 21 strokes
    // Total = 42
    const grid = new Uint8Array([FLOOR, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalledTimes(42)
  })
})
