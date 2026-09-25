import type { GenerationRequest, Mission, Point, SpatialModule } from './missionTypes'
import { normalizeSeed } from './random'

interface LayoutEdge {
  id?: string
  originalId?: string
  from: string
  to: string
  kind?: string
  lockId?: string
  secret?: boolean
  blocked?: boolean
  oneWay?: boolean
  dangerous?: boolean
}

type RoomShape = 'rectangle' | 'chamfered' | 'circle' | 'trapezoid' | 'faceted' | 'cross' | 'x'

function rollRoomShape(random: () => number, dramaticChamber: boolean): RoomShape {
  if (dramaticChamber) return 'rectangle'
  const roll = random()
  if (roll < 0.32) return 'rectangle'
  if (roll < 0.46) return 'chamfered'
  if (roll < 0.60) return 'circle'
  if (roll < 0.74) return 'trapezoid'
  if (roll < 0.88) return 'faceted'
  if (roll < 0.98) return 'cross'
  return 'x'
}

export function layoutRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ state >>> 15, state | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const directions = [
  { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
]

function footprintIsConnected(points: readonly Point[]): boolean {
  if (points.length === 0) return false
  const keys = new Set(points.map(point => `${point.col},${point.row}`))
  const visited = new Set<string>()
  const queue = [points[0]!]
  visited.add(`${queue[0]!.col},${queue[0]!.row}`)
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head]!
    for (const direction of directions) {
      const col = point.col + direction.dc
      const row = point.row + direction.dr
      const key = `${col},${row}`
      if (keys.has(key) && !visited.has(key)) { visited.add(key); queue.push({ col, row }) }
    }
  }
  return visited.size === points.length
}

function roomFootprint(width: number, height: number, shape: RoomShape, random: () => number): Point[] {
  const points: Point[] = []
  const midX = (width - 1) / 2
  const midY = (height - 1) / 2
  const normX = (x: number) => (x - midX) / Math.max(1, midX)
  const normY = (y: number) => (y - midY) / Math.max(1, midY)
  const crossWidth = Math.max(2, Math.round(Math.min(width, height) * 0.38))
  const trapezoidNarrowAtTop = random() < 0.5

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = normX(x)
    const ny = normY(y)
    let inside = true
    if (shape === 'chamfered') {
      inside = !((x < 2 || x >= width - 2) && (y < 2 || y >= height - 2))
    } else if (shape === 'circle') {
      inside = nx * nx + ny * ny <= 1.05
    } else if (shape === 'trapezoid') {
      const progress = y / Math.max(1, height - 1)
      const narrowSide = trapezoidNarrowAtTop ? 1 - progress : progress
      const halfWidth = 0.62 + 0.38 * (1 - narrowSide)
      inside = Math.abs(nx) <= halfWidth
    } else if (shape === 'faceted') {
      // A clipped, eight-sided outline gives rooms a polygonal plan without
      // introducing diagonal-only floor connections.
      inside = Math.abs(nx) + Math.abs(ny) <= 1.62
    } else if (shape === 'cross') {
      const horizontalArm = Math.abs(y - midY) <= (crossWidth - 1) / 2
      const verticalArm = Math.abs(x - midX) <= (crossWidth - 1) / 2
      inside = horizontalArm || verticalArm
    } else if (shape === 'x') {
      inside = Math.abs(nx - ny) <= 0.36 || Math.abs(nx + ny) <= 0.36
        || (Math.abs(nx) <= 0.2 && Math.abs(ny) <= 0.2)
    }
    if (inside) points.push({ col: x, row: y })
  }

  if (points.length < 5 || !footprintIsConnected(points)) {
    return Array.from({ length: width * height }, (_, index) => ({ col: index % width, row: Math.floor(index / width) }))
  }
  return points
}

function translateFootprint(module: SpatialModule, col: number, row: number): Point[] {
  const dc = col - module.origin.col
  const dr = row - module.origin.row
  return module.footprint.map(point => ({ col: point.col + dc, row: point.row + dr }))
}

function cellsTouch(left: readonly Point[], right: readonly Point[]): boolean {
  const rightCells = new Set(right.map(point => `${point.col},${point.row}`))
  return left.some(point => directions.some(direction => rightCells.has(`${point.col + direction.dc},${point.row + direction.dr}`)))
}

