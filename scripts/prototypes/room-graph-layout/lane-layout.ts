// PROTOTYPE A: explicit loop lanes.
// Question: does deliberately placing Path A and Path B in separate lanes make
// loop intent easier to read than general-purpose graph packing?

import { directRoute, overlap, renderMap, roomById, type DungeonPlan, type LayoutResult, type PlacedRoom, type Rect, type RoutedRelation } from './shared.ts'

const WIDTH = 74
const HEIGHT = 32

function place(plan: DungeonPlan): PlacedRoom[] {
  const placed: PlacedRoom[] = []
  const start = plan.rooms.find((room) => room.id === 'start')!
  const goal = plan.rooms.find((room) => room.id === 'goal')!
  const laneRooms = plan.rooms.filter((room) => room.path === 'A' || room.path === 'B')
  const a = laneRooms.filter((room) => room.path === 'A').sort((left, right) => left.order - right.order)
  const b = laneRooms.filter((room) => room.path === 'B').sort((left, right) => left.order - right.order)

  const addLane = (rooms: typeof a, y: number) => {
    const left = 15
    const right = 56
    rooms.forEach((room, index) => {
      const x = rooms.length === 1 ? Math.floor((left + right) / 2) : Math.round(left + ((right - left) * index) / (rooms.length - 1))
      placed.push({ ...room, rect: { x: x - Math.floor(room.width / 2), y: y - Math.floor(room.height / 2), w: room.width, h: room.height } })
    })
  }

  addLane(a, 7)
  addLane(b, 24)
  const lake = plan.rooms.find((room) => room.role === 'lake')
  if (lake) placed.push({ ...lake, rect: { x: 34, y: 13, w: lake.width, h: lake.height } })
  placed.push(
    { ...start, rect: { x: 2, y: 14, w: start.width, h: start.height } },
    { ...goal, rect: { x: 64, y: 14, w: goal.width, h: goal.height } },
  )
  return placed
}

export function layoutLanes(plan: DungeonPlan): LayoutResult {
  const rooms = place(plan)
  const failures: string[] = []
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      if (overlap(rooms[i].rect, rooms[j].rect, 1)) failures.push(`room collision: ${rooms[i].id} / ${rooms[j].id}`)
    }
  }
  const routes: RoutedRelation[] = []
  for (const relation of plan.relations) {
    const from = roomById(rooms, relation.from)
    const to = roomById(rooms, relation.to)
    if (!from || !to) failures.push(`${relation.id}: missing endpoint`)
    else routes.push({ ...relation, points: directRoute(from, to) })
  }
  return {
    prototype: 'A — explicit loop lanes',
    plan,
    rooms,
    routes,
    failures,
    map: renderMap(rooms, routes, WIDTH, HEIGHT),
    stats: { rooms: rooms.length, relations: plan.relations.length, routed: routes.length, failedRoutes: failures.filter((failure) => failure.includes('endpoint')).length, cycles: Math.max(0, plan.relations.length - rooms.length + 1) },
  }
}

