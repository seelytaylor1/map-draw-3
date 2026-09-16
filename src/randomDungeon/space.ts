import { FLOOR } from '../constants'
import { createGrid } from '../grid'
import type { AppSnapshotShape, Direction, GeneratedMarkerSemantic, Point } from './commonTypes'
import { normalizeSeed } from './random'
import { getGenerationStyle, validateGenerationStyle } from './styles'
import { validateProgression } from './progression'
import type { GenerationDiagnostic, GenerationRequest, Mission, MissionCycle, MissionEdge, Port, SpacePlan, SpatialConnection, SpatialConnectionSemantic, SpatialModule } from './missionTypes'
import { STAMP_TYPES, type Stamp } from '../stamps'
import type { Label } from '../labels'
import { resolveGeneratedStamp } from './generatedContent'

const keyOf = (point: Point) => `${point.col},${point.row}`
const directions: Direction[] = ['N', 'E', 'S', 'W']

function center(module: SpatialModule): Point { return { col: module.origin.col + Math.floor(module.width / 2), row: module.origin.row + Math.floor(module.height / 2) } }

function footprint(origin: Point, width: number, height: number): Point[] {
  const points: Point[] = []
  for (let row = origin.row; row < origin.row + height; row++) for (let col = origin.col; col < origin.col + width; col++) points.push({ col, row })
  return points
}

function moduleDirection(from: SpatialModule, to: SpatialModule): Direction {
  const a = center(from)
  const b = center(to)
  if (Math.abs(b.col - a.col) >= Math.abs(b.row - a.row)) return b.col >= a.col ? 'E' : 'W'
  return b.row >= a.row ? 'S' : 'N'
}

function portPoint(module: SpatialModule, direction: Direction, offset = 0): Point {
  const own = center(module)
  if (direction === 'E' || direction === 'W') return { col: direction === 'E' ? module.origin.col + module.width - 1 : module.origin.col, row: own.row + offset }
  return { col: own.col + offset, row: direction === 'S' ? module.origin.row + module.height - 1 : module.origin.row }
}

function portDirection(module: SpatialModule, point: Point): Direction {
  if (point.col === module.origin.col) return 'W'
  if (point.col === module.origin.col + module.width - 1) return 'E'
  if (point.row === module.origin.row) return 'N'
  return 'S'
}

function choosePortPoint(module: SpatialModule, target: SpatialModule, occupied: ReadonlySet<string> = new Set()): Point {
  return portCandidates(module, target, occupied)[0] ?? portPoint(module, moduleDirection(module, target))
}

function portCandidates(module: SpatialModule, target: SpatialModule, occupied: ReadonlySet<string> = new Set()): Point[] {
  const preferred = moduleDirection(module, target)
  const candidates = [preferred, ...directions.filter(direction => direction !== preferred)]
  const available: Point[] = []
  const blocked: Point[] = []
  const used = new Set(module.ports.map(port => keyOf(port.point)))
  for (const direction of candidates) for (const offset of [0, -1, 1]) {
    const point = portPoint(module, direction, offset)
    const outward = direction === 'E' ? { col: point.col + 1, row: point.row } : direction === 'W' ? { col: point.col - 1, row: point.row } : direction === 'S' ? { col: point.col, row: point.row + 1 } : { col: point.col, row: point.row - 1 }
    if (used.has(keyOf(point))) continue
    if (occupied.has(keyOf(outward))) blocked.push(point)
    else available.push(point)
  }
  return [...new Map([...available, ...blocked].map(point => [keyOf(point), point])).values()]
}

function portFor(module: SpatialModule, target: SpatialModule, id: string, width: 1 | 2 | 4, connectionId?: string, point = choosePortPoint(module, target)): Port {
  const direction = portDirection(module, point)
  return { id, point, direction, width, ...(connectionId ? { connectionId } : {}) }
}

