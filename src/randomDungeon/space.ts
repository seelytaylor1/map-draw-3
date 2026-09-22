import { DARKNESS, FLOOR, WATER } from '../constants'
import { createGrid } from '../grid'
import type { AppSnapshotShape, Direction, GeneratedMarkerSemantic, Point } from './commonTypes'
import { createD6Random, normalizeSeed } from './random'
import { arrangeRooms } from './layout'
import { getGenerationStyle } from './styles'
import { validateProgression } from './progression'
import type { DangerEntry, DoorwayStyle, GeneratedDoorway, GenerationDiagnostic, GenerationRequest, Mission, MissionEdge, RoomEncounter, SpacePlan, SpatialConnection, SpatialConnectionSemantic, SpatialModule } from './missionTypes'
import { STAMP_TYPES, type Stamp, type StampType } from '../stamps'
import { DIRECTION_DELTAS, runTiles } from '../directionalRun'
import type { StepRun } from '../steps'
import type { RampRun } from '../ramps'
import type { Label } from '../labels'
import { resolveGeneratedStamp } from './generatedContent'
import { GENERATED_DECORATION_STAMP_TYPES, GENERATED_DOORWAY_STAMP_TYPES } from './generatedStampCatalog'
import { createMonsterEncounterTable, MONSTER_CATALOG, pickRandomMonsterFromTable, type MonsterRecord } from './monsterCatalog'
import { minimumMonsterEncounterCost, numericMonsterLevel, remainingMonsterRoomBudget, resolveDungeonLevelBudget, rollMonsterEncounter, type DungeonLevelBudget } from './monsterBudget'
import { createTrapRecord, formatTrapRecord } from './trapGenerator'
import { createHazardRecord, createUniqueHazardRecord, formatHazardRecord } from './hazardGenerator'
import { resolveDangerKind, rollRoomEncounter } from './roomPopulation'

const keyOf = (point: Point) => `${point.col},${point.row}`
const directions: Direction[] = ['N', 'E', 'S', 'W']
const oppositeDirection: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
const rolledDoorwayStyles = Object.keys(GENERATED_DOORWAY_STAMP_TYPES) as DoorwayStyle[]
const KEY_LOCK_COLORS = [
  '#d52b35', '#3478f6', '#f2c230', '#43a047', '#9c27b0',
  '#ff7a00', '#00acc1', '#ec407a', '#795548', '#5c6bc0',
  '#c0ca33', '#26a69a', '#8e44ad', '#e67e22', '#2980b9',
  '#c0392b', '#16a085', '#7f8c8d', '#d35400', '#2ecc71',
] as const

function center(module: SpatialModule): Point { return { col: module.origin.col + Math.floor(module.width / 2), row: module.origin.row + Math.floor(module.height / 2) } }

function orderRoomsFromEntrance(modules: readonly SpatialModule[], connections: readonly SpatialConnection[]): SpatialModule[] {
  const rooms = modules.filter(module => module.footprint.length > 0)
  const roomsById = new Map(rooms.map(room => [room.id, room]))
  const entrance = rooms.find(room => room.missionNodeId === 'start')
  if (!entrance) return rooms

  const adjacent = new Map<string, string[]>()
  for (const connection of connections) {
    if (!roomsById.has(connection.fromModuleId) || !roomsById.has(connection.toModuleId)) continue
    const from = adjacent.get(connection.fromModuleId) ?? []
    const to = adjacent.get(connection.toModuleId) ?? []
    if (!from.includes(connection.toModuleId)) from.push(connection.toModuleId)
    if (!to.includes(connection.fromModuleId)) to.push(connection.fromModuleId)
    adjacent.set(connection.fromModuleId, from)
    adjacent.set(connection.toModuleId, to)
  }

  const orderedIds: string[] = []
  const visited = new Set<string>([entrance.id])
  const queue = [entrance.id]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!
    orderedIds.push(current)
    for (const neighbor of adjacent.get(current) ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  // Keep any isolated realized room deterministic without letting it displace
  // the entrance-rooted traversal.
  for (const room of rooms) if (!visited.has(room.id)) orderedIds.push(room.id)
  return orderedIds.map(id => roomsById.get(id)!).filter(Boolean)
}

function routeRooms(from: SpatialModule, to: SpatialModule, request: GenerationRequest, modules: SpatialModule[], connections: SpatialConnection[]): Point[] | null {
  const cells = request.cols * request.rows
  const index = (p: Point) => p.row * request.cols + p.col
  const point = (i: number): Point => ({ col: i % request.cols, row: Math.floor(i / request.cols) })
  const blocked = new Uint8Array(cells)
  const occupy = (p: Point) => { if (p.col >= 0 && p.row >= 0 && p.col < request.cols && p.row < request.rows) blocked[index(p)] = 1 }
  for (const module of modules) for (const p of module.footprint) { occupy(p); adjacent(p).forEach(occupy) }
  for (const connection of connections) for (const p of connectionFootprint(connection)) { occupy(p); adjacent(p).forEach(occupy) }
  const exits = (module: SpatialModule) => {
    const result: Array<{ door: Point; outside: Point }> = []
    const own = new Set(module.footprint.map(keyOf))
    const excluded = new Set((module.excludedPortPoints ?? []).map(keyOf))
    const used = module.ports.map(port => port.point)
    // A Central Hub deliberately supports many independent spokes. Its wall
    // may use adjacent apertures (with separate exterior corridors), while
    // ordinary rooms retain the wider separation that improves readability.
    const portSpacing = module.type === 'hub' ? 2 : 3
    for (const door of module.footprint) {
      if (excluded.has(keyOf(door))) continue
      if (used.some(p => Math.abs(p.col - door.col) + Math.abs(p.row - door.row) < portSpacing)) continue
      for (const outside of adjacent(door)) {
        if (own.has(keyOf(outside))) continue
        // An aperture touches exactly one room tile: no corner wrapping.
        if (adjacent(outside).filter(p => own.has(keyOf(p))).length !== 1) continue
        if (outside.col <= 0 || outside.row <= 0 || outside.col >= request.cols - 1 || outside.row >= request.rows - 1) continue
        if (connections.some(c => c.path.some(p => Math.abs(p.col - outside.col) + Math.abs(p.row - outside.row) <= 1))) continue
        if (modules.some(m => m !== module && m.footprint.some(p => Math.abs(p.col - outside.col) + Math.abs(p.row - outside.row) <= 1))) continue
        result.push({ door, outside })
      }
    }
    return result
  }
  const starts = exits(from), ends = exits(to)
  const targets = new Map(ends.map(exit => [index(exit.outside), exit.door]))
  const parent = new Int32Array(cells).fill(-2)
  const roots = new Map<number, Point>()
  const queue: number[] = []
  for (const exit of starts) { const i = index(exit.outside); parent[i] = -1; roots.set(i, exit.door); queue.push(i) }
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!
    if (targets.has(current)) {
      const path = [targets.get(current)!]
      let i = current
      while (parent[i] !== -1) { path.push(point(i)); i = parent[i]! }
      path.push(point(i), roots.get(i)!)
      return path.reverse()
    }
    const p = point(current)
    for (const next of adjacent(p)) {
      if (next.col <= 0 || next.row <= 0 || next.col >= request.cols - 1 || next.row >= request.rows - 1) continue
      const i = index(next)
      if (parent[i] !== -2 || (blocked[i] && !targets.has(i))) continue
      parent[i] = current; queue.push(i)
    }
  }
  return null
}

