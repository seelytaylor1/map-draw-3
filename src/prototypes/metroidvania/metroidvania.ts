export type Variant = 'spine' | 'orbit' | 'cavern'

export type Ability = 'Dash' | 'Claw' | 'Lantern'
export type RoomKind = 'start' | 'normal' | 'ability' | 'lock' | 'goal' | 'secret' | 'boss'
export type EdgeKind = 'path' | 'locked' | 'shortcut' | 'secret' | 'one-way'

export type Room = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  zone: string
  kind: RoomKind
  detail: string
  ability?: Ability
  gate?: Ability
}

export type Edge = {
  id: string
  from: string
  to: string
  kind: EdgeKind
  gate?: Ability
  label?: string
}

export type Layout = {
  variant: Variant
  seed: number
  name: string
  thesis: string
  rooms: Room[]
  edges: Edge[]
  order: Ability[]
  goalId: string
  metrics: { rooms: number; loops: number; gates: number; secrets: number; reachable: boolean }
  steps: string[]
}

export type PlayState = {
  currentRoomId: string
  abilities: Ability[]
  visitedIds: string[]
  log: string[]
  moves: number
  shortcuts: number
  complete: boolean
}

export type TravelOption = {
  room: Room
  relation: Edge
  unlocked: boolean
}

export type Rng = () => number

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const abilityNames: Ability[] = ['Dash', 'Claw', 'Lantern']

function jitter(random: Rng, amount: number) {
  return (random() - 0.5) * amount
}

function room(
  id: string,
  label: string,
  x: number,
  y: number,
  zone: string,
  kind: RoomKind,
  detail: string,
  random: Rng,
  extra: Partial<Room> = {},
): Room {
  return {
    id,
    label,
    x: x + jitter(random, 1.8),
    y: y + jitter(random, 1.4),
    w: extra.w ?? 10,
    h: extra.h ?? 6,
    zone,
    kind,
    detail,
    ...extra,
  }
}

function edge(id: string, from: string, to: string, kind: EdgeKind = 'path', extra: Partial<Edge> = {}): Edge {
  return { id, from, to, kind, ...extra }
}

function countLoops(rooms: Room[], edges: Edge[]) {
  const openEdges = edges.filter(item => item.kind !== 'one-way')
  const components = Math.max(1, rooms.length ? 1 : 0)
  return Math.max(0, openEdges.length - rooms.length + components)
}

function canReachGoal(layout: Pick<Layout, 'rooms' | 'edges' | 'goalId' | 'order'>) {
  const have = new Set<Ability>()
  const visited = new Set<string>()
  let frontier = ['start']
  let changed = true
  while (changed) {
    changed = false
    while (frontier.length) {
      const id = frontier.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const current = layout.rooms.find(roomItem => roomItem.id === id)
      if (current?.ability) have.add(current.ability)
      for (const relation of layout.edges) {
        const next = relation.from === id ? relation.to : relation.to === id ? relation.from : null
        if (!next || relation.kind === 'one-way') continue
        if (relation.gate && !have.has(relation.gate)) continue
        if (!visited.has(next)) frontier.push(next)
      }
    }
    const before = visited.size
    for (const current of layout.rooms) {
      if (current.ability && visited.has(current.id)) have.add(current.ability)
    }
    for (const relation of layout.edges) {
      const next = visited.has(relation.from) ? relation.to : visited.has(relation.to) ? relation.from : null
      if (next && (!relation.gate || have.has(relation.gate)) && !visited.has(next)) frontier.push(next)
    }
    changed = visited.size !== before || frontier.length > 0
  }
  return visited.has(layout.goalId)
}

function finish(variant: Variant, seed: number, name: string, thesis: string, rooms: Room[], edges: Edge[], order: Ability[], goalId: string, steps: string[]): Layout {
  const result = { variant, seed, name, thesis, rooms, edges, order, goalId, metrics: { rooms: rooms.length, loops: countLoops(rooms, edges), gates: edges.filter(item => item.gate).length, secrets: edges.filter(item => item.kind === 'secret').length, reachable: false }, steps }
  result.metrics.reachable = canReachGoal(result)
  return result
}

