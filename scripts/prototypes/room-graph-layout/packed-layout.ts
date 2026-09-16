// PROTOTYPE B: global graph packing.
// Question: can a general graph layout place the same semantic plan more
// flexibly while routing connections around room obstacles?

import { overlap, renderMap, roomById, roomCenter, type DungeonPlan, type LayoutResult, type PlacedRoom, type Point, type Rect, type RelationSpec, type RoutedRelation } from './shared.ts'

const WIDTH = 74
const HEIGHT = 32

function seededJitter(seed: number, index: number, limit: number) {
  let value = (seed + index * 1103515245 + 12345) >>> 0
  value = (Math.imul(value ^ (value >>> 16), 2246822519) + 3266489917) >>> 0
  return (value % (limit * 2 + 1)) - limit
}

function initialRect(room: DungeonPlan['rooms'][number], seed: number, index: number): Rect {
  if (room.id === 'start') return { x: 2, y: 14, w: room.width, h: room.height }
  if (room.id === 'goal') return { x: 64, y: 14, w: room.width, h: room.height }
  if (room.role === 'lake') return { x: 33, y: 13, w: room.width, h: room.height }
  const y = room.path === 'A' ? 8 : room.path === 'B' ? 23 : 15
  const x = 11 + room.order * 8 + seededJitter(seed, index, 3)
  return { x, y: y + seededJitter(seed + 7, index, 2), w: room.width, h: room.height }
}

function center(rect: Rect): Point {
  return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + Math.floor(rect.h / 2) }
}

function clampRect(rect: Rect): Rect {
  return { ...rect, x: Math.max(1, Math.min(WIDTH - rect.w - 1, rect.x)), y: Math.max(1, Math.min(HEIGHT - rect.h - 1, rect.y)) }
}

function moveApart(left: Rect, right: Rect): [Rect, Rect] {
  const leftCenter = center(left)
  const rightCenter = center(right)
  const dx = rightCenter.x - leftCenter.x
  const dy = rightCenter.y - leftCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const amount = Math.ceil((left.w + right.w) / 2 + 2 - Math.abs(dx))
    const direction = dx >= 0 ? 1 : -1
    return [clampRect({ ...left, x: left.x - Math.round((amount * direction) / 2) }), clampRect({ ...right, x: right.x + Math.round((amount * direction) / 2) })]
  }
  const amount = Math.ceil((left.h + right.h) / 2 + 2 - Math.abs(dy))
  const direction = dy >= 0 ? 1 : -1
  return [clampRect({ ...left, y: left.y - Math.round((amount * direction) / 2) }), clampRect({ ...right, y: right.y + Math.round((amount * direction) / 2) })]
}

function pack(plan: DungeonPlan, seed: number): PlacedRoom[] {
  const rects = plan.rooms.map((room, index) => ({ room, rect: initialRect(room, seed, index) }))
  const anchored = new Set(['start', 'goal', 'lake'])
  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        if (!overlap(rects[i].rect, rects[j].rect, 1)) continue
        const [left, right] = moveApart(rects[i].rect, rects[j].rect)
        if (!anchored.has(rects[i].room.id)) rects[i].rect = left
        if (!anchored.has(rects[j].room.id)) rects[j].rect = right
      }
    }
    for (const relation of plan.relations) {
      const from = rects.find((item) => item.room.id === relation.from)
      const to = rects.find((item) => item.room.id === relation.to)
      if (!from || !to) continue
      const a = center(from.rect)
      const b = center(to.rect)
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const desired = relation.path === 'hub' ? 12 : 16
      if (distance <= desired || anchored.has(from.room.id) && anchored.has(to.room.id)) continue
      const pull = Math.max(1, Math.round((distance - desired) / 12))
      if (!anchored.has(from.room.id)) from.rect = clampRect({ ...from.rect, x: from.rect.x + Math.sign(b.x - a.x) * pull, y: from.rect.y + Math.sign(b.y - a.y) * pull })
      if (!anchored.has(to.room.id)) to.rect = clampRect({ ...to.rect, x: to.rect.x - Math.sign(b.x - a.x) * pull, y: to.rect.y - Math.sign(b.y - a.y) * pull })
    }
  }
  return rects.map(({ room, rect }) => ({ ...room, rect: clampRect({ ...rect, x: Math.round(rect.x), y: Math.round(rect.y) }) }))
}