function routeBetween(start: Point, finish: Point, request: GenerationRequest, modules: Iterable<SpatialModule>, occupied: ReadonlySet<string>): Point[] | null {
  const protectedCells = new Set([...modules].flatMap(module => module.footprint.map(keyOf)))
  const startKey = keyOf(start)
  const finishKey = keyOf(finish)
  const inBounds = (point: Point) => point.col > 0 && point.row > 0 && point.col < request.cols - 1 && point.row < request.rows - 1
  const search = (avoidOccupied: boolean): Point[] | null => {
    const queue: Point[] = [{ ...start }]
    const parent = new Map<string, string | null>([[startKey, null]])
    const canEnter = (point: Point) => {
      const key = keyOf(point)
      return key === finishKey || key === startKey || (!protectedCells.has(key) && (!avoidOccupied || !occupied.has(key)))
    }
    while (queue.length > 0) {
      const current = queue.shift()!
      const currentKey = keyOf(current)
      if (currentKey === finishKey) {
        const path: Point[] = []
        let key: string | null = currentKey
        while (key !== null) {
          const [col, row] = key.split(',').map(Number)
          path.push({ col, row })
          key = parent.get(key) ?? null
        }
        return path.reverse()
      }
      for (const next of [
        { col: current.col + 1, row: current.row }, { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 }, { col: current.col, row: current.row - 1 },
      ]) {
        const nextKey = keyOf(next)
        if (inBounds(next) && canEnter(next) && !parent.has(nextKey)) {
          parent.set(nextKey, currentKey)
          queue.push(next)
        }
      }
    }
    return null
  }
  // Prefer a clean corridor. If an already-realized corridor blocks the only
  // aperture escape, reuse it and let validation expose the resulting explicit
  // junction metadata rather than dropping the Mission relationship.
  return search(true) ?? search(false)
}

function boundaryRoutes(start: Point, finish: Point, request: GenerationRequest): Point[][] {
  const corners: Point[] = [
    { col: 1, row: 1 }, { col: request.cols - 2, row: 1 },
    { col: 1, row: request.rows - 2 }, { col: request.cols - 2, row: request.rows - 2 },
  ]
  const appendSegment = (path: Point[], target: Point) => {
    const current = path[path.length - 1]!
    const colStep = target.col === current.col ? 0 : target.col > current.col ? 1 : -1
    const rowStep = target.row === current.row ? 0 : target.row > current.row ? 1 : -1
    let col = current.col
    let row = current.row
    while (col !== target.col || row !== target.row) {
      if (col !== target.col) col += colStep
      else row += rowStep
      path.push({ col, row })
    }
  }
  const routes: Point[][] = []
  for (const corner of corners) {
    const firstOrders: [Point, Point][] = [
      [{ col: corner.col, row: start.row }, corner],
      [{ col: start.col, row: corner.row }, corner],
    ]
    const lastOrders: [Point, Point][] = [
      [{ col: corner.col, row: finish.row }, finish],
      [{ col: finish.col, row: corner.row }, finish],
    ]
    for (const [firstBend, firstEnd] of firstOrders) for (const [lastBend, lastEnd] of lastOrders) {
      const path: Point[] = [{ ...start }]
      appendSegment(path, firstBend)
      appendSegment(path, firstEnd)
      appendSegment(path, lastBend)
      appendSegment(path, lastEnd)
      routes.push(path)
    }
  }
  return routes
}

function isCleanRoute(path: Point[], request: GenerationRequest, modules: Iterable<SpatialModule>, occupied: ReadonlySet<string>): boolean {
  const protectedCells = new Set([...modules].flatMap(module => module.footprint.map(keyOf)))
  return path.every((point, index) => {
    const endpoint = index === 0 || index === path.length - 1
    return point.col > 0 && point.row > 0 && point.col < request.cols - 1 && point.row < request.rows - 1 && (endpoint || (!protectedCells.has(keyOf(point)) && !occupied.has(keyOf(point))))
  })
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
  const explicitJunction = from.type === 'hub' || to.type === 'hub' || from.type === 'junction' || to.type === 'junction' || from.type === 'branch' || to.type === 'branch'
  const occupied = new Set(connections.flatMap(connection => connectionFootprint(connection).map(keyOf)))
  let apertureFrom = choosePortPoint(from, to, occupied)
  let apertureTo = choosePortPoint(to, from, occupied)
  let path: Point[] | null = null
  let fallbackPath: { from: Point; to: Point; path: Point[] } | null = null
  const fromCandidates = portCandidates(from, to, occupied)
  const toCandidates = portCandidates(to, from, occupied)
  for (const candidateFrom of fromCandidates) for (const candidateTo of toCandidates) {
    const candidatePath = routeBetween(candidateFrom, candidateTo, request, modules.values(), occupied)
    if (!candidatePath) continue
    fallbackPath ??= { from: candidateFrom, to: candidateTo, path: candidatePath }
    if (isCleanRoute(candidatePath, request, modules.values(), occupied)) {
      apertureFrom = candidateFrom
      apertureTo = candidateTo
      path = candidatePath
      break
    }
  }
  if (!path && getGenerationStyle(request.style).allowBoundaryCycleFallback && missionEdge.kind === 'cycle-route') {
    for (const candidateFrom of fromCandidates) for (const candidateTo of toCandidates) for (const candidatePath of boundaryRoutes(candidateFrom, candidateTo, request)) {
      if (!isCleanRoute(candidatePath, request, modules.values(), occupied)) continue
      apertureFrom = candidateFrom
      apertureTo = candidateTo
      path = candidatePath
      break
    }
  }
  if (!path && fallbackPath) {
    apertureFrom = fallbackPath.from
    apertureTo = fallbackPath.to
    path = fallbackPath.path
  }
  if (!path) return null
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
  from.ports.push(portFor(from, to, `${connection.id}-from`, width, connection.id, apertureFrom))
  to.ports.push(portFor(to, from, `${connection.id}-to`, width, connection.id, apertureTo))
  return connection
}

