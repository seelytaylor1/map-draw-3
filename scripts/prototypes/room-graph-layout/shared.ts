// PROTOTYPE QUESTION: can loop semantics stay independent from room placement
// and corridor drawing? This module is the portable semantic model shared by
// two throwaway placement experiments.

export type LoopType = 1 | 2 | 3 | 4 | 5 | 6
export type PathName = 'A' | 'B' | 'hub' | 'extra' | 'shared'
export type RoomRole = 'start' | 'goal' | 'normal' | 'key' | 'lake' | 'npc'
export type RelationKind = 'open' | 'locked' | 'secret' | 'valve' | 'return'

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type RoomSpec = {
  id: string
  role: RoomRole
  path: PathName
  order: number
  width: number
  height: number
  label: string
  note?: string
}

export type RelationSpec = {
  id: string
  from: string
  to: string
  kind: RelationKind
  path: PathName
  note?: string
}

export type DungeonPlan = {
  loopType: LoopType
  loopName: string
  goalKind: string
  rooms: RoomSpec[]
  relations: RelationSpec[]
}

export type PlacedRoom = RoomSpec & { rect: Rect }
export type RoutedRelation = RelationSpec & { points: Point[] }

export type LayoutResult = {
  prototype: string
  plan: DungeonPlan
  rooms: PlacedRoom[]
  routes: RoutedRelation[]
  failures: string[]
  map: string[]
  stats: {
    rooms: number
    relations: number
    routed: number
    failedRoutes: number
    cycles: number
  }
}

export const LOOP_NAMES: Record<LoopType, string> = {
  1: 'Long A / Long B',
  2: 'Long A / Short B',
  3: 'Alpha',
  4: 'Beta',
  5: 'Short A / Short B',
  6: 'Lake',
}

const GOAL_KINDS = ['treasure hoard', 'stairway downward', 'useful NPC', 'another loop']

function rng(seed: number) {
  let state = seed >>> 0
  return {
    next(max: number) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % max
    },
  }
}

function createRoom(id: string, role: RoomRole, path: PathName, order: number, random: ReturnType<typeof rng>, note?: string): RoomSpec {
  const shapes = [
    { width: 7, height: 4 },
    { width: 8, height: 4 },
    { width: 6, height: 5 },
    { width: 9, height: 3 },
  ]
  const shape = shapes[random.next(shapes.length)]
  const label = role === 'start' ? 'S' : role === 'goal' ? 'G' : role === 'key' ? 'K' : role === 'lake' ? 'H' : role === 'npc' ? 'N' : path
  return { id, role, path, order, ...shape, label, note }
}

function addChain(
  relations: RelationSpec[],
  ids: string[],
  end: string,
  path: PathName,
  finalKind: RelationKind = 'open',
  finalNote?: string,
) {
  const chain = [...ids, end]
  for (let i = 0; i < chain.length - 1; i += 1) {
    const isFinal = i === chain.length - 2
    relations.push({
      id: `${path.toLowerCase()}-${i + 1}`,
      from: chain[i],
      to: chain[i + 1],
      kind: isFinal ? finalKind : 'open',
      path,
      note: isFinal ? finalNote : undefined,
    })
  }
}

