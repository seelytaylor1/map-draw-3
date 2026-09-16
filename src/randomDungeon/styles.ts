import { normalizeSeed } from './random'
import { ALL_LOOP_CHALLENGES } from './loopChallenges'
import { LOOP_CHALLENGE_CONTRACTS } from './mission'
import type { GenerationDiagnostic, GenerationRequest, GenerationStyle, Mission, MissionNode, MissionNodeKind, LoopChallenge, Point, SpacePlan, SpatialConnection, SpatialModule, SpatialModuleType } from './missionTypes'

export interface StylePlanIssue {
  code: string
  message: string
  constraint: string
}

export interface GenerationStyleDefinition {
  id: GenerationStyle
  name: string
  description: string
  moduleTypes: readonly SpatialModuleType[]
  supportedLoopChallenges: readonly LoopChallenge[]
  requiredSemantics: readonly string[]
  placeMissionNodes: (request: GenerationRequest, mission: Mission, supportCount: number, unknownSupportCount: number, side: number) => { orderedNodes: MissionNode[]; origins: Point[] }
  moduleType: (missionNode: MissionNode) => SpatialModuleType
  styleSupport?: { id: string; type: SpatialModuleType }
  allowBoundaryCycleFallback: boolean
  describe: (modules: readonly SpatialModule[], connections: readonly SpatialConnection[]) => string
  validatePlan: (plan: Pick<SpacePlan, 'modules'>) => readonly StylePlanIssue[]
}

const ALL_MODULE_TYPES: readonly SpatialModuleType[] = ['room', 'corridor', 'branch', 'junction', 'cycle', 'hub', 'gate', 'secret-connection', 'blocked-return', 'terminal-challenge']
const ALL_SEMANTICS = ['key', 'lock', 'secret', 'danger', 'blocked-return', 'one-way']

