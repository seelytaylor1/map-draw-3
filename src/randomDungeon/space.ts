import { FLOOR, WATER } from '../constants'
import { createGrid } from '../grid'
import type { AppSnapshotShape, Direction, GeneratedMarkerSemantic, Point } from './commonTypes'
import { createD6Random, normalizeSeed } from './random'
import { arrangeRooms } from './layout'
import { getGenerationStyle } from './styles'
import { validateProgression } from './progression'
import type { DoorwayStyle, GeneratedDoorway, GenerationDiagnostic, GenerationRequest, Mission, MissionEdge, SpacePlan, SpatialConnection, SpatialConnectionSemantic, SpatialModule } from './missionTypes'
import { STAMP_TYPES, type Stamp, type StampType } from '../stamps'
import { DIRECTION_DELTAS, runTiles } from '../directionalRun'
import type { StepRun } from '../steps'
import type { RampRun } from '../ramps'
import type { Label } from '../labels'
import { resolveGeneratedStamp } from './generatedContent'

const keyOf = (point: Point) => `${point.col},${point.row}`
const directions: Direction[] = ['N', 'E', 'S', 'W']
const oppositeDirection: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' }
const doorStampTypes: Record<DoorwayStyle, readonly StampType[]> = {
  single: ['Door1x1', 'door'],
  double: ['DoorDouble1x1'],
  locked: ['DoorLocked1x1'],
  trapdoor: ['TrapdoorFloor1x1'],
  portcullis: ['DoorPortcullis1x1'],
  revolving: ['DoorRevolving1x1'],
  secret: ['DoorSecret1x1'],
  magic: ['DoorMagic1x1'],
  'ladder-down': ['LadderDown1x1'],
  'ladder-up': ['LadderUp1x1'],
  stairs: ['Stairs1x1_01'],
  'spiral-stairs': ['StairSpiralSquareDown1x1'],
  window: ['Window1x1'],
  archway: ['DoorArchway1x1'],
  curtain: ['Curtain1x1'],
}
const rolledDoorwayStyles = Object.keys(doorStampTypes) as DoorwayStyle[]

function center(module: SpatialModule): Point { return { col: module.origin.col + Math.floor(module.width / 2), row: module.origin.row + Math.floor(module.height / 2) } }

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
    const used = module.ports.map(port => port.point)
    for (const door of module.footprint) {
      if (used.some(p => Math.abs(p.col - door.col) + Math.abs(p.row - door.row) < 3)) continue
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
  const modules: SpatialModule[] = mission.nodes.map(node => ({
    id: `module-${node.id}`, type: style.moduleType(node), missionNodeId: node.id,
    origin: { col: -1, row: -1 }, width: 3, height: 3, footprint: [], ports: [],
  }))
  const edges = mission.edges.map(edge => ({ ...edge, originalId: edge.id }))
  for (const cycle of mission.cycles.filter(c => c.challenge === 'unknown-return')) {
    const edge = edges.find(e => e.id === `unknown-return-back-${cycle.id}`)
    if (!edge) continue
    const id = `support-${cycle.id}-1`
    modules.push({ id, type: 'room', cycleId: cycle.id, origin: { col: -1, row: -1 }, width: 3, height: 3, footprint: [], ports: [] })
    edges.push({ ...edge, id: `${edge.id}-support`, from: id })
    edge.to = id
  }
  if (request.style === 'cavern-pressure') {
    // The existing convergence room is the junction, not an unrelated extra
    // room attached by an undeclared relationship.
    const merge = edges.find(e => e.id.startsWith('branch-') && e.id.endsWith('-return'))
    const junction = modules.find(m => m.missionNodeId === merge?.to)
    if (junction) junction.type = 'junction'
  }
  arrangeRooms(request, mission, modules, edges, attempt)
  const lookup = new Map(modules.map(m => [m.missionNodeId ?? m.id, m]))
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
  const plan = { style: request.style, modules, connections, anchors: Object.fromEntries(modules.filter(m => m.missionNodeId).map(m => [m.missionNodeId!, m.id])), diagnostics }
  rollGeneratedContent(request, mission, plan)
  return plan
}

