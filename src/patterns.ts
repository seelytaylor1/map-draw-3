// src/patterns.ts
import { FLOOR, WALL } from './constants'

function getLocalTile(grid: Uint8Array, cols: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= grid.length) return WALL
  return grid[row * cols + col]
}

function isAdjacentToFloor(grid: Uint8Array, cols: number, col: number, row: number): boolean {
  return (
    getLocalTile(grid, cols, col, row - 1) === FLOOR ||
    getLocalTile(grid, cols, col, row + 1) === FLOOR ||
    getLocalTile(grid, cols, col - 1, row) === FLOOR ||
    getLocalTile(grid, cols, col + 1, row) === FLOOR
  )
}

function angleField(px: number, py: number, scale: number): number {
  return Math.sin(px / scale) * Math.PI
       + Math.cos(py / (scale * 0.71)) * Math.PI * 0.55
}

function traceStreamline(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  stepSize: number,
  numSteps: number,
  scale: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  let x = x0
  let y = y0
  for (let i = 0; i < numSteps; i++) {
    const a = angleField(x, y, scale)
    x += Math.cos(a) * stepSize
    y += Math.sin(a) * stepSize
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

export function drawHatching(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  color: string,
): void {
  const scale = tileSize * 4
  const stepSize = tileSize / 5
  const numSteps = 8

  ctx.save()

  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, tileSize / 16)
  ctx.lineCap = 'round'

  // Clip to adjacent-wall tiles only
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) === WALL && isAdjacentToFloor(grid, cols, c, r)) {
        ctx.rect(c * tileSize, r * tileSize, tileSize, tileSize)
      }
    }
  }
  ctx.clip()

  // Two families of streamlines per qualifying tile
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) !== WALL || !isAdjacentToFloor(grid, cols, c, r)) continue

      const cx = c * tileSize + tileSize / 2
      const cy = r * tileSize + tileSize / 2
      const theta = angleField(cx, cy, scale)

      for (let family = 0; family < 2; family++) {
        const a = theta + family * Math.PI * 0.42
        const perpX = -Math.sin(a)
        const perpY = Math.cos(a)
        const spread = tileSize / 3

        for (const k of [-1, 0, 1]) {
          const sx = cx + k * spread * perpX
          const sy = cy + k * spread * perpY
          traceStreamline(ctx, sx, sy, stepSize, numSteps, scale)
        }
      }
    }
  }

  ctx.restore()
}