function edgeSemantic(edge: MissionEdge): SpatialConnectionSemantic {
  if (edge.secret) return 'secret'
  if (edge.oneWay) return 'one-way'
  if (edge.blocked) return 'blocked-return'
  if (edge.lockId) return 'locked'
  if (edge.dangerous) return 'dangerous'
  return 'corridor'
}

function addConnection(connections: SpatialConnection[], modules: Map<string, SpatialModule>, missionEdge: MissionEdge, request: GenerationRequest, cycleId?: string, missionEdgeId = missionEdge.id): SpatialConnection | null {
  const from = modules.get(missionEdge.from)
  const to = modules.get(missionEdge.to)
  if (!from || !to) return null
  const width: 1 | 2 | 4 = 1
  const semantic = edgeSemantic(missionEdge) === 'corridor' && (from.type === 'hub' || to.type === 'hub') ? 'spoke' : edgeSemantic(missionEdge)
  const path = routeRooms(from, to, request, [...modules.values()], connections)
  if (!path) return null
  const apertureFrom = path[0]!, apertureTo = path[path.length - 1]!
  const explicitJunction = false
  const connection: SpatialConnection = {
    id: `connection-${missionEdgeId}-${connections.length}`,
    fromModuleId: from.id,
    toModuleId: to.id,
    path,
    width,
    semantic,
    missionEdgeId,
    ...(cycleId ? { cycleId } : {}),
    // Corridor reuse is not itself a junction. Only a declared hub, branch,
    // or junction module may authorize shared geometry; otherwise validation
    // must reject the accidental crossing.
    explicitJunction,
    traversable: missionEdge.blocked ? 'blocked' : missionEdge.oneWay ? 'one-way' : 'both',
    apertureFrom,
    apertureTo,
  }
  connections.push(connection)
  from.ports.push({ id: `${connection.id}-from`, point: apertureFrom, direction: directionForPath(path), width, connectionId: connection.id })
  to.ports.push({ id: `${connection.id}-to`, point: apertureTo, direction: directionForPath([...path].reverse()), width, connectionId: connection.id })
  return connection
}

export interface SpaceValidationResult { valid: boolean; diagnostics: GenerationDiagnostic[] }

export function buildSpacePlan(request: GenerationRequest, mission: Mission, attempt = 0): SpacePlan {
  const style = getGenerationStyle(request.style)
  const dramaticCycle = mission.cycles.find(cycle => cycle.challenge === 'dramatic-arc')
  const dramaticGoalInStart = dramaticCycle?.roles.objectiveNode === mission.goalNodeId
  // Dramatic Arc's one-loop Spine contract is a single room-spanning cycle:
  // Start and Goal share room 1, Route A runs into the room's obstacle, and
  // Route B continues from Route A's far end before returning to the Goal side.
  // The blocked mission edge is represented by the darkness band itself, so it
  // must not become a second physical corridor back into the shared room.
  const dramaticBlockedEdge = dramaticGoalInStart
    ? mission.edges.find(edge => edge.blocked && dramaticCycle.routeEdgeIds.includes(edge.id))
    : undefined
  const dramaticRouteBStart = dramaticGoalInStart
    ? mission.edges.find(edge => edge.from === dramaticCycle.routeB[0] && edge.to === dramaticCycle.routeB[1] && dramaticCycle.routeEdgeIds.includes(edge.id))
    : undefined
  const dramaticRouteAEnd = dramaticGoalInStart ? dramaticCycle.routeA[dramaticCycle.routeA.length - 2] : undefined
  const modules: SpatialModule[] = mission.nodes.filter(node => !dramaticGoalInStart || node.id !== mission.goalNodeId).map(node => ({
    id: `module-${node.id}`, type: style.moduleType(node), missionNodeId: node.id,
    origin: { col: -1, row: -1 }, width: 3, height: 3, footprint: [], ports: [],
  }))
  const edges = mission.edges
    .filter(edge => edge.id !== dramaticBlockedEdge?.id)
    .map(edge => ({
      ...edge,
      ...(edge.id === dramaticRouteBStart?.id && dramaticRouteAEnd ? { from: dramaticRouteAEnd } : {}),
      originalId: edge.id,
    }))
  for (const cycle of mission.cycles.filter(c => c.challenge === 'unknown-return')) {
    const edge = edges.find(e => e.id === `unknown-return-back-${cycle.id}`)
    if (!edge) continue
    const id = `support-${cycle.id}-1`
    modules.push({ id, type: 'room', cycleId: cycle.id, origin: { col: -1, row: -1 }, width: 3, height: 3, footprint: [], ports: [] })
    edges.push({ ...edge, id: `${edge.id}-support`, from: id })
    edge.to = id
  }
  if (request.style === 'cavern-pressure') {
    // Each independent cavern loop has its own declared merge room. Marking
    // those actual objectives as junctions prevents a visual merge from being
    // implied by incidental corridor contact.
    for (const cycle of mission.cycles) {
      const junction = modules.find(module => module.missionNodeId === cycle.roles.objectiveNode)
      if (junction) junction.type = 'junction'
    }
  }
  arrangeRooms(request, mission, modules, edges, attempt)
  if (dramaticCycle) {
    const dramaticRoomId = dramaticGoalInStart ? 'start' : dramaticCycle.roles.objectiveNode
    const dramaticRoom = modules.find(module => module.missionNodeId === dramaticRoomId)
    if (dramaticRoom) {
      const axis = dramaticRoom.width >= dramaticRoom.height ? 'vertical' : 'horizontal'
      const maximum = axis === 'vertical' ? dramaticRoom.height : dramaticRoom.width
      const bandLength = Math.min(6, Math.max(3, Math.min(4, maximum - 2)))
      const bandStart = Math.floor((maximum - bandLength) / 2)
      dramaticRoom.excludedPortPoints = dramaticRoom.footprint.filter(point => {
        const position = axis === 'vertical' ? point.row - dramaticRoom.origin.row : point.col - dramaticRoom.origin.col
        return position >= bandStart && position < bandStart + bandLength
      })
    }
  }
  const lookup = new Map(modules.map(m => [m.missionNodeId ?? m.id, m]))
  if (dramaticGoalInStart) lookup.set(mission.goalNodeId, lookup.get('start')!)
  const connections: SpatialConnection[] = []
  const cycleByEdge = new Map(mission.cycles.flatMap(c => c.routeEdgeIds.map(id => [id, c.id] as const)))
  // Short links first leave the perimeter available for longer return routes.
  edges.sort((a, b) => {
    const distance = (e: typeof a) => { const p = center(lookup.get(e.from)!), q = center(lookup.get(e.to)!); return Math.abs(p.col-q.col)+Math.abs(p.row-q.row) }
    return distance(a)-distance(b)
  })
  const diagnostics: GenerationDiagnostic[] = []
  for (const edge of edges) {
    if (!addConnection(connections, lookup, edge, request, cycleByEdge.get(edge.originalId), edge.originalId)) diagnostics.push({ stage: 'space', code: 'unroutable-relationship', message: `Could not route ${edge.from} to ${edge.to} without an unintended connection.`, style: request.style, seed: normalizeSeed(request.seed), nodeId: edge.from, constraint: 'separated corridor routing' })
  }
  if (modules.some(m => m.footprint.length === 0)) diagnostics.push({ stage: 'space', code: 'placement-capacity', message: 'The fixed mission does not fit with separated rooms and routing lanes.', style: request.style, seed: normalizeSeed(request.seed), constraint: 'buffered room footprints' })
  const anchors = Object.fromEntries(modules.filter(m => m.missionNodeId).map(m => [m.missionNodeId!, m.id]))
  if (dramaticGoalInStart) anchors[mission.goalNodeId] = anchors.start!
  const plan: SpacePlan = { style: request.style, modules, connections, anchors, monsterEncounterTable: [], dungeonLevelBudget: resolveDungeonLevelBudget(request.playerLevel), monsterLevelsUsed: 0, monsterRejections: [], generalNotes: [], diagnostics }
  rollGeneratedContent(request, mission, plan)
  return plan
}