function rollGeneratedContent(request: GenerationRequest, mission: Mission, plan: SpacePlan): void {
  const random = createD6Random(normalizeSeed(request.seed) ^ 0x51ed270b)
  const hasMissionReward = mission.nodes.some(node => node.kind === 'reward')
  for (const module of plan.modules.filter(candidate => candidate.footprint.length > 0)) {
    const roll = random.nextD6()
    module.encounter = roll <= 3 ? 'empty' : roll <= 5 ? 'monster' : 'trap'
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
    const goal = plan.modules.find(module => module.missionNodeId === mission.goalNodeId)
    if (goal) goal.hasTreasure = true
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
  for (const issue of getGenerationStyle(request.style).validatePlan(plan)) addDiagnostic(diagnostics, request, issue.code, issue.message, issue.constraint)
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
  for (const missionEdge of mission.edges) if (!missionEdgeConnections.has(missionEdge.id)) addDiagnostic(diagnostics, request, 'unrealized-mission-edge', `Mission relationship ${missionEdge.id} has no spatial connection.`, 'Mission/Space relationship')
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
  for (const module of plan.modules) for (const point of module.footprint) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = FLOOR
  for (const connection of plan.connections) for (const point of connectionFootprint(connection)) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = FLOOR
  for (const connection of plan.connections) if (connection.condition === 'flooded') {
    for (const point of connection.path.slice(1, -1)) if (point.col >= 0 && point.row >= 0 && point.col < request.cols && point.row < request.rows) grid[point.row * request.cols + point.col] = WATER
  }
  const available = request.availableStampTypes ?? STAMP_TYPES
  const stamps: Stamp[] = []
  const labels: Label[] = []
  const addRequired = (semantic: GeneratedMarkerSemantic, id: string, point: Point, direction: Direction) => {
    const stamp = resolveGeneratedStamp(semantic, id, point, available, direction)
    if (!stamp) diagnostics.push({ stage: 'rasterization', code: 'missing-required-stamp', message: `No implemented stamp can realize required semantic type ${semantic}.`, style: request.style, seed: normalizeSeed(request.seed), constraint: 'semantic stamp catalog', candidate: point })
    else stamps.push(stamp)
  }
  const moduleByNode = new Map(plan.modules.filter(module => module.missionNodeId).map(module => [module.missionNodeId!, module]))
  for (const module of plan.modules) {
    const position = center(module)
    if (module.type === 'hub') addRequired('hub', `generated-${module.id}`, position, 'E')
    if (module.missionNodeId === mission.goalNodeId) labels.push({ id: `label-${module.id}`, col: position.col, row: position.row, text: 'Goal' })
    else if (module.missionNodeId === 'start' && module.type === 'hub') labels.push({ id: `label-${module.id}`, col: position.col, row: position.row, text: 'Hub' })
  }
  for (const key of mission.keys) {
    const module = moduleByNode.get(key.nodeId)
    if (module) { const position = center(module); addRequired('key', `generated-${key.id}`, position, 'E'); labels.push({ id: `label-${key.id}`, col: position.col, row: position.row, text: key.id.replace('key-', 'Key ') }) }
  }
  for (const lock of mission.locks) {
    const entries = plan.connections.filter(candidate => mission.edges.some(edge => edge.id === candidate.missionEdgeId && edge.lockId === lock.id))
    for (const [index, connection] of entries.entries()) {
      const position = connection.path[connection.path.length - 2]!
      const localPath = connection.path.slice(-2)
      addRequired('lock', `generated-${lock.id}-${index}`, position, directionForPath(localPath))
    }
  }
  for (const connection of plan.connections) {
    const semantic = connection.semantic
    if (semantic === 'secret' || semantic === 'dangerous' || semantic === 'blocked-return' || semantic === 'one-way') addRequired(semantic === 'dangerous' ? 'danger' : semantic, `generated-${connection.id}`, midpoint(connection.path), directionForPath(connection.path.slice(Math.floor(connection.path.length / 2))))
  }
  const occupied = new Set([...stamps.map(stamp => `${stamp.col},${stamp.row}`), ...labels.map(label => `${label.col},${label.row}`)])
  const roomDecorationPoint = (module: SpatialModule): Point | undefined => {
    const preferred = center(module)
    const distance = (point: Point) => Math.abs(point.col - preferred.col) + Math.abs(point.row - preferred.row)
    return [...module.footprint]
      .sort((a, b) => distance(a) - distance(b) || a.row - b.row || a.col - b.col)
      .find(point => !occupied.has(`${point.col},${point.row}`))
  }
  const addOptional = (types: readonly StampType[], id: string, point: Point, direction: Direction = 'E') => {
    const type = types.find(candidate => available.includes(candidate))
    if (!type) return
    const rotation = direction === 'N' ? 0 : direction === 'E' ? 90 : direction === 'S' ? 180 : 270
    stamps.push({ id, type: type as Stamp['type'], ...point, rotation, z: 0 })
    occupied.add(`${point.col},${point.row}`)
  }
  for (const connection of plan.connections) {
    if (connection.condition !== 'trap' && connection.condition !== 'hazard') continue
    const preferred = midpoint(connection.path)
    const distance = (point: Point) => Math.abs(point.col - preferred.col) + Math.abs(point.row - preferred.row)
    const candidates = connection.path.slice(1, -1).sort((a, b) => distance(a) - distance(b))
    const point = candidates.find(candidate => !occupied.has(`${candidate.col},${candidate.row}`))
    if (point) addOptional(connection.condition === 'trap' ? ['Trap1x1'] : ['Danger1x1'], `generated-hallway-${connection.condition}-${connection.id}`, point)
  }
  for (const connection of plan.connections) for (const doorway of connection.doorways ?? []) {
    if (occupied.has(`${doorway.point.col},${doorway.point.row}`)) continue
    addOptional(doorStampTypes[doorway.style], `generated-${doorway.style}-door-${connection.id}-${doorway.point.col}-${doorway.point.row}`, doorway.point, doorway.direction)
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
      outwardCandidates.push({ run: { id: 'generated-start-descent', col: inside.col, row: inside.row, z: 0, direction: outward, ascending: true }, outward, inside })
    }
    const preferredOutward = oppositeDirection[directionForPath(firstConnection.path.slice(0, 2))]
    outwardCandidates.sort((a, b) => Number(b.outward === preferredOutward) - Number(a.outward === preferredOutward)
      || a.inside.row - b.inside.row || a.inside.col - b.inside.col || directions.indexOf(a.outward) - directions.indexOf(b.outward))
    const origin = outwardCandidates[0]?.run
    if (!origin) {
      diagnostics.push({ stage: 'rasterization', code: 'missing-start-descent', message: 'No unused exterior wall can hold a descent without meeting a hallway.', style: request.style, seed: normalizeSeed(request.seed), constraint: 'unused start-room wall', nodeId: 'start' })
    } else {
      const descentRoll = createD6Random(normalizeSeed(request.seed) ^ 0x1a5c3e2d).nextD6()
      if (descentRoll <= 3) steps.push(origin)
      else ramps.push(origin)
      for (const point of runTiles(origin)) occupied.add(keyOf(point))
    }
  }
  for (const module of plan.modules) {
    if (module.encounter === 'monster' || module.encounter === 'trap') {
      const point = roomDecorationPoint(module)
      if (point) {
        if (module.encounter === 'monster') {
          addOptional(['TriangleArrowhead1x1'], `generated-monster-${module.id}`, point)
        } else {
          addOptional(['Trap1x1'], `generated-room-trap-${module.id}`, point)
        }
      }
    }
    if (module.hasTreasure) {
      const point = roomDecorationPoint(module)
      if (point) addOptional(['Chest1x1'], `generated-room-treasure-${module.id}`, point)
    }
  }
  if (diagnostics.length > 0) return { diagnostics }
  return { snapshot: { grids: new Map([[0, grid]]), stamps, steps, ramps, labels, environmentalColors: new Map() }, diagnostics }
}

export function describeSpaceRealization(request: GenerationRequest, plan: SpacePlan): string {
  return getGenerationStyle(request.style).describe(plan.modules, plan.connections)
}
