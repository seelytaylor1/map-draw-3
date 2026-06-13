export type PatternType = 'none' | 'diagonal' | 'cross' | 'dots'

export const PATTERN_LABELS: Record<PatternType, string> = {
  'none': 'None',
  'diagonal': 'Diagonal',
  'cross': 'Cross-hatch',
  'dots': 'Dots',
}

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: PatternType,
  width: number,
  height: number,
  color: string,
): void {
  if (pattern === 'none') return

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()

  if (pattern === 'diagonal') {
    // Diagonal lines from top-left to bottom-right
    for (let x = -height; x < width; x += 3) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x + height, height)
    }
  } else if (pattern === 'cross') {
    // Cross-hatch: diagonal both ways
    for (let x = -height; x < width; x += 3) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x + height, height)
    }
    for (let x = 0; x < width + height; x += 3) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x - height, height)
    }
  } else if (pattern === 'dots') {
    // Dots in a grid
    ctx.fillStyle = color
    for (let y = 2; y < height; y += 4) {
      for (let x = 2; x < width; x += 4) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    return
  }

  ctx.stroke()
}