const HIGH_LEVEL_CONTRACT_MONSTER_LEVEL = 10

function roomPlaceableHighLevelContractMonsters(table: readonly MonsterRecord[], budget: DungeonLevelBudget): MonsterRecord[] {
  const candidates = table.filter(monster => {
    const level = numericMonsterLevel(monster)
    return level !== null && level >= HIGH_LEVEL_CONTRACT_MONSTER_LEVEL && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.dungeonBudget
  })
  if (candidates.length === 0) return []
  const lowestCost = Math.min(...candidates.map(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget)))
  return candidates.filter(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget) === lowestCost)
}

function ensureHighLevelContractMonsterOnTable(random: ReturnType<typeof createD6Random>, table: MonsterRecord[], budget: DungeonLevelBudget): MonsterRecord[] {
  let candidates = roomPlaceableHighLevelContractMonsters(table, budget)
  if (candidates.length > 0) return candidates

  // A high-level danger contract is allowed to add its required entry to the
  // otherwise unrestricted table. Prefer the lowest-level qualifying catalog
  // entry so the contract can fit every dungeon-level budget band.
  const catalogCandidates = MONSTER_CATALOG.filter(monster => {
    const level = numericMonsterLevel(monster)
    return !table.includes(monster) && level !== null && level >= HIGH_LEVEL_CONTRACT_MONSTER_LEVEL && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.dungeonBudget
  })
  if (catalogCandidates.length === 0) return []
  const lowestCost = Math.min(...catalogCandidates.map(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget)))
  const qualifyingCatalogCandidates = catalogCandidates.filter(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget) === lowestCost)
  const requiredMonster = pickRandomMonsterFromTable(random, qualifyingCatalogCandidates)
  table[table.length - 1] = requiredMonster
  candidates = roomPlaceableHighLevelContractMonsters(table, budget)
  return candidates
}

