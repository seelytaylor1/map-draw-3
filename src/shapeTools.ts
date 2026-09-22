export type ShapeToolKind = 'rectangle' | 'circle' | 'polygon' | 'path'
export interface ShapePoint { col: number; row: number }
export interface ShapeDraft { tool: ShapeToolKind; start: ShapePoint; end: ShapePoint; points: ShapePoint[] }
export interface TilePosition { col: number; row: number }

export function snapShapePoint(point: ShapePoint, increment: number | null): ShapePoint {
  if (increment === null) return point
  const snap = (value: number) => Math.round(value / increment) * increment
  return { col: snap(point.col), row: snap(point.row) }
}

function distanceToSegment(point: ShapePoint, start: ShapePoint, end: ShapePoint): number {
  const dx = end.col - start.col
  const dy = end.row - start.row
  if (dx === 0 && dy === 0) return Math.hypot(point.col - start.col, point.row - start.row)
  const t = Math.max(0, Math.min(1, ((point.col - start.col) * dx + (point.row - start.row) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.col - (start.col + t * dx), point.row - (start.row + t * dy))
}

export function simplifyShapePath(points: readonly ShapePoint[], tolerance: number): ShapePoint[] {
  if (points.length <= 2 || tolerance <= 0) return [...points]
  let greatestDistance = 0
  let splitIndex = 0
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1])
    if (distance > greatestDistance) { greatestDistance = distance; splitIndex = index }
  }
  if (greatestDistance <= tolerance) return [points[0], points[points.length - 1]]
  const left = simplifyShapePath(points.slice(0, splitIndex + 1), tolerance)
  const right = simplifyShapePath(points.slice(splitIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

export function getShapePreviewPoints(draft: ShapeDraft, sides: number, pathSimplification: number): ShapePoint[] {
  if (draft.tool === 'path') return simplifyShapePath(draft.points, pathSimplification)
  const left = Math.min(draft.start.col, draft.end.col)
  const right = Math.max(draft.start.col, draft.end.col)
  const top = Math.min(draft.start.row, draft.end.row)
  const bottom = Math.max(draft.start.row, draft.end.row)
  if (draft.tool === 'rectangle') return [{ col: left, row: top }, { col: right, row: top }, { col: right, row: bottom }, { col: left, row: bottom }]
  const center = { col: (left + right) / 2, row: (top + bottom) / 2 }
  const radius = Math.max(0.5, Math.min(right - left, bottom - top) / 2)
  const count = draft.tool === 'circle' ? 32 : Math.max(3, Math.min(16, Math.floor(sides)))
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count
    return { col: center.col + Math.cos(angle) * radius, row: center.row + Math.sin(angle) * radius }
  })
}

function pointOnSegment(point: ShapePoint, a: ShapePoint, b: ShapePoint): boolean {
  return distanceToSegment(point, a, b) <= 1e-5
}

function pointInPolygon(point: ShapePoint, polygon: readonly ShapePoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    if (pointOnSegment(point, a, b)) return true
    const crosses = (a.row > point.row) !== (b.row > point.row)
      && point.col < (b.col - a.col) * (point.row - a.row) / (b.row - a.row) + a.col
    if (crosses) inside = !inside
  }
  return inside
}

function rasterizePath(points: readonly ShapePoint[], cols: number, rows: number): TilePosition[] {
  const tiles = new Map<number, TilePosition>()
  const addPoint = (point: ShapePoint) => {
    const col = Math.floor(point.col)
    const row = Math.floor(point.row)
    if (col >= 0 && row >= 0 && col < cols && row < rows) tiles.set(row * cols + col, { col, row })
  }
  if (points.length === 1) addPoint(points[0])
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]
    const b = points[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.col - a.col, b.row - a.row) * 4))
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      addPoint({ col: a.col + (b.col - a.col) * t, row: a.row + (b.row - a.row) * t })
    }
  }
  return [...tiles.values()]
}

export function rasterizeShape(tool: ShapeToolKind, points: readonly ShapePoint[], cols: number, rows: number): TilePosition[] {
  if (tool === 'path') return rasterizePath(points, cols, rows)
  if (points.length < 3) return rasterizePath(points, cols, rows)
  const minCol = Math.max(0, Math.floor(Math.min(...points.map(point => point.col))))
  const maxCol = Math.min(cols - 1, Math.ceil(Math.max(...points.map(point => point.col))))
  const minRow = Math.max(0, Math.floor(Math.min(...points.map(point => point.row))))
  const maxRow = Math.min(rows - 1, Math.ceil(Math.max(...points.map(point => point.row))))
  const tiles: TilePosition[] = []
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (pointInPolygon({ col: col + 0.5, row: row + 0.5 }, points)) tiles.push({ col, row })
    }
  }
  return tiles.length > 0 ? tiles : rasterizePath(points, cols, rows)
}