export const GENERATION_STYLES: Readonly<Record<GenerationStyle, GenerationStyleDefinition>> = {
  'spine-shortcuts': { id: 'spine-shortcuts', name: 'Spine + Shortcuts', description: 'A readable Start-to-Goal path with deliberate return routes.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, placeMissionNodes: placeMissionNodes, moduleType: spineModuleType, allowBoundaryCycleFallback: true, describe: (_modules, connections) => `spine with ${connections.filter(connection => Boolean(connection.cycleId)).length} explicit shortcut connections`, validatePlan: validateSpinePlan },
  'orbit-gates': { id: 'orbit-gates', name: 'Orbit Gates', description: 'A central landmark with radial regions and declared spokes.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, placeMissionNodes: placeMissionNodes, moduleType: orbitModuleType, allowBoundaryCycleFallback: false, describe: (_modules, connections) => `hub with ${connections.filter(connection => connection.semantic === 'spoke').length} explicit spokes`, validatePlan: validateOrbitPlan },
  'cavern-pressure': { id: 'cavern-pressure', name: 'Cavern Pressure', description: 'Branch-and-merge exploration with explicit secrets and convergences.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, placeMissionNodes: placeMissionNodes, moduleType: cavernModuleType, styleSupport: { id: 'cavern-merge-junction', type: 'junction' }, allowBoundaryCycleFallback: false, describe: (modules, _connections) => `branch-and-merge with ${modules.filter(module => module.type === 'junction' || module.type === 'branch').length} junction modules`, validatePlan: validateCavernPlan },
}

const moduleTypeForNode: Record<MissionNodeKind, SpatialModuleType> = {
  start: 'room', task: 'room', goal: 'terminal-challenge', branch: 'branch', reward: 'room', key: 'room', lock: 'gate', challenge: 'room', hub: 'hub',
}

function moduleTypeFor(missionNode: MissionNode, style: GenerationStyle): SpatialModuleType {
  if (style === 'orbit-gates' && missionNode.id === 'start') return 'hub'
  if (style === 'cavern-pressure' && (missionNode.kind === 'branch' || missionNode.kind === 'challenge')) return 'branch'
  return moduleTypeForNode[missionNode.kind]
}

function spineModuleType(missionNode: MissionNode): SpatialModuleType { return moduleTypeFor(missionNode, 'spine-shortcuts') }
function orbitModuleType(missionNode: MissionNode): SpatialModuleType { return moduleTypeFor(missionNode, 'orbit-gates') }
function cavernModuleType(missionNode: MissionNode): SpatialModuleType { return moduleTypeFor(missionNode, 'cavern-pressure') }

function orderedMissionNodes(mission: Mission, style: GenerationStyle): MissionNode[] {
  const byId = new Map(mission.nodes.map(missionNode => [missionNode.id, missionNode]))
  const ordered: MissionNode[] = []
  const seen = new Set<string>()
  const queue = ['start']
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    const current = byId.get(id)
    if (!current) continue
    seen.add(id)
    ordered.push(current)
    for (const missionEdge of mission.edges) if (missionEdge.from === id && !seen.has(missionEdge.to)) queue.push(missionEdge.to)
  }
  for (const missionNode of mission.nodes) if (!seen.has(missionNode.id)) ordered.push(missionNode)
  if (style !== 'spine-shortcuts') return ordered
  const loopNodeIds = new Set(mission.nodes.filter(missionNode => missionNode.patternId.startsWith('loop-')).map(missionNode => missionNode.id))
  return [...ordered.filter(missionNode => !loopNodeIds.has(missionNode.id)), ...ordered.filter(missionNode => loopNodeIds.has(missionNode.id))]
}

function layoutOrigins(request: GenerationRequest, count: number, side: number): Point[] {
  const stride = side + 2
  const maxCols = Math.floor(Math.max(0, request.cols - 2) / stride)
  const maxRows = Math.floor(Math.max(0, request.rows - 2) / stride)
  if (maxCols < 1 || maxRows < 1 || count > maxCols * maxRows) return []
  const preferredCols = request.style === 'cavern-pressure' ? Math.min(3, maxCols) : Math.max(1, Math.ceil(Math.sqrt(count * (request.cols - 2) / Math.max(1, request.rows - 2))))
  const cols = Math.min(maxCols, preferredCols)
  const rows = Math.ceil(count / cols)
  if (rows > maxRows) return []
  const layoutWidth = (cols - 1) * stride + side
  const layoutHeight = (rows - 1) * stride + side
  const offsetCol = 1 + Math.floor((request.cols - 2 - layoutWidth) / 2)
  const offsetRow = 1 + Math.floor((request.rows - 2 - layoutHeight) / 2)
  const originAt = (col: number, row: number): Point => ({ col: offsetCol + col * stride, row: offsetRow + row * stride })
  if (request.style === 'orbit-gates') {
    const hubCol = Math.floor((cols - 1) / 2)
    const hubRow = Math.floor((rows - 1) / 2)
    const hub = originAt(hubCol, hubRow)
    const candidates: Array<Point & { angle: number; distance: number }> = []
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      if (col === hubCol && row === hubRow) continue
      const origin = originAt(col, row)
      candidates.push({ ...origin, angle: Math.atan2(origin.row - hub.row, origin.col - hub.col), distance: Math.abs(origin.col - hub.col) + Math.abs(origin.row - hub.row) })
    }
    candidates.sort((a, b) => a.angle - b.angle || a.distance - b.distance || a.row - b.row || a.col - b.col)
    return [hub, ...candidates.slice(0, count - 1).map(({ col, row }) => ({ col, row }))]
  }
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const placedCol = request.style === 'spine-shortcuts' && row % 2 === 1 ? cols - col - 1 : col
    return originAt(placedCol, row)
  })
}

function placeMissionNodes(request: GenerationRequest, mission: Mission, supportCount: number, unknownSupportCount: number, side: number): { orderedNodes: MissionNode[]; origins: Point[] } {
  const orderedNodes = orderedMissionNodes(mission, request.style)
  const allOrigins = layoutOrigins(request, orderedNodes.length + supportCount, side)
  if (request.style !== 'spine-shortcuts') return { orderedNodes, origins: allOrigins }
  const loopNodes = orderedNodes.filter(missionNode => missionNode.patternId.startsWith('loop-'))
  const coreNodes = orderedNodes.filter(missionNode => !missionNode.patternId.startsWith('loop-'))
  const coreOrigins = layoutOrigins(request, coreNodes.length, side)
  const loopMaxCol = request.cols - 2 - side - (unknownSupportCount > 0 ? 5 : 0)
  const coreMaxCol = Math.max(...coreOrigins.map(origin => origin.col + side - 1), 0)
  const loopStartCol = Math.min(loopMaxCol, coreMaxCol + 5)
  const loopOrigins = loopNodes.map((_, index) => {
    const group = Math.floor(index / 3)
    const role = index % 3
    return { col: loopStartCol + (role === 2 ? Math.min(10, loopMaxCol - loopStartCol) : 0), row: 8 + group * 12 + (role === 1 ? 6 : role === 2 ? 3 : 0) }
  })
  return { orderedNodes, origins: [...coreOrigins, ...loopOrigins, ...allOrigins.slice(orderedNodes.length)] }
}