function addPathRooms(
  rooms: RoomSpec[],
  prefix: string,
  count: number,
  path: PathName,
  random: ReturnType<typeof rng>,
  special?: { index: number; role: RoomRole; note?: string },
) {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}${index + 1}`
    const selected = special?.index === index ? special.role : 'normal'
    rooms.push(createRoom(id, selected, path, index, random, special?.index === index ? special.note : undefined))
    ids.push(id)
  }
  return ids
}

export function createPlan(loopType: LoopType, seed: number): DungeonPlan {
  const random = rng(seed + loopType * 7919)
  const rooms: RoomSpec[] = [
    createRoom('start', 'start', 'shared', 0, random),
    createRoom('goal', 'goal', 'shared', 999, random, GOAL_KINDS[random.next(GOAL_KINDS.length)]),
  ]
  const relations: RelationSpec[] = []
  const longCount = 4 + random.next(2)
  const shortCount = 2 + random.next(2)

  if (loopType === 6) {
    rooms.push(createRoom('lake', 'lake', 'hub', 0, random, 'central room connects to every other room'))
    const a = addPathRooms(rooms, 'a', 2, 'A', random)
    const b = addPathRooms(rooms, 'b', 2, 'B', random)
    const all = ['start', ...a, ...b, 'goal']
    all.forEach((id, index) => {
      relations.push({ id: `lake-${index + 1}`, from: 'lake', to: id, kind: 'open', path: 'hub' })
    })
    return { loopType, loopName: LOOP_NAMES[loopType], goalKind: rooms[1].note ?? 'goal', rooms, relations }
  }

  if (loopType === 3) {
    const a = addPathRooms(rooms, 'a', shortCount, 'A', random)
    const b = addPathRooms(rooms, 'b', longCount, 'B', random, {
      index: Math.max(0, Math.floor(longCount / 2)),
      role: 'key',
      note: 'grants the capability required by the locked relation',
    })
    addChain(relations, ['start', ...a], 'goal', 'A', 'locked', 'Goal is blocked until the Key is found')
    addChain(relations, ['start', ...b], a[0], 'B', 'return', 'long route returns to the short route before the Lock')
  } else if (loopType === 4) {
    const a = addPathRooms(rooms, 'a', shortCount, 'A', random)
    const b = addPathRooms(rooms, 'b', longCount, 'B', random)
    addChain(relations, ['start', ...a], 'goal', 'A', 'valve', 'Valve changes the return journey or closes behind the party')
    addChain(relations, ['start', ...b], 'goal', 'B', 'return', 'alternative return route')
  } else if (loopType === 5) {
    const a = addPathRooms(rooms, 'a', shortCount, 'A', random)
    const b = addPathRooms(rooms, 'b', shortCount, 'B', random, {
      index: Math.max(0, Math.floor(shortCount / 2)),
      role: 'key',
      note: 'optional key route in a compact loop',
    })
    addChain(relations, ['start', ...a], 'goal', 'A')
    addChain(relations, ['start', ...b], 'goal', 'B')
    relations.push({ id: 'goal-key', from: 'goal', to: b[Math.max(0, Math.floor(b.length / 2))], kind: 'return', path: 'extra', note: 'hallway between Goal and Key room' })
  } else {
    const a = addPathRooms(rooms, 'a', longCount, 'A', random)
    const b = addPathRooms(rooms, 'b', loopType === 2 ? shortCount : longCount, 'B', random)
    addChain(relations, ['start', ...a], 'goal', 'A')
    addChain(relations, ['start', ...b], 'goal', 'B', loopType === 2 ? 'secret' : 'open', loopType === 2 ? 'short route is soft-locked' : undefined)
  }

  return { loopType, loopName: LOOP_NAMES[loopType], goalKind: rooms[1].note ?? 'goal', rooms, relations }
}

export function roomCenter(room: PlacedRoom): Point {
  return { x: room.rect.x + Math.floor(room.rect.w / 2), y: room.rect.y + Math.floor(room.rect.h / 2) }
}

export function roomById(rooms: PlacedRoom[], id: string) {
  return rooms.find((room) => room.id === id)
}

function roomPort(room: PlacedRoom, target: PlacedRoom): Point {
  const from = roomCenter(room)
  const to = roomCenter(target)
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? room.rect.x + room.rect.w : room.rect.x - 1, y: from.y }
  return { x: from.x, y: dy >= 0 ? room.rect.y + room.rect.h : room.rect.y - 1 }
}

export function directRoute(from: PlacedRoom, to: PlacedRoom): Point[] {
  const start = roomPort(from, to)
  const end = roomPort(to, from)
  const points: Point[] = [{ ...start }]
  let cursor = { ...start }
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  const legs = horizontalFirst
    ? [{ x: end.x, y: cursor.y }, { x: end.x, y: end.y }]
    : [{ x: cursor.x, y: end.y }, { x: end.x, y: end.y }]
  for (const leg of legs) {
    while (cursor.x !== leg.x || cursor.y !== leg.y) {
      if (cursor.x !== leg.x) cursor.x += Math.sign(leg.x - cursor.x)
      else cursor.y += Math.sign(leg.y - cursor.y)
      points.push({ ...cursor })
    }
  }
  return points
}

export function overlap(a: Rect, b: Rect, padding = 0) {
  return a.x - padding < b.x + b.w && a.x + a.w + padding > b.x && a.y - padding < b.y + b.h && a.y + a.h + padding > b.y
}

function symbolForRelation(kind: RelationKind) {
  if (kind === 'locked') return '='
  if (kind === 'secret') return ':'
  if (kind === 'valve') return '~'
  if (kind === 'return') return '+'
  return '-'
}

export function renderMap(rooms: PlacedRoom[], routes: RoutedRelation[], width = 74, height = 32): string[] {
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '))
  const inside = (point: Point) => point.x >= 0 && point.x < width && point.y >= 0 && point.y < height
  for (const route of routes) {
    const symbol = symbolForRelation(route.kind)
    route.points.forEach((point, index) => {
      if (inside(point)) cells[point.y][point.x] = symbol
      if (index > 0) {
        const previous = route.points[index - 1]
        if (inside(previous)) cells[previous.y][previous.x] = symbol
      }
    })
    const marker = route.points[Math.floor(route.points.length / 2)]
    if (marker && inside(marker)) cells[marker.y][marker.x] = route.kind === 'locked' ? 'L' : route.kind === 'secret' ? '?' : route.kind === 'valve' ? 'V' : route.kind === 'return' ? 'R' : symbol
  }
  for (const room of rooms) {
    for (let y = room.rect.y; y < room.rect.y + room.rect.h; y += 1) {
      for (let x = room.rect.x; x < room.rect.x + room.rect.w; x += 1) {
        if (!inside({ x, y })) continue
        const edge = x === room.rect.x || y === room.rect.y || x === room.rect.x + room.rect.w - 1 || y === room.rect.y + room.rect.h - 1
        cells[y][x] = edge ? '#' : '.'
      }
    }
    const center = roomCenter(room)
    if (inside(center)) cells[center.y][center.x] = room.label
  }
  return cells.map((row) => row.join('').replace(/\s+$/, ''))
}