function safeToAbut(parent: SpatialModule, child: SpatialModule, candidate: readonly Point[], modules: readonly SpatialModule[], request: GenerationRequest): boolean {
  const candidateCells = new Set(candidate.map(point => `${point.col},${point.row}`))
  if (!cellsTouch(candidate, parent.footprint)) return false
  if (candidate.some(point => point.col <= 0 || point.row <= 0 || point.col >= request.cols - 1 || point.row >= request.rows - 1)) return false
  if (candidate.some(point => parent.footprint.some(other => other.col === point.col && other.row === point.row))) return false
  for (const other of modules) {
    if (other === parent || other === child) continue
    const otherCells = new Set(other.footprint.map(point => `${point.col},${point.row}`))
    for (const point of candidate) {
      if (otherCells.has(`${point.col},${point.row}`)) return false
      if (directions.some(direction => otherCells.has(`${point.col + direction.dc},${point.row + direction.dr}`))) return false
    }
  }
  return candidateCells.size === candidate.length
}

function abutRoom(parent: SpatialModule, child: SpatialModule, modules: readonly SpatialModule[], request: GenerationRequest, random: () => number): boolean {
  const original = { ...child.origin }
  const offsets = [-2, -1, 0, 1, 2]
  const candidates: Array<{ col: number; row: number; order: number; footprint: Point[] }> = []
  const placements = [
    ...offsets.map(offset => ({ col: parent.origin.col + parent.width, row: parent.origin.row + Math.floor((parent.height - child.height) / 2) + offset })),
    ...offsets.map(offset => ({ col: parent.origin.col - child.width, row: parent.origin.row + Math.floor((parent.height - child.height) / 2) + offset })),
    ...offsets.map(offset => ({ col: parent.origin.col + Math.floor((parent.width - child.width) / 2) + offset, row: parent.origin.row + parent.height })),
    ...offsets.map(offset => ({ col: parent.origin.col + Math.floor((parent.width - child.width) / 2) + offset, row: parent.origin.row - child.height })),
  ]
  for (const position of placements) {
    const footprint = translateFootprint(child, position.col, position.row)
    if (!safeToAbut(parent, child, footprint, modules, request)) continue
    const distance = Math.abs(position.col - original.col) + Math.abs(position.row - original.row)
    candidates.push({ ...position, footprint, order: distance + random() * 0.25 })
  }
  candidates.sort((a, b) => a.order - b.order)
  const selected = candidates[0]
  if (!selected) return false
  child.origin = { col: selected.col, row: selected.row }
  child.footprint = selected.footprint
  return true
}