function rollGeneratedContent(request: GenerationRequest, mission: Mission, plan: SpacePlan): void {
  const random = createD6Random(normalizeSeed(request.seed) ^ 0x51ed270b)
  plan.dungeonLevelBudget = resolveDungeonLevelBudget(request.playerLevel)
  // The table is an unrestricted sample from the catalog. Dungeon and
  // encounter budgets are applied only when a table entry is assigned to a
  // room, so high-level entries can still appear and be documented as
  // rejected when they cannot fit the generated dungeon.
  plan.monsterEncounterTable = createMonsterEncounterTable(random)
  const highLevelContractCycles = mission.cycles.filter(cycle => cycle.challenge === 'dangerous-route' || cycle.challenge === 'patrolled-cycle' || cycle.challenge === 'gambit')
  const highLevelContractMonsterCandidates = highLevelContractCycles.length > 0
    ? ensureHighLevelContractMonsterOnTable(random, plan.monsterEncounterTable, plan.dungeonLevelBudget)
    : []
  plan.generalNotes.push([
    'Random Encounter Table:',
    '1. Torch extinguished',
    ...plan.monsterEncounterTable.map((monster, index) => `${index + 2}. ${monster.name} (LV ${monster.level})`),
  ].join('\n'))
  plan.generalNotes.push(`Monster budget: dungeon level ${request.playerLevel ?? 1} · encounters ${plan.dungeonLevelBudget.encounterBudget} levels · dungeon ${plan.dungeonLevelBudget.dungeonBudget} levels.`)
  const hasMissionReward = mission.nodes.some(node => node.kind === 'reward') || mission.cycles.some(cycle => cycle.roles.objectiveNode === mission.goalNodeId)
  const roomHazardNames = new Set<string>()
  for (const module of plan.modules.filter(candidate => candidate.footprint.length > 0)) {
    module.encounter = rollRoomEncounter(random)
    module.encounters = module.encounter === 'empty' ? [] : [module.encounter]
    module.hasTreasure = random.nextD6() <= 2
  }
  for (const connection of plan.connections) {
    const roll = random.nextD6()
    connection.condition = roll <= 3 ? 'open' : roll === 4 ? 'flooded' : roll === 5 ? 'trap' : 'hazard'
    const missionEdge = mission.edges.find(edge => edge.id === connection.missionEdgeId)
    const doorways: GeneratedDoorway[] = []
    const hallwayStart = connection.path[1]!
    const hallwayEnd = connection.path[connection.path.length - 2]!
    if (missionEdge?.lockId) doorways.push({ point: hallwayEnd, direction: directionForPath(connection.path.slice(-2)), style: 'locked', location: 'room-aperture' })
    const apertures = [
      { point: hallwayStart, direction: directionForPath(connection.path.slice(0, 2)), locked: false },
      { point: hallwayEnd, direction: directionForPath(connection.path.slice(-2)), locked: Boolean(missionEdge?.lockId) },
    ]
    for (const aperture of apertures) {
      if (aperture.locked || random.nextD6() > 3) continue
      if (doorways.some(doorway => keyOf(doorway.point) === keyOf(aperture.point))) continue
      doorways.push({ point: aperture.point, direction: aperture.direction, style: rollDoorwayStyle(random), location: 'room-aperture' })
    }
    const hallwayLength = connection.path.length - 2
    if (hallwayLength >= 5 && random.nextD6() <= (hallwayLength >= 10 ? 5 : 3)) {
      let index = Math.floor(connection.path.length / 2)
      if (connection.condition === 'trap' || connection.condition === 'hazard' || ['secret', 'dangerous', 'blocked-return', 'one-way'].includes(connection.semantic)) index = Math.min(connection.path.length - 2, index + 1)
      const point = connection.path[index]!
      doorways.push({ point, direction: directionForPath([connection.path[index - 1]!, point]), style: rollDoorwayStyle(random), location: 'hallway' })
    }
    connection.doorways = doorways
  }
  if (hasMissionReward) {
    const goal = plan.modules.find(module => module.id === plan.anchors[mission.goalNodeId])
    if (goal) goal.hasTreasure = true
  }
  applyMissionRoomDirectives(mission, plan)
  const contractMonsterAssignments = new Map<string, MonsterRecord[]>()
  if (highLevelContractCycles.length > 0) {
    for (const cycle of highLevelContractCycles) {
      const routeModules = cycle.routeA.slice(1, -1).map(nodeId => plan.modules.find(candidate => candidate.missionNodeId === nodeId)).filter((module): module is SpatialModule => Boolean(module))
      const module = routeModules.find(candidate => candidate.encounters?.includes('monster')) ?? routeModules[0]
      const nodeId = module?.missionNodeId
      const selectedMonster = highLevelContractMonsterCandidates.length > 0 ? pickRandomMonsterFromTable(random, highLevelContractMonsterCandidates) : undefined
      if (!module || !nodeId || !selectedMonster) continue
      const assignments = contractMonsterAssignments.get(nodeId) ?? []
      assignments.push(selectedMonster)
      contractMonsterAssignments.set(nodeId, assignments)
      // Put the required contract encounter ahead of any ambient result that
      // was already rolled for this room. If the contract route already has a
      // monster encounter, upgrade that encounter instead of adding another
      // one so route-balance contracts retain their intended counts.
      if (!module.encounters?.includes('monster')) {
        module.encounters = ['monster', ...(module.encounters ?? [])]
        module.encounter = 'monster'
      }
    }
  }
  let monsterLevelsUsed = 0
  const forcedDangerNodes = new Set(mission.cycles.flatMap(cycle => cycle.dangerEntries.map(entry => entry.nodeId)))
  const modulesByMonsterPriority = [...plan.modules].sort((left, right) => {
    const leftNodeId = left.missionNodeId ?? ''
    const rightNodeId = right.missionNodeId ?? ''
    const leftPriority = contractMonsterAssignments.has(leftNodeId) ? 0 : left.encounters?.includes('monster') && forcedDangerNodes.has(leftNodeId) ? 1 : 2
    const rightPriority = contractMonsterAssignments.has(rightNodeId) ? 0 : right.encounters?.includes('monster') && forcedDangerNodes.has(rightNodeId) ? 1 : 2
    return leftPriority - rightPriority
  })
  const monsterRoomCount = modulesByMonsterPriority.filter(module => module.encounters?.includes('monster')).length
  let monsterRoomsRemaining = monsterRoomCount
  for (const module of modulesByMonsterPriority) {
    const resolvedEncounters: RoomEncounter[] = []
    const monsterGroups = [] as NonNullable<SpatialModule['monsterEncounterGroups']>
    const monsterDetails = [] as NonNullable<SpatialModule['monsterDetails']>
    const contractMonsters = contractMonsterAssignments.get(module.missionNodeId ?? '') ?? []
    const hasMonsterRoom = module.encounters?.includes('monster') ?? false
    const futureMonsterRooms = Math.max(0, monsterRoomsRemaining - (hasMonsterRoom ? 1 : 0))
    let contractMonsterIndex = 0
    for (const encounter of module.encounters ?? []) {
      if (encounter !== 'monster') {
        resolvedEncounters.push(encounter)
        continue
      }
      const isMissionContractMonster = forcedDangerNodes.has(module.missionNodeId ?? '') || contractMonsterAssignments.has(module.missionNodeId ?? '')
      // Mission-directed danger is a required contract, so it gets a complete
      // encounter even when ambient rooms have already spent the dungeon pool.
      // Ordinary random monster rooms remain hard-capped by that pool.
      const remainingDungeonBudget = isMissionContractMonster ? Number.MAX_SAFE_INTEGER : plan.dungeonLevelBudget.dungeonBudget - monsterLevelsUsed
      const reservedDungeonBudget = isMissionContractMonster ? 0 : futureMonsterRooms * plan.dungeonLevelBudget.encounterBudget
      const availableDungeonBudget = isMissionContractMonster
        ? Number.MAX_SAFE_INTEGER
        : remainingMonsterRoomBudget(plan.dungeonLevelBudget.dungeonBudget, monsterLevelsUsed, plan.dungeonLevelBudget.encounterBudget, futureMonsterRooms)
      const contractMonster = contractMonsterIndex < contractMonsters.length ? contractMonsters[contractMonsterIndex++] : undefined
      const affordableMonsters = plan.monsterEncounterTable.filter(monster => {
        const level = numericMonsterLevel(monster)
        return level !== null && minimumMonsterEncounterCost(level, plan.dungeonLevelBudget.encounterBudget) <= availableDungeonBudget
      })
      const selectedMonster = contractMonster ?? (affordableMonsters.length > 0 ? pickRandomMonsterFromTable(random, affordableMonsters) : undefined)
      const group = selectedMonster
        ? rollMonsterEncounter(selectedMonster, plan.dungeonLevelBudget.encounterBudget, remainingDungeonBudget)
        : null
      if (!group) {
        const minimumRequiredLevel = Math.min(...plan.monsterEncounterTable.map(monster => {
          const level = numericMonsterLevel(monster)
          return level === null ? Number.MAX_SAFE_INTEGER : minimumMonsterEncounterCost(level, plan.dungeonLevelBudget.encounterBudget)
        }))
        plan.monsterRejections.push({
          moduleId: module.id,
          ...(module.missionNodeId ? { missionNodeId: module.missionNodeId } : {}),
          candidateMonsters: (affordableMonsters.length > 0 ? [selectedMonster?.name ?? 'Selected monster'] : plan.monsterEncounterTable.map(monster => monster.name)),
          remainingDungeonBudget: Math.max(0, remainingDungeonBudget),
          reservedDungeonBudget,
          availableDungeonBudget: Math.max(0, availableDungeonBudget),
          futureMonsterRooms,
          encounterBudget: plan.dungeonLevelBudget.encounterBudget,
          minimumRequiredLevel,
          reason: 'insufficient-dungeon-budget',
        })
        continue
      }
      resolvedEncounters.push('monster')
      monsterGroups.push(group)
      monsterDetails.push(group.monster)
      monsterLevelsUsed += group.levelTotal
    }
    if (hasMonsterRoom) monsterRoomsRemaining -= 1
    module.encounters = resolvedEncounters
    module.encounter = resolvedEncounters[0] ?? 'empty'
    module.trapDetails = resolvedEncounters.flatMap(encounter => encounter === 'trap' ? [createTrapRecord(random)] : [])
    module.monsterDetails = monsterDetails
    module.monsterEncounterGroups = monsterGroups
    module.hazardDetails = resolvedEncounters.flatMap(encounter => {
      if (encounter !== 'hazard') return []
      const hazard = createUniqueHazardRecord(random, roomHazardNames)
      roomHazardNames.add(hazard.name)
      return [hazard]
    })
    let trapIndex = 0
    let hazardIndex = 0
    let monsterIndex = 0
    const encounterDetails = module.encounter === 'empty'
      ? ['Empty room.']
      : resolvedEncounters.flatMap(encounter => {
        if (encounter === 'monster') {
          const group = module.monsterEncounterGroups![monsterIndex++]!
          return [`Monster: ${group.count} ${group.monster.name.toLowerCase()} (LV ${group.monster.level})\n${group.monster.flavor}`]
        }
        if (encounter === 'trap') return [formatTrapRecord(module.trapDetails![trapIndex++]!)]
        if (encounter === 'hazard') return [formatHazardRecord(module.hazardDetails![hazardIndex++]!)]
        return []
      })
    module.generatedDetails = module.hasTreasure ? [...encounterDetails, 'Treasure: present.'] : encounterDetails
  }
  plan.monsterLevelsUsed = monsterLevelsUsed
  plan.generalNotes.push(`Monster levels used: ${monsterLevelsUsed} / ${plan.dungeonLevelBudget.dungeonBudget}.`)
  if (plan.monsterRejections.length > 0) {
    plan.generalNotes.push([
      'Rejected monster encounters:',
      ...plan.monsterRejections.map(rejection => {
        const room = rejection.missionNodeId ?? rejection.moduleId
        const candidates = rejection.candidateMonsters.join(', ')
        const reserve = rejection.futureMonsterRooms > 0 ? `; ${rejection.reservedDungeonBudget} reserved for ${rejection.futureMonsterRooms} future standard room${rejection.futureMonsterRooms === 1 ? '' : 's'}` : ''
        return `${room}: ${candidates} rejected; ${rejection.remainingDungeonBudget} dungeon levels remained${reserve}, leaving ${rejection.availableDungeonBudget} available, but at least ${rejection.minimumRequiredLevel} were needed for a ${rejection.encounterBudget}-level encounter.`
      }),
    ].join('\n'))
  }
  const hallwayTrapConnections = plan.connections.filter(connection => connection.condition === 'trap')
  if (hallwayTrapConnections.length > 0) {
    const hallwayTrap = createTrapRecord(random)
    const details = formatTrapRecord(hallwayTrap)
    for (const connection of hallwayTrapConnections) connection.conditionDetails = details
    plan.generalNotes.push(`Hallway traps: all trapped hallways share one variety. ${details}`)
  }
  const hallwayHazardConnections = plan.connections.filter(connection => connection.condition === 'hazard')
  if (hallwayHazardConnections.length > 0) {
    const details = formatHazardRecord(createHazardRecord(random))
    for (const connection of hallwayHazardConnections) connection.conditionDetails = details
    plan.generalNotes.push(`Hallway hazards: all hazardous hallways share one variety. ${details}`)
  }
}

