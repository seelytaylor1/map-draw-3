import type { Direction, HallwayForm, IntersectionKind, Point, RoomShape } from './types'

export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W']
export const directionVector: Record<Direction, Point> = { N: { col: 0, row: -1 }, E: { col: 1, row: 0 }, S: { col: 0, row: 1 }, W: { col: -1, row: 0 } }
export const oppositeDirection: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
export const turnLeft: Record<Direction, Direction> = { N: 'W', W: 'S', S: 'E', E: 'N' }
export const turnRight: Record<Direction, Direction> = { N: 'E', E: 'S', S: 'W', W: 'N' }

export function add(a: Point, b: Point): Point { return { col: a.col + b.col, row: a.row + b.row } }
export function step(point: Point, direction: Direction, distance = 1): Point { const v = directionVector[direction]; return { col: point.col + v.col * distance, row: point.row + v.row * distance } }
export function rotateDirection(direction: Direction, quarterTurns: number): Direction { return DIRECTIONS[(DIRECTIONS.indexOf(direction) + quarterTurns + 4) % 4]! }
export function uniquePoints(points: Point[]): Point[] { const seen = new Set<string>(); return points.filter(p => { const key = `${p.col},${p.row}`; if (seen.has(key)) return false; seen.add(key); return true }) }

export function rasterizeCircle(radius: number): Point[] {
  const points: Point[] = []
  for (let row = -radius; row <= radius; row++) for (let col = -radius; col <= radius; col++) {
    if (col * col + row * row <= radius * radius) points.push({ col, row })
  }
  return points
}

export function rasterizeNatural(width: number, height: number): Point[] {
  const points: Point[] = []
  const cx = (width - 1) / 2; const cy = (height - 1) / 2
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const dx = (col - cx) / Math.max(1, width / 2); const dy = (row - cy) / Math.max(1, height / 2)
    const uneven = ((col * 17 + row * 31) % 7) / 100
    if (dx * dx + dy * dy <= 1.05 + uneven) points.push({ col, row })
  }
  return points
}

export function rectangleFootprint(width: number, height: number, topLeft: Point): Point[] {
  const points: Point[] = []
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) points.push({ col: topLeft.col + col, row: topLeft.row + row })
  return points
}

export function roomFootprint(shape: RoomShape, width: number, height: number, topLeft: Point, radius?: number): Point[] {
  if (shape === 'circular') return rasterizeCircle(radius ?? Math.floor(Math.min(width, height) / 2)).map(p => ({ col: topLeft.col + p.col + Math.floor(width / 2), row: topLeft.row + p.row + Math.floor(height / 2) }))
  if (shape === 'cavern' || shape === 'cave-opening' || shape === 'natural-cavern') return rasterizeNatural(width, height).map(p => ({ col: topLeft.col + p.col, row: topLeft.row + p.row }))
  if (shape === 'irregular-chamber') return rasterizeNatural(width, height).filter(p => (p.col + p.row) % 5 !== 0).map(p => ({ col: topLeft.col + p.col, row: topLeft.row + p.row }))
  return rectangleFootprint(width, height, topLeft)
}

export function perimeterExits(points: Point[], direction: Direction, count: number): Point[] {
  if (points.length === 0) return []
  const minCol = Math.min(...points.map(p => p.col)); const maxCol = Math.max(...points.map(p => p.col))
  const minRow = Math.min(...points.map(p => p.row)); const maxRow = Math.max(...points.map(p => p.row))
  const candidates = direction === 'N' ? points.filter(p => p.row === minRow) : direction === 'S' ? points.filter(p => p.row === maxRow) : direction === 'W' ? points.filter(p => p.col === minCol) : points.filter(p => p.col === maxCol)
  const sorted = candidates.slice().sort((a, b) => a.col - b.col || a.row - b.row)
  return Array.from({ length: count }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / count)] ?? sorted[0]!).filter(Boolean)
}

export function hallwayFootprint(origin: Point, direction: Direction, length: number, width: number, form: HallwayForm = 'straight'): { path: Point[]; footprint: Point[]; end: Point; direction: Direction } {
  const path: Point[] = []; const footprint: Point[] = []
  let current = origin; let travel = direction
  const left = (d: Direction) => turnLeft[d]
  for (let i = 1; i <= length; i++) {
    current = step(current, travel); path.push(current)
    const v = directionVector[travel]; const side = directionVector[left(travel)]
    for (let w = 0; w < width; w++) footprint.push({ col: current.col + side.col * (w - Math.floor(width / 2)), row: current.row + side.row * (w - Math.floor(width / 2)) })
    if (form === 'turn' && i === Math.max(1, Math.floor(length / 2))) travel = turnRight[travel]
  }
  return { path, footprint: uniquePoints(footprint), end: current, direction: travel }
}

export function intersectionFootprint(origin: Point, kind: IntersectionKind): { footprint: Point[]; branches: Direction[] } {
  const branches = kind === 'T-intersection' ? ['N', 'E', 'W'] as Direction[] : kind === 'Y-intersection' ? ['N', 'E', 'W'] as Direction[] : DIRECTIONS.slice() as Direction[]
  const footprint = uniquePoints([origin, ...branches.map(d => step(origin, d))])
  return { footprint, branches }
}

export function roomFromEntrance(entrance: Point, direction: Direction, width: number, height: number, shape: RoomShape, radius?: number): Point[] {
  const depth = directionVector[direction]
  const lateral = directionVector[turnLeft[direction]]
  const center = add(step(entrance, direction, 2), { col: lateral.col * Math.floor((width - 1) / 2), row: lateral.row * Math.floor((width - 1) / 2) })
  const topLeft = { col: center.col - Math.floor(width / 2), row: center.row - Math.floor(height / 2) }
  return roomFootprint(shape, width, height, topLeft, radius)
}
