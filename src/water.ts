/**
 * Shore line helpers for Water tile rendering.
 */

/**
 * Returns a flat polyline points array (for Konva.Line) representing a
 * sine-wave squiggle along the specified edge of a tile.
 *
 * @param edge      Which tile edge to draw along
 * @param x         Tile origin x in pixels
 * @param y         Tile origin y in pixels
 * @param tileSize  Tile size in pixels
 * @param amplitude Perpendicular oscillation magnitude in pixels (default 1.5)
 * @param steps     Number of wave segments (default 8)
 */
export function shoreLinePoints(
  edge: 'top' | 'right' | 'bottom' | 'left',
  x: number,
  y: number,
  tileSize: number,
  amplitude = 1.5,
  steps = 8,
): number[] {
  const points: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps                              // 0..1 along edge
    const perp = amplitude * Math.sin(2 * Math.PI * t)  // full sine wave

    switch (edge) {
      case 'top':
        points.push(x + t * tileSize, y + perp)
        break
      case 'bottom':
        points.push(x + t * tileSize, y + tileSize + perp)
        break
      case 'left':
        points.push(x + perp, y + t * tileSize)
        break
      case 'right':
        points.push(x + tileSize + perp, y + t * tileSize)
        break
    }
  }
  return points
}

/**
 * Darkens a hex color by multiplying each channel by `factor`.
 * factor = 0.7 → 30% darker.
 *
 * @param hex    6-digit hex color string (e.g. '#6baed6')
 * @param factor Value between 0 and 1
 */
export function darkenHex(hex: string, factor: number): string {
  const r = Math.round(Math.min(255, parseInt(hex.slice(1, 3), 16) * factor))
  const g = Math.round(Math.min(255, parseInt(hex.slice(3, 5), 16) * factor))
  const b = Math.round(Math.min(255, parseInt(hex.slice(5, 7), 16) * factor))
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0')
}