function applyMissionRoomDirectives(mission: Mission, plan: SpacePlan): void {
  const directives = new Map<string, { dangerEntries: DangerEntry[]; empty: boolean }>()
  for (const cycle of mission.cycles) {
    for (const nodeId of cycle.emptyRoomIds) {
      const directive = directives.get(nodeId) ?? { dangerEntries: [], empty: false }
      directive.empty = true
      directives.set(nodeId, directive)
    }
    for (const entry of cycle.dangerEntries) {
      const directive = directives.get(entry.nodeId) ?? { dangerEntries: [], empty: false }
      directive.dangerEntries.push(entry)
      directives.set(entry.nodeId, directive)
    }
  }

  let dangerSequenceIndex = 0
  for (const module of plan.modules) {
    const nodeId = module.missionNodeId
    if (!nodeId) continue
    const directive = directives.get(nodeId)
    if (!directive) continue
    if (directive.empty) {
      module.encounters = []
      module.encounter = 'empty'
      continue
    }
    const encounters: RoomEncounter[] = []
    for (const entry of directive.dangerEntries) {
      for (let index = 0; index < entry.count; index += 1) encounters.push(resolveDangerKind(entry, dangerSequenceIndex++))
    }
    module.encounters = encounters
    module.encounter = encounters[0] ?? 'empty'
  }
}

function rollDoorwayStyle(random: ReturnType<typeof createD6Random>): DoorwayStyle {
  const roll = (random.nextD6() - 1) * 6 + random.nextD6() - 1
  return rolledDoorwayStyles[Math.floor(roll * rolledDoorwayStyles.length / 36)]!
}

function pointInModule(point: Point, module: SpatialModule): boolean { return module.footprint.some(candidate => candidate.col === point.col && candidate.row === point.row) }
function adjacent(point: Point): Point[] { return [{ col: point.col - 1, row: point.row }, { col: point.col + 1, row: point.row }, { col: point.col, row: point.row - 1 }, { col: point.col, row: point.row + 1 }] }

export function connectionFootprint(connection: Pick<SpatialConnection, 'path' | 'width'>): Point[] {
  const points = new Map<string, Point>()
  for (let index = 0; index < connection.path.length; index++) {
    const point = connection.path[index]!
    const previous = connection.path[index - 1] ?? point
    const next = connection.path[index + 1] ?? point
    const horizontal = previous.row === next.row
    const half = Math.floor((connection.width - 1) / 2)
    for (let offset = -half; offset < connection.width - half; offset++) {
      const expanded = horizontal ? { col: point.col, row: point.row + offset } : { col: point.col + offset, row: point.row }
      points.set(keyOf(expanded), expanded)
    }
  }
  return [...points.values()]
}

function addDiagnostic(diagnostics: GenerationDiagnostic[], request: GenerationRequest, code: string, message: string, constraint: string, candidate?: Point): void {
  diagnostics.push({ stage: 'space', code, message, style: request.style, seed: normalizeSeed(request.seed), constraint, ...(candidate ? { candidate } : {}) })
}