function validateSpinePlan(_plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] { return [] }

function validateOrbitPlan(plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] {
  return plan.modules[0]?.type === 'hub' ? [] : [{ code: 'missing-orbit-hub', message: 'Central Hub requires an explicit Start hub.', constraint: 'Central Hub topology' }]
}

function validateCavernPlan(plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] {
  return plan.modules.some(module => module.type === 'branch') ? [] : [{ code: 'missing-cavern-branch', message: 'Branch-and-merge requires an explicit branch module.', constraint: 'Branch-and-merge topology' }]
}

function diagnostic(request: GenerationRequest, code: string, message: string, constraint: string, nodeId?: string): GenerationDiagnostic {
  return { stage: 'mission', code, message, style: request.style, seed: normalizeSeed(request.seed), constraint, ...(nodeId ? { nodeId } : {}) }
}

export function validateGenerationStyle(style: GenerationStyle, request: GenerationRequest, mission?: Mission): GenerationDiagnostic[] {
  const definition = GENERATION_STYLES[style]
  if (!definition) return [diagnostic(request, 'unknown-style', `Unknown Generation Style: ${style}.`, 'style registry')]
  const diagnostics: GenerationDiagnostic[] = []
  for (const challenge of ALL_LOOP_CHALLENGES) if (!definition.supportedLoopChallenges.includes(challenge)) diagnostics.push(diagnostic(request, 'unsupported-loop-challenge', `${definition.name} cannot realize ${challenge}.`, 'complete Loop Challenge contract'))
  if (!definition.requiredSemantics.includes('one-way')) diagnostics.push(diagnostic(request, 'unsupported-one-way-valve', `${definition.name} cannot represent required one-way valve direction.`, 'Unknown Return style contract'))
  if (mission) {
    for (const missionNode of mission.nodes) {
      const moduleType = moduleTypeForNode[missionNode.kind]
      if (!definition.moduleTypes.includes(moduleType)) diagnostics.push(diagnostic(request, 'unsupported-mission-node', `${definition.name} cannot realize ${missionNode.kind} as ${moduleType}.`, 'Mission Node style contract', missionNode.id))
    }
    for (const cycle of mission.cycles) {
      if (!definition.supportedLoopChallenges.includes(cycle.challenge)) diagnostics.push(diagnostic(request, 'unsupported-loop-challenge', `${definition.name} cannot realize ${cycle.challenge}.`, 'complete Loop Challenge contract', cycle.id))
      if (!LOOP_CHALLENGE_CONTRACTS[cycle.challenge]) diagnostics.push(diagnostic(request, 'missing-loop-contract', `No executable contract exists for ${cycle.challenge}.`, 'Loop Challenge contract', cycle.id))
    }
    const semantics = new Set<string>()
    if (mission.keys.length) semantics.add('key')
    if (mission.locks.length) semantics.add('lock')
    for (const edge of mission.edges) {
      if (edge.secret) semantics.add('secret')
      if (edge.dangerous) semantics.add('danger')
      if (edge.blocked) semantics.add('blocked-return')
      if (edge.oneWay) semantics.add('one-way')
    }
    for (const semantic of semantics) if (!definition.requiredSemantics.includes(semantic)) diagnostics.push(diagnostic(request, 'unsupported-semantic', `${definition.name} cannot realize required semantic type ${semantic}.`, 'semantic style contract'))
  }
  return diagnostics
}

export function getGenerationStyle(style: GenerationStyle): GenerationStyleDefinition { return GENERATION_STYLES[style] }