function buildSpine(seed: number): Layout {
  const random = createRng(seed)
  const rooms = [
    room('start', 'The Sluice', 8, 38, 'ENTRY', 'start', 'A safe room with two exits and a readable first choice.', random, { w: 13, h: 8 }),
    room('s1', 'Moss Gallery', 28, 38, 'LOWER ARCH', 'normal', 'A generous first branch. Teaches the loop before the first ability.', random),
    room('s2', 'Broken Lift', 48, 38, 'LOWER ARCH', 'normal', 'A vertical promise: this dead end becomes a shortcut later.', random),
    room('dash', 'Gale Chapel', 55, 17, 'UPPER ARCH', 'ability', 'A wind shrine placed off the critical line. Dash is earned, not handed out.', random, { ability: 'Dash', w: 12, h: 7 }),
    room('claw', 'Root Bastion', 31, 9, 'ROOTWORKS', 'ability', 'A high-risk detour that rewards the Claw for vertical exploration.', random, { ability: 'Claw', w: 12, h: 7 }),
    room('lantern', 'The Black Orchard', 74, 38, 'LOWER ARCH', 'ability', 'The long loop payoff. Lantern reveals the secret route and final gate.', random, { ability: 'Lantern', w: 14, h: 7 }),
    room('g1', 'Wind Door', 72, 17, 'UPPER ARCH', 'lock', 'First lock. It folds the player back through known space after Dash.', random, { gate: 'Dash', w: 11, h: 6 }),
    room('g2', 'Root Door', 49, 9, 'ROOTWORKS', 'lock', 'Second lock. The return route is now a vertical shortcut.', random, { gate: 'Claw', w: 11, h: 6 }),
    room('g3', 'Night Door', 93, 27, 'THE DEEP', 'lock', 'Final lock before the goal. Optional secrets point here too.', random, { gate: 'Lantern', w: 11, h: 6 }),
    room('secret', 'Mapmaker’s Nook', 93, 11, 'THE DEEP', 'secret', 'A one-way peek that exposes the final chamber from above.', random, { w: 13, h: 6 }),
    room('goal', 'Heart of the Labyrinth', 111, 27, 'THE DEEP', 'goal', 'Goal: defeat the guardian and open the unexplored lower descent.', random, { w: 17, h: 9 }),
  ]
  const edges = [
    edge('e1', 'start', 's1'), edge('e2', 's1', 's2'), edge('e3', 's2', 'dash'), edge('e4', 'dash', 'g1', 'locked', { gate: 'Dash', label: 'DASH' }),
    edge('e5', 'g1', 'claw'), edge('e6', 'claw', 'g2', 'locked', { gate: 'Claw', label: 'CLAW' }), edge('e7', 'g2', 'lantern'),
    edge('e8', 'lantern', 'g3', 'locked', { gate: 'Lantern', label: 'LANTERN' }), edge('e9', 'g3', 'goal', 'locked', { gate: 'Lantern', label: 'BOSS GATE' }),
    edge('loop-a', 's1', 'claw', 'shortcut', { gate: 'Dash', label: 'UP-SHORTCUT' }), edge('loop-b', 's2', 'lantern', 'shortcut', { gate: 'Claw', label: 'BACKTRACK LOOP' }),
    edge('secret-edge', 'g1', 'secret', 'secret', { label: 'HIDDEN' }), edge('secret-goal', 'secret', 'g3', 'secret', { label: 'REVEAL' }),
  ]
  return finish('spine', seed, 'Critical Spine', 'A critical path with deliberate loops that turn backtracking into reward.', rooms, edges, ['Dash', 'Claw', 'Lantern'], 'goal', [
    'Enter the Sluice', 'Find Dash in the upper arch', 'Use the up-shortcut to reach Claw', 'Return through the lower loop', 'Use Lantern on the final gate', 'Break the Heart guardian',
  ])
}