export function validateSpacePlan(request: GenerationRequest, plan: SpacePlan, mission: Mission): SpaceValidationResult {
  const diagnostics = [...plan.diagnostics]
  for (const issue of getGenerationStyle(request.style).validatePlan(plan, mission)) addDiagnostic(diagnostics, request, issue.code, issue.message, issue.constraint)
  const moduleById = new Map(plan.modules.map(module => [module.id, module]))
  const missionEdgeConnections = new Map<string, SpatialConnection[]>()
  const occupiedModules = new Map<string, SpatialModule>()
  for (const module of plan.modules) {
    for (const point of module.footprint) {
      if (point.col <= 0 || point.row <= 0 || point.col >= request.cols - 1 || point.row >= request.rows - 1) addDiagnostic(diagnostics, request, 'out-of-bounds', `Module ${module.id} crosses the one-cell Wall border.`, 'outer Wall border', point)
      const previous = occupiedModules.get(keyOf(point))
      if (previous) addDiagnostic(diagnostics, request, 'module-overlap', `Module ${module.id} overlaps ${previous.id}.`, 'room overlap', point)
      occupiedModules.set(keyOf(point), module)
    }
  }
  for (let leftIndex = 0; leftIndex < plan.modules.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < plan.modules.length; rightIndex++) {
    const left = plan.modules[leftIndex]!
    const right = plan.modules[rightIndex]!
    const rightCells = new Set(right.footprint.map(keyOf))
    if (left.footprint.some(point => adjacent(point).some(neighbor => rightCells.has(keyOf(neighbor))))) addDiagnostic(diagnostics, request, 'room-buffer', `Modules ${left.id} and ${right.id} lose their one-cell Wall buffer.`, 'one-cell room buffer')
  }
  const occupiedConnections = new Map<string, SpatialConnection>()
  for (const connection of plan.connections) {
    if (connection.missionEdgeId) missionEdgeConnections.set(connection.missionEdgeId, [...(missionEdgeConnections.get(connection.missionEdgeId) ?? []), connection])
    const from = moduleById.get(connection.fromModuleId)
    const to = moduleById.get(connection.toModuleId)
    if (!from || !to) { addDiagnostic(diagnostics, request, 'missing-connection-module', `Connection ${connection.id} references a missing module.`, 'connection endpoints'); continue }
    const fromPort = from.ports.find(port => port.connectionId === connection.id)
    const toPort = to.ports.find(port => port.connectionId === connection.id)
    if (!fromPort || !toPort || keyOf(fromPort.point) !== keyOf(connection.apertureFrom) || keyOf(toPort.point) !== keyOf(connection.apertureTo)) addDiagnostic(diagnostics, request, 'incompatible-aperture', `Connection ${connection.id} does not terminate at its declared room apertures.`, 'Room Connection Aperture')
    if (connection.path.length < 3 || keyOf(connection.path[0]!) !== keyOf(connection.apertureFrom) || keyOf(connection.path[connection.path.length - 1]!) !== keyOf(connection.apertureTo) || !pointInModule(connection.apertureFrom, from) || !pointInModule(connection.apertureTo, to)) addDiagnostic(diagnostics, request, 'invalid-corridor-endpoints', `Connection ${connection.id} must connect its two declared room doorways.`, 'corridor endpoints')
    for (let index = 1; index < connection.path.length; index++) {
      const previous = connection.path[index - 1]!
      const point = connection.path[index]!
      if (Math.abs(previous.col - point.col) + Math.abs(previous.row - point.row) !== 1) addDiagnostic(diagnostics, request, 'non-contiguous-corridor', `Connection ${connection.id} contains a non-contiguous corridor step.`, 'corridor continuity', point)
    }
    const footprintCells = connectionFootprint(connection)
    for (const point of footprintCells) {
      if (point.col <= 0 || point.row <= 0 || point.col >= request.cols - 1 || point.row >= request.rows - 1) addDiagnostic(diagnostics, request, 'corridor-out-of-bounds', `Connection ${connection.id} crosses the one-cell Wall border.`, 'outer Wall border', point)
      const module = occupiedModules.get(keyOf(point))
      if (module && module.id !== from.id && module.id !== to.id) addDiagnostic(diagnostics, request, 'corridor-room-overlap', `Connection ${connection.id} enters unrelated module ${module.id}.`, 'protected room footprint', point)
      const previousConnection = occupiedConnections.get(keyOf(point))
      if (previousConnection && previousConnection.id !== connection.id && !module) addDiagnostic(diagnostics, request, 'accidental-crossing', `Connection ${connection.id} overlaps ${previousConnection.id}.`, 'separate corridor interiors', point)
      for (const neighbor of adjacent(point)) {
        const other = occupiedConnections.get(keyOf(neighbor))
        const room = occupiedModules.get(keyOf(neighbor))
        if (other && other.id !== connection.id && !(module && room && module.id === room.id)) addDiagnostic(diagnostics, request, 'accidental-contact', `Connection ${connection.id} touches ${other.id} outside a room.`, 'one-cell corridor buffer', point)
        if (room && !module && keyOf(neighbor) !== keyOf(connection.apertureFrom) && keyOf(neighbor) !== keyOf(connection.apertureTo)) addDiagnostic(diagnostics, request, 'room-aperture-bypass', `Connection ${connection.id} touches a room outside its doorway.`, 'designated apertures only', point)
      }
      occupiedConnections.set(keyOf(point), connection)
    }
    for (const point of connection.path.slice(1, -1)) for (const module of plan.modules) {
      if (module.id === from.id || module.id === to.id) continue
      if (pointInModule(point, module)) addDiagnostic(diagnostics, request, 'corridor-room-overlap', `Connection ${connection.id} passes through module ${module.id}.`, 'protected room footprint', point)
    }
  }
  const dramaticGoalCycle = mission.cycles.find(cycle => cycle.challenge === 'dramatic-arc' && cycle.roles.objectiveNode === mission.goalNodeId)
  const dramaticDarknessEdgeId = dramaticGoalCycle
    ? mission.edges.find(edge => edge.blocked && dramaticGoalCycle.routeEdgeIds.includes(edge.id))?.id
    : undefined
  for (const missionEdge of mission.edges) {
    if (missionEdgeConnections.has(missionEdge.id) || missionEdge.id === dramaticDarknessEdgeId) continue
    addDiagnostic(diagnostics, request, 'unrealized-mission-edge', `Mission relationship ${missionEdge.id} has no spatial connection.`, 'Mission/Space relationship')
  }
  const progression = validateProgression(mission)
  diagnostics.push(...progression.diagnostics)
  for (const cycle of mission.cycles) {
    const routeAIds = cycle.routeEdgeIds.filter(id => cycle.routeA.some((nodeId, index) => index < cycle.routeA.length - 1 && mission.edges.find(edge => edge.id === id)?.from === nodeId && mission.edges.find(edge => edge.id === id)?.to === cycle.routeA[index + 1]))
    const routeBIds = cycle.routeEdgeIds.filter(id => cycle.routeB.some((nodeId, index) => index < cycle.routeB.length - 1 && mission.edges.find(edge => edge.id === id)?.from === nodeId && mission.edges.find(edge => edge.id === id)?.to === cycle.routeB[index + 1]))
    const idsA = routeAIds.flatMap(id => missionEdgeConnections.get(id) ?? [])
    const idsB = routeBIds.flatMap(id => missionEdgeConnections.get(id) ?? [])
    const sharedIds = new Set(routeAIds.filter(id => routeBIds.includes(id)))
    const cellsA = new Set(idsA.filter(connection => !sharedIds.has(connection.missionEdgeId ?? '')).flatMap(connection => connectionFootprint(connection).map(keyOf)))
    const cellsB = new Set(idsB.filter(connection => !sharedIds.has(connection.missionEdgeId ?? '')).flatMap(connection => connectionFootprint(connection).map(keyOf)))
    if (cycle.challenge !== 'hub-and-spoke') {
      // Alternatives may share an approach or a destination aperture. They
      // are only trivial when one route has no private corridor at all.
      const privateA = [...cellsA].filter(cell => !cellsB.has(cell))
      const privateB = [...cellsB].filter(cell => !cellsA.has(cell))
      if (privateA.length < 2 || privateB.length < 2) addDiagnostic(diagnostics, request, 'trivial-cycle-geometry', `${cycle.id} routes do not retain distinct private corridor geometry.`, 'non-trivial cycle geometry')
    }
    if (cycle.challenge !== 'hub-and-spoke' && (!cycle.nonTrivial || new Set(cycle.routeA).size < 3 || new Set(cycle.routeB).size < 3)) addDiagnostic(diagnostics, request, 'trivial-cycle', `${cycle.id} is not a non-trivial cycle.`, 'exact loop count')
  }
  return { valid: diagnostics.length === 0, diagnostics }
}

function directionForPath(path: Point[]): Direction {
  const first = path[0]
  const second = path[1] ?? first
  if (!first || !second) return directions[0]!
  if (second.col > first.col) return 'E'
  if (second.col < first.col) return 'W'
  if (second.row > first.row) return 'S'
  return 'N'
}

function midpoint(path: Point[]): Point { return path[Math.floor(path.length / 2)] ?? path[0] ?? { col: 1, row: 1 } }

export interface RasterizationResult { snapshot?: AppSnapshotShape; diagnostics: GenerationDiagnostic[] }