function addUnknownReturnSupport(request: GenerationRequest, cycle: MissionCycle, modules: Map<string, SpatialModule>, supportModules: SpatialModule[], connections: SpatialConnection[]): void {
  const keyNode = cycle.roles.keyNode
  if (!keyNode) return
  const keyModule = modules.get(keyNode)
  const startModule = modules.get(cycle.roles.anchorNode)
  if (!keyModule || !startModule) return
  const backEdgeId = `unknown-return-back-${cycle.id}`
  const count = Math.max(1, Math.min(4, Math.floor((request.complexity === 'dense' ? 16 : request.complexity === 'standard' ? 10 : 6) / 8)))
  let previous = keyModule
  for (let index = 0; index < count; index++) {
    const support = supportModules.find(candidate => candidate.id === `support-${cycle.id}-${index + 1}`)
    if (!support) continue
    const synthetic: MissionEdge = { id: backEdgeId, from: previous.missionNodeId ?? keyNode, to: support.missionNodeId ?? support.id, kind: 'return', coupling: 'loose' }
    const connection = addConnection(connections, new Map([...modules.entries(), [support.id, support]]), synthetic, request, cycle.id, backEdgeId)
    if (connection) connection.explicitJunction = false
    previous = support
  }
  const synthetic: MissionEdge = { id: backEdgeId, from: previous.missionNodeId ?? previous.id, to: startModule.missionNodeId ?? cycle.roles.anchorNode, kind: 'return', coupling: 'loose' }
  const connection = addConnection(connections, new Map([...modules.entries(), ...supportModules.map(module => [module.id, module] as const)]), synthetic, request, cycle.id, backEdgeId)
  if (connection) {
    // Use a dedicated outer return lane for the final leg. It is intentionally
    // independent of the approach/valve corridors, including on compact
    // layouts where a generic shortest-path search would be forced through a
    // previously used aperture.
    const occupied = new Set(connections.filter(candidate => candidate !== connection).flatMap(candidate => connectionFootprint(candidate).map(keyOf)))
    const protectedCells = new Set([...modules.values()].flatMap(module => module.footprint.map(keyOf)))
    const isCleanOuterPath = (path: Point[]) => path.every((point, index) => {
      const endpoint = index === 0 || index === path.length - 1
      return point.col > 0 && point.row > 0 && point.col < request.cols - 1 && point.row < request.rows - 1 && (endpoint || (!protectedCells.has(keyOf(point)) && !occupied.has(keyOf(point))))
    })
    const fromPoint = portPoint(previous, 'S')
    const toPoint = portPoint(startModule, 'N', 1)
    const outerPath: Point[] = [{ ...fromPoint }, { col: fromPoint.col, row: fromPoint.row + 1 }]
    for (let col = fromPoint.col - 1; col >= 1; col--) outerPath.push({ col, row: fromPoint.row + 1 })
    for (let row = fromPoint.row; row >= 1; row--) outerPath.push({ col: 1, row })
    for (let col = 2; col <= toPoint.col; col++) outerPath.push({ col, row: 1 })
    for (let row = 2; row <= toPoint.row; row++) outerPath.push({ col: toPoint.col, row })
    connection.path = isCleanOuterPath(outerPath) ? outerPath : connection.path
    connection.apertureFrom = fromPoint
    connection.apertureTo = toPoint
    const fromPort = previous.ports.find(port => port.connectionId === connection.id)
    const toPort = startModule.ports.find(port => port.connectionId === connection.id)
    if (fromPort) { fromPort.point = fromPoint; fromPort.direction = portDirection(previous, fromPoint) }
    if (toPort) { toPort.point = toPoint; toPort.direction = portDirection(startModule, toPoint) }
    connection.explicitJunction = false
  }
}

