import type { GenerationRequest, Mission, Point, SpatialModule } from './missionTypes'
import { normalizeSeed } from './random'

export function layoutRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ state >>> 15, state | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Optimize a graph embedding before carving. Empty slots are important: they
// reserve wall and routing space, rather than maximizing painted floor area.
export function arrangeRooms(request: GenerationRequest, mission: Mission, modules: SpatialModule[], edges: Array<{ from: string; to: string }>, attempt: number): void {
  const random = layoutRandom(normalizeSeed(request.seed) + attempt * 7919)
  const n = modules.length
  let spacing = Math.min(13, Math.max(6, Math.floor(Math.sqrt((request.cols - 4) * (request.rows - 4) / (n * 1.15)))))
  while (spacing > 6 && Math.floor((request.cols - 2) / spacing) * Math.floor((request.rows - 2) / spacing) < n) spacing--
  const cols = Math.max(1, Math.floor((request.cols - 2) / spacing))
  const rows = Math.max(1, Math.floor((request.rows - 2) / spacing))
  const slots: Point[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) slots.push({ col: x, row: y })
  if (slots.length < n) return
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
    // Dramatic Arc reserves a rectangular two-sided chamber. It must not use
    // the ordinary chamfer/cross variants: the darkness slab needs a clean,
    // full room-width silhouette like a deliberate interior set-piece.
    const width = landmark ? landmarkSize : 3 + Math.floor(random() * (max - 2))
    const height = landmark ? landmarkSize : 3 + Math.floor(random() * (max - 2))
    const origin = { col: 1 + slot.col * spacing + Math.floor((spacing - width) / 2), row: 1 + slot.row * spacing + Math.floor((spacing - height) / 2) }
    module.origin = origin; module.width = width; module.height = height; module.ports = []
    const shapeCount = width >= 7 && height >= 7 ? 3 : 2
    const shape = !dramaticChamber && degree <= 3 && width >= 5 && height >= 5 ? Math.floor(random() * shapeCount) : 0
    module.footprint = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Rectangular chambers, chamfered halls, and cruciform sanctuaries all
      // retain a connected central interior and usable cardinal door spans.
      const corner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1)
      const arm = (x < 2 || x >= width - 2) && (y < 2 || y >= height - 2)
      if ((shape === 1 && corner) || (shape === 2 && arm)) continue
      module.footprint.push({ col: origin.col + x, row: origin.row + y })
    }
  })
}