function buildOrbit(seed: number): Layout {
  const random = createRng(seed + 97)
  const rooms = [
    room('start', 'The Observatory', 50, 39, 'CENTER', 'start', 'The player begins at the eye of a radial dungeon.', random, { w: 15, h: 9 }),
    room('west', 'Saltworks', 16, 39, 'RING ONE', 'normal', 'A lateral tutorial pocket. Safe, fast, and easy to re-enter.', random),
    room('east', 'Flooded Archive', 84, 39, 'RING ONE', 'normal', 'Readable landmark room. It teaches that water is a route, not a wall.', random),
    room('north', 'Bell Tower', 50, 11, 'RING ONE', 'normal', 'A vertical view of the whole dungeon with a locked descent.', random),
    room('south', 'Buried Engine', 50, 67, 'RING ONE', 'lock', 'The first gate is visible from spawn but approached from below.', random, { gate: 'Dash', w: 12, h: 7 }),
    room('dash', 'The Wind Well', 16, 11, 'RING TWO', 'ability', 'Dash sits in a side orbit, never directly on the critical path.', random, { ability: 'Dash', w: 12, h: 7 }),
    room('claw', 'Climber’s Reliquary', 84, 11, 'RING TWO', 'ability', 'Claw is reached through a loop that crosses the center twice.', random, { ability: 'Claw', w: 13, h: 7 }),
    room('lantern', 'The Moon Vault', 16, 67, 'RING TWO', 'ability', 'Lantern is optional until the goal reveals itself.', random, { ability: 'Lantern', w: 12, h: 7 }),
    room('gate', 'Black Meridian', 84, 67, 'RING TWO', 'lock', 'A multi-ability gate tests whether the orbit order is understood.', random, { gate: 'Claw', w: 13, h: 7 }),
    room('secret', 'The Thin Place', 50, 88, 'UNDER-RING', 'secret', 'Secret return route. It is shorter, but only after Lantern.', random, { w: 13, h: 6 }),
    room('goal', 'Crown of Ash', 111, 67, 'RING THREE', 'goal', 'Goal: open the Crown and unlock the descent below the map.', random, { w: 15, h: 9 }),
  ]
  const edges = [
    edge('o1', 'start', 'west'), edge('o2', 'west', 'dash'), edge('o3', 'dash', 'north'), edge('o4', 'north', 'start'),
    edge('o5', 'start', 'east'), edge('o6', 'east', 'claw'), edge('o7', 'claw', 'north'), edge('o8', 'north', 'start'),
    edge('o9', 'start', 'south'), edge('o10', 'south', 'lantern', 'locked', { gate: 'Dash', label: 'DASH' }), edge('o11', 'lantern', 'secret'),
    edge('o12', 'secret', 'gate', 'locked', { gate: 'Lantern', label: 'LANTERN' }), edge('o13', 'gate', 'goal', 'locked', { gate: 'Claw', label: 'CLAW + LANTERN' }),
    edge('o14', 'east', 'gate', 'shortcut', { label: 'OUTER ORBIT' }), edge('o15', 'west', 'south', 'shortcut', { label: 'LOW LOOP' }),
  ]
  return finish('orbit', seed, 'Central Hub', 'A radial dungeon that asks: can every lock be visible before it is solvable?', rooms, edges, ['Dash', 'Claw', 'Lantern'], 'goal', [
    'Read the center', 'Orbit west for Dash', 'Cross the center and climb for Claw', 'Drop south after Dash', 'Find Lantern in the under-ring', 'Complete the outer orbit',
  ])
}

