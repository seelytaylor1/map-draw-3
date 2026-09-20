import { describe, expect, it } from 'vitest'
import { buildIsoDiagnosticGrids, normalizeIsoDiagnosticConfig, summarizeFrameTimes } from './isoDiagnostics'
import { FLOOR } from './constants'

describe('iso diagnostics', () => {
  it('builds a deterministic multi-level fixture at the requested density', () => {
    const config = normalizeIsoDiagnosticConfig({ levelCount: 3, cols: 4, rows: 3, density: 1 })
    const grids = buildIsoDiagnosticGrids(config)

    expect([...grids.keys()]).toEqual([0, 1, 2])
    expect([...grids.values()].every(grid => grid.every(tile => tile === FLOOR))).toBe(true)
  })

  it('summarizes dropped frames and percentile latency', () => {
    expect(summarizeFrameTimes([10, 12, 18, 35], 75)).toEqual({
      durationMs: 75,
      frames: 4,
      meanFrameMs: 18.75,
      p95FrameMs: 35,
      maxFrameMs: 35,
      droppedFrames: 2,
    })
  })
})
