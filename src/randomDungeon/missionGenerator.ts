import { normalizeSeed } from './random'
import { createComplexityBudget, preflightGeneration, validateGenerationRequest } from './preflight'
import { createMission, summarizeMission } from './mission'
import { validateProgression } from './progression'
import { buildSpacePlan, describeSpaceRealization, rasterizeSpacePlan, validateSpacePlan } from './space'
import { validateGenerationStyle } from './styles'
import type { GenerationDiagnostic, GenerationRequest, Mission, MissionGenerationResult, MissionGenerationSummary } from './missionTypes'

function emptyMission(request: GenerationRequest, diagnostics: GenerationDiagnostic[]): Mission {
  const seed = normalizeSeed(request.seed)
  return { id: `mission-${seed}`, seed, style: request.style, patterns: [], nodes: [], edges: [], keys: [], locks: [], cycles: [], goalNodeId: 'goal', diagnostics }
}

function failure(request: GenerationRequest, mission: Mission, preflight: ReturnType<typeof preflightGeneration>, diagnostics: GenerationDiagnostic[], rejectedAttempts = diagnostics): MissionGenerationResult {
  const summary: MissionGenerationSummary = { seed: normalizeSeed(request.seed), style: request.style, status: 'failed', budget: preflight.budget, preflight, mission: summarizeMission(mission), space: { modules: 0, connections: 0, realization: 'not realized' }, diagnostics, rejectedAttempts: rejectedAttempts.length }
  return { ok: false, request, seed: normalizeSeed(request.seed), mission, preflight, summary, diagnostics, failedAttempts: rejectedAttempts }
}

export function normalizeGenerationRequest(request: GenerationRequest): GenerationRequest {
  return { ...request, seed: normalizeSeed(request.seed), orientation: request.orientation ?? (request.cols >= request.rows ? 'landscape' : 'portrait') }
}

export function generateMissionDungeon(input: GenerationRequest): MissionGenerationResult {
  const inputDiagnostics = validateGenerationRequest(input)
  const request = normalizeGenerationRequest(input)
  const preflight = preflightGeneration(request)
  if (inputDiagnostics.length > 0) return failure(request, emptyMission(request, inputDiagnostics), preflight, inputDiagnostics)
  if (preflight.status === 'impossible') {
    const mission = createMission(request, preflight.budget)
    const diagnostics = [...preflight.diagnostics, ...mission.diagnostics]
    return failure(request, mission, preflight, diagnostics)
  }

  const mission = createMission(request, preflight.budget)
  const contractDiagnostics = validateGenerationStyle(request.style, request, mission)
  if (contractDiagnostics.length > 0) return failure(request, mission, preflight, [...preflight.diagnostics, ...contractDiagnostics])
  const progression = validateProgression(mission)
  if (!progression.solvable) return failure(request, mission, preflight, [...preflight.diagnostics, ...mission.diagnostics, ...progression.diagnostics])

  let space = buildSpacePlan(request, mission)
  let spaceValidation = validateSpacePlan(request, space, mission)
  let attempts = 0
  const rejected: GenerationDiagnostic[] = []
  while (!spaceValidation.valid && attempts < 31) {
    const reason = spaceValidation.diagnostics[0]!
    rejected.push({ ...reason, message: `Placement ${attempts + 1}: ${reason.message}` })
    space = buildSpacePlan(request, mission, ++attempts)
    spaceValidation = validateSpacePlan(request, space, mission)
  }
  if (!spaceValidation.valid) return failure(request, mission, preflight, [...preflight.diagnostics, ...spaceValidation.diagnostics], [...rejected, spaceValidation.diagnostics[0]!])
  const rasterized = rasterizeSpacePlan(request, mission, space)
  if (!rasterized.snapshot) return failure(request, mission, preflight, [...preflight.diagnostics, ...rasterized.diagnostics], rasterized.diagnostics)

  const diagnostics = [...preflight.diagnostics, ...mission.diagnostics, ...rasterized.diagnostics]
  const summary: MissionGenerationSummary = { seed: normalizeSeed(request.seed), style: request.style, status: 'success', budget: preflight.budget, preflight, mission: summarizeMission(mission), space: { modules: space.modules.length, connections: space.connections.length, realization: describeSpaceRealization(request, space) }, diagnostics, rejectedAttempts: attempts }
  return { ok: true, request, seed: normalizeSeed(request.seed), snapshot: rasterized.snapshot, mission, space, preflight, summary, diagnostics, failedAttempts: rejected }
}

export { createComplexityBudget, preflightGeneration, validateGenerationRequest }