function port(room: PlacedRoom, target: PlacedRoom): Point {
  const a = roomCenter(room)
  const b = roomCenter(target)
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) return { x: b.x >= a.x ? room.rect.x + room.rect.w : room.rect.x - 1, y: a.y }
  return { x: a.x, y: b.y >= a.y ? room.rect.y + room.rect.h : room.rect.y - 1 }
}

function routeAStar(relation: RelationSpec, rooms: PlacedRoom[], previous: RoutedRelation[]): Point[] | undefined {
  const from = roomById(rooms, relation.from)
  const to = roomById(rooms, relation.to)
  if (!from || !to) return undefined
  const start = port(from, to)
  const end = port(to, from)
  const key = (point: Point) => `${point.x},${point.y}`
  const allowed = new Set([key(start), key(end)])
  const blocked = new Set<string>()
  for (const room of rooms) {
    for (let y = room.rect.y - 1; y <= room.rect.y + room.rect.h; y += 1) {
      for (let x = room.rect.x - 1; x <= room.rect.x + room.rect.w; x += 1) blocked.add(key({ x, y }))
    }
  }
  const queue: Array<{ point: Point; cost: number; priority: number }> = [{ point: start, cost: 0, priority: 0 }]
  const cameFrom = new Map<string, string>()
  const cost = new Map<string, number>([[key(start), 0]])
  const existing = new Set(previous.flatMap((route) => route.points.map(key)))
  const neighbors = (point: Point) => [{ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }]
  while (queue.length) {
    queue.sort((a, b) => a.priority - b.priority)
    const current = queue.shift()!
    if (key(current.point) === key(end)) {
      const path: Point[] = []
      let cursor = key(end)
      while (cursor) {
        const [x, y] = cursor.split(',').map(Number)
        path.unshift({ x, y })
        cursor = cameFrom.get(cursor) ?? ''
      }
      return path
    }
    for (const next of neighbors(current.point)) {
      if (next.x < 1 || next.x >= WIDTH - 1 || next.y < 1 || next.y >= HEIGHT - 1) continue
      if (blocked.has(key(next)) && !allowed.has(key(next))) continue
      const nextKey = key(next)
      const nextCost = current.cost + 1 + (existing.has(nextKey) ? 4 : 0)
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue
      cost.set(nextKey, nextCost)
      cameFrom.set(nextKey, key(current.point))
      queue.push({ point: next, cost: nextCost, priority: nextCost + Math.abs(end.x - next.x) + Math.abs(end.y - next.y) })
    }
  }
  return undefined
}

export function layoutPacked(plan: DungeonPlan, seed: number): LayoutResult {
  const rooms = pack(plan, seed)
  const routes: RoutedRelation[] = []
  const failures: string[] = []
  const sortedRelations = [...plan.relations].sort((left, right) => (left.path === 'A' ? -1 : right.path === 'A' ? 1 : left.path === 'B' ? -1 : right.path === 'B' ? 1 : 0))
  for (const relation of sortedRelations) {
    const points = routeAStar(relation, rooms, routes)
    if (!points) failures.push(`${relation.id}: no clear route between ${relation.from} and ${relation.to}`)
    else routes.push({ ...relation, points })
  }
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      if (overlap(rooms[i].rect, rooms[j].rect, 1)) failures.push(`room collision after packing: ${rooms[i].id} / ${rooms[j].id}`)
    }
  }
  return {
    prototype: 'B — global graph packing',
    plan,
    rooms,
    routes,
    failures,
    map: renderMap(rooms, routes, WIDTH, HEIGHT),
    stats: { rooms: rooms.length, relations: plan.relations.length, routed: routes.length, failedRoutes: failures.filter((failure) => failure.includes('route')).length, cycles: Math.max(0, plan.relations.length - rooms.length + 1) },
  }
}

