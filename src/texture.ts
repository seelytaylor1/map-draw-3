import { isoFloorPointsAtZ } from './iso'
import type { TextureSettings } from './styles'

export interface TextureCanvas {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

function drawPattern(ctx: CanvasRenderingContext2D, width: number, height: number, tileSize: number, settings: TextureSettings): void {
  const spacing = Math.max(3, tileSize * 0.32 * settings.scale)
  ctx.globalAlpha = settings.opacity / 100
  ctx.strokeStyle = settings.color
  ctx.fillStyle = settings.color
  ctx.lineWidth = Math.max(0.4, tileSize * 0.018)
  if (settings.pattern === 'dots') {
    for (let y = spacing / 2; y < height; y += spacing) for (let x = spacing / 2; x < width; x += spacing) {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.5, tileSize * 0.025), 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }
  const diagonal = (reverse: boolean) => {
    ctx.beginPath()
    for (let start = -height; start <= width + height; start += spacing) {
      ctx.moveTo(start, reverse ? 0 : height)
      ctx.lineTo(start + height, reverse ? height : 0)
    }
    ctx.stroke()
  }
  diagonal(false)
  if (settings.pattern === 'crosshatch') diagonal(true)
}

export function createTextureCanvas(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  settings: TextureSettings,
  isometric: boolean,
  z = 0,
): TextureCanvas | null {
  if (settings.pattern === 'none' || settings.opacity <= 0 || cols <= 0 || rows <= 0) return null
  const offsetX = isometric ? rows * tileSize : 0
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(isometric ? (cols + rows) * tileSize : cols * tileSize))
  canvas.height = Math.max(1, Math.ceil(isometric ? (cols + rows) * tileSize / 2 : rows * tileSize))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (isometric) ctx.translate(offsetX, 0)
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    if (grid[row * cols + col] === 0) continue
    ctx.save()
    let left: number, top: number, width: number, height: number
    if (isometric) {
      const points = isoFloorPointsAtZ(col, row, tileSize * 2, tileSize, z)
      ctx.beginPath()
      ctx.moveTo(points[0], points[1])
      for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1])
      ctx.closePath()
      left = Math.min(points[0], points[2], points[4], points[6])
      top = Math.min(points[1], points[3], points[5], points[7])
      width = Math.max(points[0], points[2], points[4], points[6]) - left
      height = Math.max(points[1], points[3], points[5], points[7]) - top
    } else {
      left = col * tileSize
      top = row * tileSize
      width = height = tileSize
      ctx.beginPath()
      ctx.rect(left, top, width, height)
    }
    ctx.clip()
    drawPattern(ctx, width, height, tileSize, settings)
    ctx.restore()
  }
  return { canvas, x: -offsetX, y: 0 }
}