// Optimize a graph embedding before carving. Empty slots are important: they
// reserve wall and routing space, rather than maximizing painted floor area.
// A few ordinary progression links deliberately collapse that gap into a
// shared open boundary, while all other rooms keep protected routing lanes.
export function arrangeRooms(request: GenerationRequest, mission: Mission, modules: SpatialModule[], edges: LayoutEdge[], attempt: number): Set<string> {
  const random = layoutRandom(normalizeSeed(request.seed) + attempt * 7919)
  const n = modules.length
  let spacing = Math.min(13, Math.max(6, Math.floor(Math.sqrt((request.cols - 4) * (request.rows - 4) / (n * 1.15)))))
  while (spacing > 6 && Math.floor((request.cols - 2) / spacing) * Math.floor((request.rows - 2) / spacing) < n) spacing--
  const cols = Math.max(1, Math.floor((request.cols - 2) / spacing))
  const rows = Math.max(1, Math.floor((request.rows - 2) / spacing))
  const slots: Point[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) slots.push({ col: x, row: y })
  if (slots.length < n) return new Set()
  const indices = new Map(modules.map((m, i) => [m.missionNodeId ?? m.id, i]))
  const links = edges.map(e => [indices.get(e.from)!, indices.get(e.to)!]).filter(e => e.every(i => i !== undefined))
  const positions = slots.map((_, i) => i)
  for (let i = positions.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [positions[i], positions[j]] = [positions[j]!, positions[i]!] }
  const cross = (a: Point, b: Point, c: Point) => (b.col - a.col) * (c.row - a.row) - (b.row - a.row) * (c.col - a.col)
  const energy = () => {
    let cost = 0
    for (const [a, b] of links) {
      const p = slots[positions[a!]!]!, q = slots[positions[b!]!]!
      cost += Math.pow(Math.abs(p.col - q.col) + Math.abs(p.row - q.row), 1.5)
    }
    for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
      const [a, b] = links[i]!, [c, d] = links[j]!
      if (a === c || a === d || b === c || b === d) continue
      const p = slots[positions[a!]!]!, q = slots[positions[b!]!]!, r = slots[positions[c!]!]!, s = slots[positions[d!]!]!
      if (cross(p, q, r) * cross(p, q, s) <= 0 && cross(r, s, p) * cross(r, s, q) <= 0 && Math.max(p.col,q.col) >= Math.min(r.col,s.col) && Math.max(r.col,s.col) >= Math.min(p.col,q.col) && Math.max(p.row,q.row) >= Math.min(r.row,s.row) && Math.max(r.row,s.row) >= Math.min(p.row,q.row)) cost += 35
    }
    if (request.style === 'orbit-gates') {
      const p = slots[positions[0]!]!
      cost += 3 * (Math.abs(p.col - (cols - 1) / 2) + Math.abs(p.row - (rows - 1) / 2))
    }
    return cost
  }
  let score = energy()
  for (let step = 0; step < 5000; step++) {
    const a = Math.floor(random() * n), b = Math.floor(random() * positions.length)
    ;[positions[a], positions[b]] = [positions[b]!, positions[a]!]
    const next = energy(), temperature = 7 * (1 - step / 5000) + 0.05
    if (next < score || random() < Math.exp((score - next) / temperature)) score = next
    else [positions[a], positions[b]] = [positions[b]!, positions[a]!]
  }
  modules.forEach((module, i) => {
    const slot = slots[positions[i]!]!
    const max = Math.max(3, spacing - 4)
    const degree = links.filter(e => e.includes(i)).length
    const dramaticStart = module.missionNodeId === 'start' && mission.cycles.some(cycle => cycle.challenge === 'dramatic-arc' && cycle.roles.objectiveNode === mission.goalNodeId)
    const dramaticChamber = dramaticStart || mission.cycles.some(cycle => cycle.challenge === 'dramatic-arc' && cycle.roles.objectiveNode === module.missionNodeId)
    const landmark = module.missionNodeId === mission.goalNodeId || module.type === 'hub' || degree > 3 || dramaticChamber
    const landmarkSize = degree > 3 || dramaticChamber ? Math.min(spacing - 2, Math.max(max, degree + 1, dramaticChamber ? 9 : 0)) : max
    const width = landmark ? landmarkSize : 3 + Math.floor(random() * (max - 2))
    const height = landmark ? landmarkSize : 3 + Math.floor(random() * (max - 2))
    const origin = { col: 1 + slot.col * spacing + Math.floor((spacing - width) / 2), row: 1 + slot.row * spacing + Math.floor((spacing - height) / 2) }
    module.origin = origin; module.width = width; module.height = height; module.ports = []
    // Dramatic Arc needs a clean full-width room for its darkness divider.
    const shape = rollRoomShape(random, dramaticChamber)
    module.footprint = roomFootprint(width, height, shape, random).map(point => ({ col: origin.col + point.col, row: origin.row + point.row }))
  })

  const cycleEdges = new Set(mission.cycles.flatMap(cycle => cycle.routeEdgeIds))
  const candidates = edges.filter(edge => {
    const id = edge.originalId ?? edge.id
    return Boolean(id) && edge.kind === 'progression' && edge.from !== 'start' && edge.to !== 'start'
      && !cycleEdges.has(id!) && !edge.lockId && !edge.secret && !edge.blocked && !edge.oneWay && !edge.dangerous
  })
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!] }
  const targetDirectCount = Math.ceil(candidates.length * 0.25)
  const directConnections = new Set<string>()
  for (const edge of candidates) {
    if (directConnections.size >= targetDirectCount) break
    if (random() > 0.22) continue
    const parent = modules.find(module => module.missionNodeId === edge.from)
    const child = modules.find(module => module.missionNodeId === edge.to)
    const id = edge.originalId ?? edge.id
    if (parent && child && id && abutRoom(parent, child, modules, request, random)) directConnections.add(id)
  }
  return directConnections
}
