// src/patterns.ts
import { FLOOR, WALL } from './constants'

function getLocalTile(grid: Uint8Array, cols: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= grid.length) return WALL
  return grid[row * cols + col]
}

function drawEdgeHatch(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  nx: number, ny: number,
  spacing: number,
  strokeLen: number,
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const edgeLen = Math.sqrt(dx * dx + dy * dy)
  const tx = dx / edgeLen
  const ty = dy / edgeLen
  for (let t = spacing / 2; t < edgeLen; t += spacing) {
    const x = x1 + t * tx
    const y = y1 + t * ty
    const alt = Math.floor(t / spacing) % 2 === 0 ? 1 : -1
    const ddx = nx + alt * tx
    const ddy = ny + alt * ty
    const dlen = Math.sqrt(ddx * ddx + ddy * ddy)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + strokeLen * ddx / dlen, y + strokeLen * ddy / dlen)
    ctx.stroke()
  }
}

export function drawHatching(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  const spacing = Math.max(3, Math.round(tileSize / 6))
  const strokeLen = Math.max(5, Math.round(tileSize * 0.4))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) !== FLOOR) continue
      const x0 = c * tileSize
      const y0 = r * tileSize
      const x1 = x0 + tileSize
      const y1 = y0 + tileSize
      if (getLocalTile(grid, cols, c, r - 1) === WALL)
        drawEdgeHatch(ctx, x0, y0, x1, y0, 0, -1, spacing, strokeLen)
      if (getLocalTile(grid, cols, c, r + 1) === WALL)
        drawEdgeHatch(ctx, x0, y1, x1, y1, 0, 1, spacing, strokeLen)
      if (getLocalTile(grid, cols, c + 1, r) === WALL)
        drawEdgeHatch(ctx, x1, y0, x1, y1, 1, 0, spacing, strokeLen)
      if (getLocalTile(grid, cols, c - 1, r) === WALL)
        drawEdgeHatch(ctx, x0, y0, x0, y1, -1, 0, spacing, strokeLen)
    }
  }
}