function buildCavern(seed: number): Layout {
  const random = createRng(seed + 211)
  const rooms = [
    room('start', 'Mouth of the Deep', 10, 45, 'OUTER CAVERN', 'start', 'A broad entrance with no obvious forward direction.', random, { w: 15, h: 9 }),
    room('a', 'Fungal Grotto', 34, 23, 'OUTER CAVERN', 'normal', 'A soft fork. The player sees multiple silhouettes through fog.', random, { w: 14, h: 9 }),
    room('b', 'Bone Run', 37, 62, 'OUTER CAVERN', 'normal', 'A low corridor with a readable hazard rhythm.', random, { w: 13, h: 8 }),
    room('c', 'Collapsed Choir', 61, 12, 'MID CAVERN', 'lock', 'The first broken bridge. Dash is the answer, but Claw is waiting beyond it.', random, { gate: 'Dash', w: 14, h: 8 }),
    room('dash', 'Red Echo', 65, 39, 'MID CAVERN', 'ability', 'Dash hides in the noise, reached from either lower approach.', random, { ability: 'Dash', w: 13, h: 8 }),
    room('claw', 'The Hanging Garden', 90, 21, 'MID CAVERN', 'ability', 'Claw is staged as a sightline reward, not a checklist room.', random, { ability: 'Claw', w: 14, h: 8 }),
    room('lantern', 'Glass Grave', 88, 63, 'MID CAVERN', 'ability', 'Lantern makes the fog honest and exposes the hidden branch.', random, { ability: 'Lantern', w: 13, h: 8 }),
    room('lock-a', 'Tide Lock', 113, 43, 'INNER CAVERN', 'lock', 'A flooded lock that loops back to the first room.', random, { gate: 'Dash', w: 13, h: 8 }),
    room('secret', 'Unmapped Hollow', 113, 16, 'INNER CAVERN', 'secret', 'Secret objective: a map fragment hints at the true goal position.', random, { w: 15, h: 8 }),
    room('boss', 'The Unnamed Nest', 136, 42, 'INNER CAVERN', 'boss', 'A false goal: defeating this guardian opens the way, but is not the end.', random, { w: 16, h: 10 }),
    room('goal', 'The First Light', 157, 61, 'BELOW THE MAP', 'goal', 'Goal: return with all three abilities and light the descent.', random, { w: 17, h: 10 }),
  ]
  const edges = [
    edge('c1', 'start', 'a'), edge('c2', 'start', 'b'), edge('c3', 'a', 'dash'), edge('c4', 'b', 'dash'), edge('c5', 'dash', 'c'),
    edge('c6', 'c', 'claw', 'locked', { gate: 'Dash', label: 'DASH' }), edge('c7', 'dash', 'lantern', 'shortcut', { label: 'LOW PASS' }),
    edge('c8', 'lantern', 'lock-a', 'locked', { gate: 'Dash', label: 'DASH' }), edge('c9', 'claw', 'lock-a', 'shortcut', { label: 'HIGH PASS' }),
    edge('c10', 'lock-a', 'boss'), edge('c11', 'boss', 'goal', 'locked', { gate: 'Lantern', label: 'LANTERN' }), edge('c12', 'claw', 'secret', 'secret', { label: 'FOG TRAIL' }),
    edge('c13', 'secret', 'boss', 'secret', { label: 'MAP FRAGMENT' }), edge('c14', 'b', 'a', 'shortcut', { label: 'LOOP' }),
  ]
  return finish('cavern', seed, 'Branch-and-merge', 'A fog-first layout where loops emerge from the ecology of the cavern, not a visible spine.', rooms, edges, ['Dash', 'Claw', 'Lantern'], 'goal', [
    'Choose a side at the mouth', 'Find Dash at the converging fork', 'Claw opens the high cavern', 'Lantern makes secrets legible', 'Defeat the false goal', 'Light the descent below the map',
  ])
}

export function buildLayout(variant: Variant, seed: number): Layout {
  if (variant === 'orbit') return buildOrbit(seed)
  if (variant === 'cavern') return buildCavern(seed)
  return buildSpine(seed)
}

