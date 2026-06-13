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
      lineCap: 'butt',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  })

  it('sets the stroke color', () => {
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#ff0000')
    expect(ctx.strokeStyle).toBe('#ff0000')
  })

  it('wraps drawing in save/restore', () => {
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('does not clip floor tiles', () => {
    // 1x1 all-floor: no wall tiles exist, nothing to clip
    const grid = new Uint8Array([FLOOR])
    drawHatching(ctx, grid, 1, 1, 20, '#000')
    expect(ctx.rect).not.toHaveBeenCalled()
  })

  it('does not clip walls that have no floor neighbors', () => {
    // 2x2 all-wall: no tile has a floor neighbor, nothing qualifies
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    drawHatching(ctx, grid, 2, 2, 20, '#000')
    expect(ctx.rect).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('clips only the wall tile adjacent to floor in a 2x1 grid', () => {
    // [WALL, FLOOR]: wall at (0,0) has floor at (1,0) as east neighbor
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.rect).toHaveBeenCalledTimes(1)
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 20, 20)
  })

  it('clips only the 4 cardinal wall tiles adjacent to a center floor tile', () => {
    // 3x3 with floor at center (1,1):
    // W W W
    // W F W
    // W W W
    // Cardinal neighbors of floor: (1,0) N, (0,1) W, (2,1) E, (1,2) S → 4 tiles
    // Corner walls (0,0),(0,2),(2,0),(2,2) have no floor neighbor → not clipped
    const grid = new Uint8Array([
      WALL, WALL, WALL,
      WALL, FLOOR, WALL,
      WALL, WALL, WALL,
    ])
    drawHatching(ctx, grid, 3, 3, 20, '#000')
    expect(ctx.rect).toHaveBeenCalledTimes(4)
    expect(ctx.rect).toHaveBeenCalledWith(20, 0, 20, 20)  // (1,0)
    expect(ctx.rect).toHaveBeenCalledWith(0, 20, 20, 20)  // (0,1)
    expect(ctx.rect).toHaveBeenCalledWith(40, 20, 20, 20) // (2,1)
    expect(ctx.rect).toHaveBeenCalledWith(20, 40, 20, 20) // (1,2)
  })

  it('draws strokes for a qualifying tile', () => {
    // Wall at (0,0) adjacent to floor at (1,0) → 2 families × 3 seeds = 6 streamlines
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalledTimes(6)
  })
})