export function rasterizeSpacePlan(request: GenerationRequest, mission: Mission, plan: SpacePlan): RasterizationResult {
  const diagnostics: GenerationDiagnostic[] = []
  const grid = createGrid(request.cols, request.rows)
  const dramaticCycle = mission.cycles.find(cycle => cycle.challenge === 'dramatic-arc')
  let dramaticLayout: { start: SpatialModule; axis: 'vertical' | 'horizontal'; bandStart: number; bandLength: number; goalSide?: 'before' | 'after' } | undefined
  for (const module of plan.modules) for (const point of module.footprint) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = FLOOR
  for (const connection of plan.connections) for (const point of connectionFootprint(connection)) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = FLOOR
  for (const connection of plan.connections) if (connection.condition === 'flooded') {
    for (const point of connection.path.slice(1, -1)) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = WATER
  }
  if (dramaticCycle) {
    const dramaticRoom = plan.modules.find(module => module.id === plan.anchors[dramaticCycle.roles.objectiveNode])
    if (dramaticRoom) {
      const longAxis = dramaticRoom.width >= dramaticRoom.height ? 'vertical' : 'horizontal'
      const maximum = longAxis === 'vertical' ? dramaticRoom.height : dramaticRoom.width
      const bandLength = Math.min(6, Math.max(3, Math.min(4, maximum - 2)))
      const offset = Math.floor((maximum - bandLength) / 2)
      dramaticLayout = { start: dramaticRoom, axis: longAxis, bandStart: offset, bandLength }
      for (const point of dramaticRoom.footprint) {
        const axis = longAxis === 'vertical' ? point.row - dramaticRoom.origin.row : point.col - dramaticRoom.origin.col
        if (axis >= offset && axis < offset + bandLength) grid[point.row * request.cols + point.col] = DARKNESS
      }
    }
  }
  const available = request.availableStampTypes ?? STAMP_TYPES
  const stamps: Stamp[] = []
  const labels: Label[] = []
  const occupied = new Set<string>()
  const keyColors = new Map(mission.keys.map((key, index) => [key.id, KEY_LOCK_COLORS[index % KEY_LOCK_COLORS.length]]))
  const isInBounds = (point: Point) => point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows
  const isFloor = (point: Point) => isInBounds(point) && grid[point.row * request.cols + point.col] === FLOOR
  const isWalkable = (point: Point) => isInBounds(point) && (grid[point.row * request.cols + point.col] === FLOOR || grid[point.row * request.cols + point.col] === WATER)
  const roomDecorationPoint = (module: SpatialModule): Point | undefined => {
    const preferred = center(module)
    const distance = (point: Point) => Math.abs(point.col - preferred.col) + Math.abs(point.row - preferred.row)
    return [...module.footprint]
      .sort((a, b) => distance(a) - distance(b) || a.row - b.row || a.col - b.col)
      .find(point => isFloor(point) && !occupied.has(keyOf(point)))
  }
  const addRoomLabel = (id: string, text: string, module: SpatialModule, color?: string, number?: number, numberOnly = false, details?: string) => {
    const point = roomDecorationPoint(module)
    if (!point) return
    labels.push({ id, col: point.col, row: point.row, text, ...(number === undefined ? {} : { number }), ...(numberOnly ? { numberOnly: true } : {}), ...(color ? { color } : {}), ...(details ? { details } : {}) })
    occupied.add(keyOf(point))
  }
  const addRequired = (semantic: GeneratedMarkerSemantic, id: string, point: Point, direction: Direction, color?: string) => {
    const stamp = resolveGeneratedStamp(semantic, id, point, available, direction)
    if (!stamp) {
      diagnostics.push({ stage: 'rasterization', code: 'missing-required-stamp', message: `No implemented stamp can realize required semantic type ${semantic}.`, style: request.style, seed: normalizeSeed(request.seed), constraint: 'semantic stamp catalog', candidate: point })
      return
    }
    const placement = [point, ...adjacent(point)].find((candidate, index) =>
      !occupied.has(keyOf(candidate)) && (index === 0 ? isWalkable(candidate) : isFloor(candidate)))
    if (!placement) {
      diagnostics.push({ stage: 'rasterization', code: 'missing-marker-floor', message: `No free adjacent Floor tile can hold required semantic type ${semantic}.`, style: request.style, seed: normalizeSeed(request.seed), constraint: 'unoccupied marker tile', candidate: point })
      return
    }
    stamp.col = placement.col
    stamp.row = placement.row
    if (color) stamp.color = color
    stamps.push(stamp)
    occupied.add(keyOf(placement))
  }
  const moduleByNode = new Map(plan.modules.filter(module => module.missionNodeId).map(module => [module.missionNodeId!, module]))
  for (const module of plan.modules) {
    const position = center(module)
    if (module.type === 'hub') addRequired('hub', `generated-${module.id}`, position, 'E')
  }
  for (const key of mission.keys) {
    const module = moduleByNode.get(key.nodeId)
    if (module) { const position = center(module); const color = keyColors.get(key.id); addRequired('key', `generated-${key.id}`, position, 'E', color); addRoomLabel(`label-${key.id}`, key.id.replace('key-', 'Key '), module, color) }
  }
  for (const lock of mission.locks) {
    const entries = plan.connections.filter(candidate => mission.edges.some(edge => edge.id === candidate.missionEdgeId && edge.lockId === lock.id))
    for (const [index, connection] of entries.entries()) {
      const position = connection.path[connection.path.length - 2]!
      const localPath = connection.path.slice(-2)
      addRequired('lock', `generated-${lock.id}-${index}`, position, directionForPath(localPath), keyColors.get(lock.keyId))
    }
  }
  for (const connection of plan.connections) {
    const semantic = connection.semantic
    if (semantic === 'secret' || semantic === 'dangerous' || semantic === 'blocked-return' || semantic === 'one-way') addRequired(semantic === 'dangerous' ? 'danger' : semantic, `generated-${connection.id}`, midpoint(connection.path), directionForPath(connection.path.slice(Math.floor(connection.path.length / 2))))
  }
  const roomModules = orderRoomsFromEntrance(plan.modules, plan.connections)
  for (const [index, module] of roomModules.entries()) {
    const missionNode = module.missionNodeId ? mission.nodes.find(node => node.id === module.missionNodeId) : undefined
    const text = module.missionNodeId === 'start' && module.type !== 'hub'
      ? 'Entrance'
      : module.type === 'hub'
      ? 'Hub'
      : module.missionNodeId === mission.goalNodeId
        ? 'Goal'
        : missionNode?.label ?? 'Support Room'
    addRoomLabel(`label-${module.id}`, text, module, undefined, index + 1, true, module.generatedDetails?.join('\n\n'))
  }
  const addOptional = (types: readonly StampType[], id: string, point: Point, direction: Direction = 'E') => {
    const type = types.find(candidate => available.includes(candidate))
    if (!type || occupied.has(keyOf(point))) return
    const rotation = direction === 'N' ? 0 : direction === 'E' ? 90 : direction === 'S' ? 180 : 270
    stamps.push({ id, type: type as Stamp['type'], ...point, rotation, z: 0 })
    occupied.add(keyOf(point))
  }
  for (const connection of plan.connections) {
    if (connection.condition !== 'trap' && connection.condition !== 'hazard') continue
    const preferred = midpoint(connection.path)
    const distance = (point: Point) => Math.abs(point.col - preferred.col) + Math.abs(point.row - preferred.row)
    const candidates = connection.path.slice(1, -1).sort((a, b) => distance(a) - distance(b))
    const point = candidates.find(candidate => !occupied.has(`${candidate.col},${candidate.row}`))
    if (point) addOptional(connection.condition === 'trap' ? GENERATED_DECORATION_STAMP_TYPES.hallwayTrap : GENERATED_DECORATION_STAMP_TYPES.hallwayHazard, `generated-hallway-${connection.condition}-${connection.id}`, point)
  }
  for (const connection of plan.connections) for (const doorway of connection.doorways ?? []) {
    if (occupied.has(`${doorway.point.col},${doorway.point.row}`)) continue
    addOptional(GENERATED_DOORWAY_STAMP_TYPES[doorway.style], `generated-${doorway.style}-door-${connection.id}-${doorway.point.col}-${doorway.point.row}`, doorway.point, doorway.direction)
  }
  const steps: StepRun[] = []
  const ramps: RampRun[] = []
  const start = plan.modules.find(module => module.missionNodeId === 'start')
  const firstConnection = start && plan.connections.find(connection => connection.fromModuleId === start.id)
  if (!start || !firstConnection) {
    diagnostics.push({ stage: 'rasterization', code: 'missing-start-descent', message: 'The starting room has no outgoing connection for its descent structure.', style: request.style, seed: normalizeSeed(request.seed), constraint: 'start-room entrance' })
  } else {
    const roomTiles = new Set(start.footprint.map(keyOf))
    const connectedTiles = new Set(plan.connections.flatMap(connection => connectionFootprint(connection).map(keyOf)))
    const hallwayTiles = plan.connections.flatMap(connection => connection.path.slice(1, -1))
    const otherRoomTiles = plan.modules.filter(module => module !== start).flatMap(module => module.footprint)
    const ports = new Set(start.ports.map(port => keyOf(port.point)))
    const outwardCandidates: Array<{ run: StepRun; outward: Direction; inside: Point }> = []
    for (const inside of start.footprint) for (const outward of directions) {
      if (ports.has(keyOf(inside))) continue
      const delta = DIRECTION_DELTAS[outward]
      const outside = { col: inside.col + delta.dc, row: inside.row + delta.dr }
      const outsideKey = keyOf(outside)
      if (outside.col <= 0 || outside.row <= 0 || outside.col >= request.cols - 1 || outside.row >= request.rows - 1) continue
      if (roomTiles.has(outsideKey) || adjacent(outside).filter(point => roomTiles.has(keyOf(point))).length !== 1) continue
      if (connectedTiles.has(outsideKey) || occupied.has(outsideKey) || occupied.has(keyOf(inside))) continue
      if (hallwayTiles.some(point => Math.abs(point.col - outside.col) + Math.abs(point.row - outside.row) <= 1)) continue
      if (otherRoomTiles.some(point => Math.abs(point.col - outside.col) + Math.abs(point.row - outside.row) <= 1)) continue
      if (dramaticLayout?.start === start) {
        const axisPosition = dramaticLayout.axis === 'vertical' ? inside.row - start.origin.row : inside.col - start.origin.col
        if (axisPosition >= dramaticLayout.bandStart && axisPosition < dramaticLayout.bandStart + dramaticLayout.bandLength) continue
      }
      outwardCandidates.push({ run: { id: 'generated-start-descent', col: inside.col, row: inside.row, z: 0, direction: outward, ascending: true }, outward, inside })
    }
    const dramaticSide = (point: Point): 'before' | 'after' | 'darkness' | undefined => {
      if (dramaticLayout?.start !== start) return undefined
      const axisPosition = dramaticLayout.axis === 'vertical' ? point.row - start.origin.row : point.col - start.origin.col
      if (axisPosition < dramaticLayout.bandStart) return 'before'
      if (axisPosition >= dramaticLayout.bandStart + dramaticLayout.bandLength) return 'after'
      return 'darkness'
    }
    const openStartSides = new Set(plan.connections
      .filter(connection => connection.traversable !== 'blocked' && (connection.fromModuleId === start.id || connection.toModuleId === start.id))
      .map(connection => connection.fromModuleId === start.id ? connection.path[0]! : connection.path[connection.path.length - 1]!)
      .map(dramaticSide)
      .filter((side): side is 'before' | 'after' => side === 'before' || side === 'after'))
    if (openStartSides.size > 0) {
      const connectedCandidates = outwardCandidates.filter(candidate => {
        const side = dramaticSide(candidate.inside)
        return side === undefined || (side !== 'darkness' && openStartSides.has(side))
      })
      if (connectedCandidates.length > 0) outwardCandidates.splice(0, outwardCandidates.length, ...connectedCandidates)
    }
    const firstConnectionDirection = directionForPath(firstConnection.path.slice(0, 2))
    const preferredOutward = dramaticLayout?.start === start
      ? firstConnectionDirection
      : oppositeDirection[firstConnectionDirection]
    outwardCandidates.sort((a, b) => Number(b.outward === preferredOutward) - Number(a.outward === preferredOutward)
      || a.inside.row - b.inside.row || a.inside.col - b.inside.col || directions.indexOf(a.outward) - directions.indexOf(b.outward))
    const origin = outwardCandidates[0]?.run
    if (!origin) {
      diagnostics.push({ stage: 'rasterization', code: 'missing-start-descent', message: 'No unused exterior wall can hold a descent without meeting a hallway.', style: request.style, seed: normalizeSeed(request.seed), constraint: 'unused start-room wall', nodeId: 'start' })
    } else {
      if (dramaticLayout?.start === start) {
        const axisPosition = dramaticLayout.axis === 'vertical'
          ? origin.row - dramaticLayout.start.origin.row
          : origin.col - dramaticLayout.start.origin.col
        dramaticLayout.goalSide = axisPosition < dramaticLayout.bandStart + dramaticLayout.bandLength / 2 ? 'after' : 'before'
      }
      const descentRoll = createD6Random(normalizeSeed(request.seed) ^ 0x1a5c3e2d).nextD6()
      if (descentRoll <= 3) steps.push(origin)
      else ramps.push(origin)
      for (const point of runTiles(origin)) occupied.add(keyOf(point))
    }
  }
  for (const module of plan.modules) {
    const encounters = module.encounters ?? (module.encounter === 'empty' || !module.encounter ? [] : [module.encounter])
    for (const [encounterIndex, encounter] of encounters.entries()) {
      const point = [roomDecorationPoint(module), ...module.footprint].find(candidate => candidate && !occupied.has(keyOf(candidate)))
      if (!point) continue
      if (encounter === 'trap') {
        addOptional(GENERATED_DECORATION_STAMP_TYPES.roomTrap, `generated-room-trap-${module.id}-${encounterIndex}`, point)
      } else if (encounter === 'hazard') {
        addOptional(GENERATED_DECORATION_STAMP_TYPES.roomHazard, `generated-room-hazard-${module.id}-${encounterIndex}`, point)
      }
    }
    if (module.hasTreasure) {
      const point = module === dramaticLayout?.start && dramaticLayout.goalSide
        ? [...module.footprint]
          .filter(candidate => {
            if (!isFloor(candidate) || occupied.has(keyOf(candidate))) return false
            const axisPosition = dramaticLayout.axis === 'vertical' ? candidate.row - module.origin.row : candidate.col - module.origin.col
            return dramaticLayout.goalSide === 'before'
              ? axisPosition < dramaticLayout.bandStart
              : axisPosition >= dramaticLayout.bandStart + dramaticLayout.bandLength
          })
          .sort((a, b) => {
            const axis = (point: Point) => dramaticLayout!.axis === 'vertical' ? point.row - module.origin.row : point.col - module.origin.col
            return dramaticLayout!.goalSide === 'before' ? axis(a) - axis(b) : axis(b) - axis(a)
          })[0]
        : roomDecorationPoint(module)
      if (point) addOptional(GENERATED_DECORATION_STAMP_TYPES.treasure, `generated-room-treasure-${module.id}`, point)
    }
  }
  if (diagnostics.length > 0) return { diagnostics }
  return { snapshot: { grids: new Map([[0, grid]]), stamps, steps, ramps, labels, environmentalColors: new Map() }, diagnostics }
}

export function describeSpaceRealization(request: GenerationRequest, plan: SpacePlan): string {
  return getGenerationStyle(request.style).describe(plan.modules, plan.connections)
}
