import type { Direction, HallwayForm, IntersectionKind, IrregularSubtype, Point, RoomShape } from './types'

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

function irregularFootprint(width: number, height: number, topLeft: Point, subtype: IrregularSubtype = 'polygonal'): Point[] {
  if (subtype === 'natural-cavern') return rasterizeNatural(width, height).map(p => ({ col: topLeft.col + p.col, row: topLeft.row + p.row }))
  if (subtype === 'underground-feature') return rectangleFootprint(width, height, topLeft)

  const points: Point[] = []
  const maxInset = Math.min(2, Math.floor((width - 1) / 2))
  for (let row = 0; row < height; row++) {
    let left = 0
    let right = width - 1
    if (subtype === 'letter-shaped' && row >= Math.ceil(height / 2)) right = Math.max(0, Math.floor((width - 1) / 2))
    if (subtype === 'polygonal' && (row === 0 || row === height - 1)) { left = maxInset > 0 ? 1 : 0; right -= maxInset > 0 ? 1 : 0 }
    if (subtype === 'trapezoidal') {
      const inset = height <= 1 ? 0 : Math.floor((row * maxInset) / (height - 1))
      left = inset; right -= inset
    }
    if (subtype === 'cornered' && row === 0 && width > 2) left = 1
    if (subtype === 'cornered' && row === height - 1 && width > 2) right -= 1
    for (let col = left; col <= right; col++) points.push({ col: topLeft.col + col, row: topLeft.row + row })
  }
  return points.length > 0 ? points : [{ col: topLeft.col, row: topLeft.row }]
}

export function roomFootprint(shape: RoomShape, width: number, height: number, topLeft: Point, radius?: number, irregularSubtype?: IrregularSubtype): Point[] {
  if (shape === 'circular') return rasterizeCircle(radius ?? Math.floor(Math.min(width, height) / 2)).map(p => ({ col: topLeft.col + p.col + Math.floor(width / 2), row: topLeft.row + p.row + Math.floor(height / 2) }))
  if (shape === 'cavern' || shape === 'cave-opening' || shape === 'natural-cavern') return rasterizeNatural(width, height).map(p => ({ col: topLeft.col + p.col, row: topLeft.row + p.row }))
  if (shape === 'irregular-chamber') return irregularFootprint(width, height, topLeft, irregularSubtype)
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
    const side = directionVector[left(travel)]
    // A doorway is one tile wide. Let the hallway widen after it clears the
    // source room so the wider footprint does not clip the room's corner.
    const segmentWidth = i === 1 ? 1 : width
    for (let w = 0; w < segmentWidth; w++) footprint.push({ col: current.col + side.col * (w - Math.floor(segmentWidth / 2)), row: current.row + side.row * (w - Math.floor(segmentWidth / 2)) })
    // A turn needs a straight launch before it can safely run alongside the
    // source room's wall.
    if (form === 'turn' && i === Math.max(2, Math.floor(length / 2))) travel = turnRight[travel]
  }
  return { path, footprint: uniquePoints(footprint), end: current, direction: travel }
}

export function intersectionFootprint(origin: Point, kind: IntersectionKind, armLength = 1): { footprint: Point[]; branches: Direction[]; branchPaths: { direction: Direction; path: Point[] }[] } {
  const branches = kind === 'T-intersection' ? ['N', 'E', 'W'] as Direction[] : kind === 'Y-intersection' ? ['N', 'E', 'W'] as Direction[] : DIRECTIONS.slice() as Direction[]
  const branchPaths = branches.map(direction => ({ direction, path: Array.from({ length: armLength }, (_, index) => step(origin, direction, index + 1)) }))
  const footprint = uniquePoints([origin, ...branchPaths.flatMap(branch => branch.path)])
  return { footprint, branches, branchPaths }
}

export function roomFromEntrance(entrance: Point, direction: Direction, width: number, height: number, shape: RoomShape, radius?: number, irregularSubtype?: IrregularSubtype): Point[] {
  // Circular rooms use the doorway as their first floor tile so their curved
  // perimeter does not leave an unnecessary straight connector in front of it.
  const entranceOffset = shape === 'circular' ? 1 : 2
  const topLeft = direction === 'E'
    ? { col: entrance.col + entranceOffset, row: entrance.row - Math.floor(height / 2) }
    : direction === 'W'
      ? { col: entrance.col - width - (entranceOffset - 1), row: entrance.row - Math.floor(height / 2) }
      : direction === 'S'
        ? { col: entrance.col - Math.floor(width / 2), row: entrance.row + entranceOffset }
        : { col: entrance.col - Math.floor(width / 2), row: entrance.row - height - (entranceOffset - 1) }
  return roomFootprint(shape, width, height, topLeft, radius, irregularSubtype)
}
