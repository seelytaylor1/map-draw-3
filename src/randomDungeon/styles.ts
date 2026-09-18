import { normalizeSeed } from './random'
import { ALL_LOOP_CHALLENGES } from './loopChallenges'
import { LOOP_CHALLENGE_CONTRACTS } from './mission'
import type { GenerationDiagnostic, GenerationRequest, GenerationStyle, Mission, MissionNode, MissionNodeKind, LoopChallenge, SpacePlan, SpatialConnection, SpatialModule, SpatialModuleType } from './missionTypes'

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
  moduleType: (missionNode: MissionNode) => SpatialModuleType
  describe: (modules: readonly SpatialModule[], connections: readonly SpatialConnection[]) => string
  validatePlan: (plan: Pick<SpacePlan, 'modules' | 'connections'>, mission: Mission) => readonly StylePlanIssue[]
}

const ALL_MODULE_TYPES: readonly SpatialModuleType[] = ['room', 'corridor', 'branch', 'junction', 'cycle', 'hub', 'gate', 'secret-connection', 'blocked-return', 'terminal-challenge']
const ALL_SEMANTICS = ['key', 'lock', 'secret', 'danger', 'blocked-return', 'one-way']

export const GENERATION_STYLES: Readonly<Record<GenerationStyle, GenerationStyleDefinition>> = {
  'spine-shortcuts': { id: 'spine-shortcuts', name: 'Critical Spine', description: 'A linear Start-to-Goal spine that becomes the loop at one loop; later loops return to the spine.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: spineModuleType, describe: (_modules, connections) => `critical spine with ${connections.filter(connection => Boolean(connection.cycleId)).length} loop-route connections`, validatePlan: validateSpinePlan },
  'orbit-gates': { id: 'orbit-gates', name: 'Central Hub', description: 'A central hub with direct room spokes and loops that leave and return to the hub.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: orbitModuleType, describe: (_modules, connections) => `central hub with ${connections.filter(connection => connection.semantic === 'spoke').length} declared spokes`, validatePlan: validateOrbitPlan },
  'cavern-pressure': { id: 'cavern-pressure', name: 'Branch-and-merge', description: 'Separate loops whose starts follow a room chain and merge at explicit junctions.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: cavernModuleType, describe: (modules, _connections) => `branch-and-merge with ${modules.filter(module => module.type === 'junction' || module.type === 'branch').length} branch and merge modules`, validatePlan: validateCavernPlan },
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

function validateSpinePlan(_plan: Pick<SpacePlan, 'modules' | 'connections'>, mission: Mission): readonly StylePlanIssue[] {
  if (mission.cycles.length === 0) {
    return mission.edges.every(edge => edge.kind === 'progression')
      ? []
      : [{ code: 'nonlinear-empty-spine', message: 'Critical Spine without loops must be a linear progression.', constraint: 'Critical Spine topology' }]
  }
  if (mission.cycles.length === 1) {
    const cycle = mission.cycles[0]!
    return cycle.roles.objectiveNode === mission.goalNodeId && !mission.edges.some(edge => edge.kind === 'progression')
      ? []
      : [{ code: 'invalid-single-spine-loop', message: 'One Critical Spine loop must replace the spine with two routes to Goal.', constraint: 'Critical Spine topology' }]
  }
  return mission.cycles.every(cycle =>
    cycle.roles.objectiveNode !== mission.goalNodeId
    && mission.nodes.some(node => node.id === cycle.roles.objectiveNode && node.patternId === 'progression'),
  )
    ? []
    : [{ code: 'spine-loop-does-not-return', message: 'Additional Critical Spine loops must return to a non-Goal room on the spine.', constraint: 'Critical Spine topology' }]
}

function validateOrbitPlan(plan: Pick<SpacePlan, 'modules' | 'connections'>, mission: Mission): readonly StylePlanIssue[] {
  const hub = plan.modules.find(module => module.missionNodeId === 'start')
  if (hub?.type !== 'hub') return [{ code: 'missing-orbit-hub', message: 'Central Hub requires an explicit Start hub.', constraint: 'Central Hub topology' }]
  if (!mission.edges.some(edge => edge.from === 'start' && edge.to === mission.goalNodeId)) return [{ code: 'missing-hub-goal-spoke', message: 'Central Hub requires a direct Goal spoke from the hub.', constraint: 'Central Hub topology' }]
  if (mission.cycles.some(cycle => cycle.roles.anchorNode !== 'start' || cycle.roles.objectiveNode === mission.goalNodeId)) return [{ code: 'hub-loop-not-returning', message: 'Central Hub loops must leave and return to the Start hub without using Goal.', constraint: 'Central Hub topology' }]
  const moduleByNode = new Map(plan.modules.filter(module => module.missionNodeId).map(module => [module.missionNodeId!, module.id]))
  return mission.cycles.every(cycle => [cycle.roles.routeANode, cycle.roles.routeBNode].every(nodeId =>
    // A loop modifier may give its outgoing spoke a stronger semantic such
    // as secret, dangerous, or locked; it remains a declared hub departure.
    plan.connections.some(connection => connection.fromModuleId === hub.id && connection.toModuleId === moduleByNode.get(nodeId)),
  ))
    ? []
    : [{ code: 'missing-hub-loop-spoke', message: 'Each Central Hub loop needs two declared spokes from the hub.', constraint: 'Central Hub topology' }]
}

function validateCavernPlan(plan: Pick<SpacePlan, 'modules' | 'connections'>, mission: Mission): readonly StylePlanIssue[] {
  if (mission.cycles.some(cycle => cycle.roles.objectiveNode === mission.goalNodeId)) return [{ code: 'cavern-loop-reaches-goal', message: 'Branch-and-merge loops must remain separate from the Goal route.', constraint: 'Branch-and-merge topology' }]
  if (new Set(mission.cycles.map(cycle => cycle.roles.objectiveNode)).size !== mission.cycles.length) return [{ code: 'shared-cavern-merge', message: 'Each Branch-and-merge loop requires its own merge room.', constraint: 'Branch-and-merge topology' }]
  const expectedJunctions = new Set(mission.cycles.map(cycle => cycle.roles.objectiveNode))
  return [...expectedJunctions].every(nodeId => plan.modules.some(module => module.missionNodeId === nodeId && module.type === 'junction'))
    ? []
    : [{ code: 'missing-cavern-merge', message: 'Each Branch-and-merge loop must end at an explicit junction.', constraint: 'Branch-and-merge topology' }]
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