export interface SpaceValidationResult { valid: boolean; diagnostics: GenerationDiagnostic[] }

export function buildSpacePlan(request: GenerationRequest, mission: Mission): SpacePlan {
  const seed = normalizeSeed(request.seed)
  const diagnostics: GenerationDiagnostic[] = [...validateGenerationStyle(request.style, request, mission)]
  const side = 3
  const style = getGenerationStyle(request.style)
  const unknownCycles = mission.cycles.filter(cycle => cycle.challenge === 'unknown-return')
  const unknownSupportCount = unknownCycles.reduce(total => total + Math.max(1, Math.min(4, Math.floor((request.complexity === 'dense' ? 16 : request.complexity === 'standard' ? 10 : 6) / 8))), 0)
  const styleSupportCount = style.styleSupport ? 1 : 0
  const supportCount = styleSupportCount + unknownSupportCount
  const { orderedNodes, origins } = style.placeMissionNodes(request, mission, supportCount, unknownSupportCount, side)
  if (origins.length !== orderedNodes.length + supportCount) diagnostics.push({ stage: 'space', code: 'placement-capacity', message: `The ${request.style} grammar could not place all mission anchors and required supporting space with a 3×3 room minimum and one-cell buffers.`, style: request.style, seed, constraint: 'buffered grid-cell footprints' })
  const modules: SpatialModule[] = []
  const moduleByNode = new Map<string, SpatialModule>()
  for (const [index, missionNode] of orderedNodes.entries()) {
    const origin = origins[index] ?? { col: -1, row: -1 }
    const cycle = mission.cycles.find(candidate => [candidate.roles.anchorNode, candidate.roles.challengeNode, candidate.roles.objectiveNode, candidate.roles.keyNode].includes(missionNode.id))
    const module: SpatialModule = { id: `module-${missionNode.id}`, type: style.moduleType(missionNode), missionNodeId: missionNode.id, ...(cycle ? { cycleId: cycle.id } : {}), origin, width: side, height: side, footprint: footprint(origin, side, side), ports: [] }
    modules.push(module)
    moduleByNode.set(missionNode.id, module)
  }
  const supportModules: SpatialModule[] = []
  let supportIndex = orderedNodes.length
  if (style.styleSupport) {
    const origin = origins[supportIndex++] ?? { col: -1, row: -1 }
    supportModules.push({ id: style.styleSupport.id, type: style.styleSupport.type, origin, width: side, height: side, footprint: footprint(origin, side, side), ports: [] })
  }
  for (const cycle of unknownCycles) {
    const count = Math.max(1, Math.min(4, Math.floor((request.complexity === 'dense' ? 16 : request.complexity === 'standard' ? 10 : 6) / 8)))
    for (let index = 0; index < count; index++) {
      supportIndex++
      // Unknown Return's support rooms form a separate return lane along the
      // lower edge of the page. Keeping that lane away from the approach
      // valve makes the return physically distinct instead of retracing it.
      const maxSupportCols = Math.max(1, Math.floor(Math.max(0, request.cols - 2) / 5))
      const maxSupportRows = Math.max(1, Math.floor(Math.max(0, request.rows - 2) / 5))
      const origin = {
        col: request.cols - 5 - (index % maxSupportCols) * 5,
        row: 1 + (maxSupportRows - 1) * 5,
      }
      supportModules.push({ id: `support-${cycle.id}-${index + 1}`, type: 'room', cycleId: cycle.id, origin, width: side, height: side, footprint: footprint(origin, side, side), ports: [] })
    }
  }
  // Mission edges are keyed by Mission Node ids, while spatial validation and
  // connection records use Spatial Module ids. Keep the mission-id lookup here
  // so every declared Mission relationship can be realized.
  const allModules = new Map<string, SpatialModule>(moduleByNode)
  for (const support of supportModules) allModules.set(support.id, support)
  const connections: SpatialConnection[] = []
  if (style.styleSupport?.type === 'junction') {
    const branch = modules.find(module => module.type === 'branch')
    const junction = supportModules.find(module => module.type === 'junction')
    if (branch && junction) addConnection(connections, allModules, { id: 'cavern-branch-merge', from: branch.missionNodeId!, to: junction.id, kind: 'optional', coupling: 'loose' }, request)
  }
  const cycleByEdge = new Map<string, string>()
  for (const cycle of mission.cycles) for (const edgeId of cycle.routeEdgeIds) cycleByEdge.set(edgeId, cycle.id)
  const unknownBackEdges = new Set(unknownCycles.map(cycle => `unknown-return-back-${cycle.id}`))
  for (const missionEdge of mission.edges) {
    if (unknownBackEdges.has(missionEdge.id)) continue
    const cycleId = cycleByEdge.get(missionEdge.id) ?? mission.cycles.find(cycle => missionEdge.id.startsWith(`key-access-${cycle.id}-`))?.id
    addConnection(connections, allModules, missionEdge, request, cycleId)
  }
  for (const cycle of unknownCycles) {
    addUnknownReturnSupport(request, cycle, allModules, supportModules.filter(module => module.cycleId === cycle.id), connections)
  }
  return { style: request.style, modules: [...modules, ...supportModules], connections, anchors: Object.fromEntries(modules.map(module => [module.missionNodeId!, module.id])), diagnostics }
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
    for (let offset = -half; offset <= half; offset++) {
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
      const sameDeclaredCycle = Boolean(previousConnection?.cycleId && connection.cycleId && previousConnection.cycleId === connection.cycleId)
      const declaredLoopGeometry = Boolean(previousConnection?.cycleId || connection.cycleId)
      const sharedRoomEndpoint = Boolean(previousConnection && (previousConnection.fromModuleId === connection.fromModuleId || previousConnection.fromModuleId === connection.toModuleId || previousConnection.toModuleId === connection.fromModuleId || previousConnection.toModuleId === connection.toModuleId))
      if (previousConnection && previousConnection.id !== connection.id && previousConnection.missionEdgeId !== connection.missionEdgeId && !sameDeclaredCycle && !declaredLoopGeometry && !sharedRoomEndpoint && !previousConnection.explicitJunction && !connection.explicitJunction) addDiagnostic(diagnostics, request, 'accidental-crossing', `Connection ${connection.id} overlaps ordinary corridor ${previousConnection.id}.`, 'explicit junction required', point)
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
    if (module.missionNodeId === 'start' || module.missionNodeId === mission.goalNodeId) labels.push({ id: `label-${module.id}`, col: position.col, row: position.row, text: module.missionNodeId === 'start' && module.type === 'hub' ? 'Hub / Start' : module.missionNodeId === 'start' ? 'Start' : 'Goal' })
  }
  for (const key of mission.keys) {
    const module = moduleByNode.get(key.nodeId)
    if (module) { const position = center(module); addRequired('key', `generated-${key.id}`, position, 'E'); labels.push({ id: `label-${key.id}`, col: position.col, row: position.row, text: key.id.replace('key-', 'Key ') }) }
  }
  for (const lock of mission.locks) {
    const connection = plan.connections.find(candidate => candidate.missionEdgeId && mission.edges.some(edge => edge.id === candidate.missionEdgeId && edge.lockId === lock.id))
    const module = moduleByNode.get(lock.nodeId)
    const position = connection ? midpoint(connection.path) : module ? center(module) : { col: 1, row: 1 }
    addRequired('lock', `generated-${lock.id}`, position, connection ? directionForPath(connection.path) : 'E')
  }
  for (const connection of plan.connections) {
    const semantic = connection.semantic
    if (semantic === 'secret' || semantic === 'dangerous' || semantic === 'blocked-return' || semantic === 'one-way') addRequired(semantic === 'dangerous' ? 'danger' : semantic, `generated-${connection.id}`, midpoint(connection.path), directionForPath(connection.path))
  }
  if (diagnostics.length > 0) return { diagnostics }
  return { snapshot: { grids: new Map([[0, grid]]), stamps, steps: [], ramps: [], labels, environmentalColors: new Map() }, diagnostics }
}

export function describeSpaceRealization(request: GenerationRequest, plan: SpacePlan): string {
  return getGenerationStyle(request.style).describe(plan.modules, plan.connections)
}
