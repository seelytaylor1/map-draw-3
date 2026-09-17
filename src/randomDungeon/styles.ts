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
  validatePlan: (plan: Pick<SpacePlan, 'modules'>) => readonly StylePlanIssue[]
}

const ALL_MODULE_TYPES: readonly SpatialModuleType[] = ['room', 'corridor', 'branch', 'junction', 'cycle', 'hub', 'gate', 'secret-connection', 'blocked-return', 'terminal-challenge']
const ALL_SEMANTICS = ['key', 'lock', 'secret', 'danger', 'blocked-return', 'one-way']

export const GENERATION_STYLES: Readonly<Record<GenerationStyle, GenerationStyleDefinition>> = {
  'spine-shortcuts': { id: 'spine-shortcuts', name: 'Spine + Shortcuts', description: 'A readable Start-to-Goal path with deliberate return routes.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: spineModuleType, describe: (_modules, connections) => `spine with ${connections.filter(connection => Boolean(connection.cycleId)).length} explicit shortcut connections`, validatePlan: validateSpinePlan },
  'orbit-gates': { id: 'orbit-gates', name: 'Orbit Gates', description: 'A central landmark with radial regions and declared spokes.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: orbitModuleType, describe: (_modules, connections) => `hub with ${connections.filter(connection => connection.semantic === 'spoke').length} explicit spokes`, validatePlan: validateOrbitPlan },
  'cavern-pressure': { id: 'cavern-pressure', name: 'Cavern Pressure', description: 'Branch-and-merge exploration with explicit secrets and convergences.', moduleTypes: ALL_MODULE_TYPES, supportedLoopChallenges: ALL_LOOP_CHALLENGES, requiredSemantics: ALL_SEMANTICS, moduleType: cavernModuleType, describe: (modules, _connections) => `branch-and-merge with ${modules.filter(module => module.type === 'junction' || module.type === 'branch').length} junction modules`, validatePlan: validateCavernPlan },
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

function validateSpinePlan(_plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] { return [] }

function validateOrbitPlan(plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] {
  return plan.modules[0]?.type === 'hub' ? [] : [{ code: 'missing-orbit-hub', message: 'Central Hub requires an explicit Start hub.', constraint: 'Central Hub topology' }]
}

function validateCavernPlan(plan: Pick<SpacePlan, 'modules'>): readonly StylePlanIssue[] {
  return !plan.modules.some(module => module.missionNodeId?.startsWith('branch-') && module.type !== 'branch') ? [] : [{ code: 'missing-cavern-branch', message: 'Branch-and-merge requires an explicit branch module.', constraint: 'Branch-and-merge topology' }]
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
