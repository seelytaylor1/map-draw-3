import { DEFAULT_COLS, DEFAULT_ROWS, FLOOR } from './constants'

export interface IsoDiagnosticConfig {
  levelCount: number
  cols?: number
  rows?: number
  density?: number
  show3D?: boolean
  cacheBatches?: boolean
}

export interface NormalizedIsoDiagnosticConfig {
  levelCount: number
  cols: number
  rows: number
  density: number
  show3D: boolean
  cacheBatches: boolean
}

export interface IsoDiagnosticReport {
  requestId: number
  config: NormalizedIsoDiagnosticConfig
  shapeCount: number
  renderNodeCount: number
  layerNodeCount: number
  dotNodeCount: number
  stampNodeCount: number
  labelNodeCount: number
  totalNodeCount: number
  sceneBuildMs: number
  groupingMs: number
  nodeCreateMs: number
  drawScheduleMs: number
  firstFrameMs: number
}

export interface IsoInteractionReport {
  durationMs: number
  frames: number
  meanFrameMs: number
  p95FrameMs: number
  maxFrameMs: number
  droppedFrames: number
}

export interface IsoDiagnosticApi {
  setFixture(config: IsoDiagnosticConfig): number
  waitForReport(requestId: number, timeoutMs?: number): Promise<IsoDiagnosticReport>
  latestReport(): IsoDiagnosticReport | null
  measurePan(durationMs?: number): Promise<IsoInteractionReport>
}

declare global {
  interface Window {
    __mapDrawDiagnostics?: IsoDiagnosticApi
  }
}

export function normalizeIsoDiagnosticConfig(config: IsoDiagnosticConfig): NormalizedIsoDiagnosticConfig {
  return {
    levelCount: Math.max(1, Math.floor(config.levelCount)),
    cols: Math.max(1, Math.floor(config.cols ?? DEFAULT_COLS)),
    rows: Math.max(1, Math.floor(config.rows ?? DEFAULT_ROWS)),
    density: Math.min(1, Math.max(0, config.density ?? 0.8)),
    show3D: config.show3D ?? true,
    cacheBatches: config.cacheBatches ?? true,
  }
}

export function buildIsoDiagnosticGrids(config: NormalizedIsoDiagnosticConfig): Map<number, Uint8Array> {
  const grids = new Map<number, Uint8Array>()
  const threshold = Math.floor(config.density * 100)

  for (let z = 0; z < config.levelCount; z++) {
    const grid = new Uint8Array(config.cols * config.rows)
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        // Stable coverage pattern: every run uses the same shape distribution
        // while z still changes the tile phase enough to exercise sorting.
        const sample = (col * 17 + row * 31 + z * 13) % 100
        if (sample < threshold) grid[row * config.cols + col] = FLOOR
      }
    }
    grids.set(z, grid)
  }
  return grids
}

export function summarizeFrameTimes(frameTimes: number[], durationMs: number): IsoInteractionReport {
  if (frameTimes.length === 0) {
    return { durationMs, frames: 0, meanFrameMs: 0, p95FrameMs: 0, maxFrameMs: 0, droppedFrames: 0 }
  }
  const sorted = [...frameTimes].sort((a, b) => a - b)
  const total = frameTimes.reduce((sum, value) => sum + value, 0)
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
  return {
    durationMs,
    frames: frameTimes.length,
    meanFrameMs: total / frameTimes.length,
    p95FrameMs: sorted[p95Index],
    maxFrameMs: sorted[sorted.length - 1],
    droppedFrames: frameTimes.filter(frameMs => frameMs > 1000 / 60).length,
  }
}