export function roomById(layout: Layout, id: string) {
  return layout.rooms.find(roomItem => roomItem.id === id)
}

export function edgePath(layout: Layout, relation: Edge) {
  const from = roomById(layout, relation.from)!
  const to = roomById(layout, relation.to)!
  const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  if (layout.variant === 'cavern') {
    const bow = Math.sin((from.x + to.y) / 14) * 5
    return `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${(start.y + end.y) / 2 + bow} ${end.x} ${end.y}`
  }
  const midX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
}

export function connectedIds(layout: Layout, selectedId: string | null) {
  if (!selectedId) return new Set<string>()
  const visited = new Set<string>(['start'])
  const queue = ['start']
  while (queue.length) {
    const current = queue.shift()!
    for (const relation of layout.edges) {
      const next = relation.from === current ? relation.to : relation.to === current ? relation.from : null
      if (!next || relation.gate || relation.kind === 'one-way' || visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  if (visited.has(selectedId)) return visited
  return new Set([selectedId])
}

export function initialPlayState(): PlayState {
  return { currentRoomId: 'start', abilities: [], visitedIds: ['start'], log: ['START · The Sluice is yours to leave.'], moves: 0, shortcuts: 0, complete: false }
}

export function travelOptions(layout: Layout, state: PlayState): TravelOption[] {
  return layout.edges.flatMap(relation => {
    const targetId = relation.from === state.currentRoomId ? relation.to : relation.to === state.currentRoomId ? relation.from : null
    if (!targetId || relation.kind === 'one-way') return []
    const target = roomById(layout, targetId)
    if (!target) return []
    return [{ room: target, relation, unlocked: !relation.gate || state.abilities.includes(relation.gate) }]
  })
}

export function travelTo(layout: Layout, state: PlayState, targetId: string) {
  const option = travelOptions(layout, state).find(item => item.room.id === targetId)
  if (!option) return { state, ok: false, message: 'There is no direct passage from this chamber.' }
  if (!option.unlocked) {
    const message = `LOCKED · ${option.relation.gate} is required.`
    return { state: { ...state, log: [...state.log, message].slice(-7) }, ok: false, message }
  }
  const abilities = [...state.abilities]
  const found = option.room.ability && !abilities.includes(option.room.ability)
  if (found) abilities.push(option.room.ability!)
  const complete = option.room.id === layout.goalId
  const message = found ? `FOUND · ${option.room.ability} earned in ${option.room.label}.` : complete ? `GOAL · ${option.room.label} reached.` : option.relation.kind === 'shortcut' ? `SHORTCUT · ${option.room.label}.` : option.relation.kind === 'secret' ? `SECRET · ${option.room.label}.` : `MOVE · ${option.room.label}.`
  return {
    state: {
      currentRoomId: option.room.id,
      abilities,
      visitedIds: [...new Set([...state.visitedIds, option.room.id])],
      log: [...state.log, message].slice(-7),
      moves: state.moves + 1,
      shortcuts: state.shortcuts + (option.relation.kind === 'shortcut' ? 1 : 0),
      complete,
    },
    ok: true,
    message,
  }
}

export const VARIANT_META: Record<Variant, { index: string; label: string; strap: string; color: string }> = {
  spine: { index: '01', label: 'Critical Spine', strap: 'Critical path', color: '#d79a52' },
  orbit: { index: '02', label: 'Central Hub', strap: 'Radial progression', color: '#8ea8d5' },
  cavern: { index: '03', label: 'Branch-and-merge', strap: 'Branching topology', color: '#8ab58d' },
}

export const ABILITY_META: Record<Ability, { short: string; color: string }> = {
  Dash: { short: 'DASH', color: '#e6a356' },
  Claw: { short: 'CLAW', color: '#92aee0' },
  Lantern: { short: 'LANTERN', color: '#e0c46f' },
}

export function abilityIndex(ability?: Ability) {
  return ability ? abilityNames.indexOf(ability) + 1 : 0
}
