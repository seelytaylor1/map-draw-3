import { normalizeSeed } from './random'
import { dependencyCounts, isLoopPreference, resolveLoopChallenges } from './loopChallenges'
import { resolveDungeonLevelBudget } from './monsterBudget'
import type { ComplexityBudget, ComplexityPreset, GenerationDiagnostic, GenerationRequest, PageCapacity, PreflightResult } from './missionTypes'

const PRESET_TARGETS: Record<ComplexityPreset, Omit<ComplexityBudget, 'preset' | 'requestedLoops' | 'seed' | 'loopChallenges' | 'derivedKeys' | 'derivedLocks'>> = {
  compact: {
    missionNodes: 5,
    branches: 0,
    challengeDensity: 0.2,
    presetLoopTarget: 0,
    supportingSpace: 6,
    minimumRooms: 3,
    corridorWidths: [1],
  },
  standard: {
    missionNodes: 8,
    branches: 1,
    challengeDensity: 0.35,
    presetLoopTarget: 1,
    supportingSpace: 10,
    minimumRooms: 5,
    corridorWidths: [1, 2],
  },
  dense: {
    missionNodes: 12,
    branches: 2,
    challengeDensity: 0.5,
    presetLoopTarget: 2,
    supportingSpace: 16,
    minimumRooms: 8,
    corridorWidths: [1, 2, 4],
  },
}

export function createComplexityBudget(request: Pick<GenerationRequest, 'complexity' | 'loopCount' | 'seed'> & Partial<Pick<GenerationRequest, 'loopPreference' | 'loopChallenges'>>): ComplexityBudget {
  const seed = normalizeSeed(request.seed)
  const target = PRESET_TARGETS[request.complexity] ?? PRESET_TARGETS.standard
  const preset = PRESET_TARGETS[request.complexity] ? request.complexity : 'standard'
  const loopChallenges = resolveLoopChallenges({ seed, loopCount: request.loopCount, loopPreference: request.loopPreference ?? 'varied', loopChallenges: request.loopChallenges })
  const dependencies = dependencyCounts(loopChallenges)
  return {
    preset,
    ...target,
    requestedLoops: Number.isInteger(request.loopCount) && request.loopCount >= 0 ? request.loopCount : 0,
    loopChallenges,
    derivedKeys: dependencies.keys,
    derivedLocks: dependencies.locks,
    seed,
  }
}

export function derivePageCapacity(request: Pick<GenerationRequest, 'cols' | 'rows' | 'tilesPerInch' | 'orientation'>): PageCapacity {
  const orientation = request.orientation ?? (request.cols >= request.rows ? 'landscape' : 'portrait')
  const cols = Number.isFinite(request.cols) ? request.cols : 0
  const rows = Number.isFinite(request.rows) ? request.rows : 0
  const tilesPerInch = Number.isFinite(request.tilesPerInch) ? request.tilesPerInch : 8
  const usableCols = Math.max(0, cols - 2)
  const usableRows = Math.max(0, rows - 2)
  // Keep the physical page controls visible in the estimate. A higher tile
  // density has more cells but spends a little more of them on markers.
  const markerCells = Math.max(1, Math.ceil((usableCols * usableRows) / Math.max(8, tilesPerInch * 12)))
  // Room-like modules have a hard 3×3 minimum and a one-cell buffer, so a
  // five-cell stride is the conservative slot estimate. Styles may choose
  // larger readable rooms during realization and then fail explicitly if
  // those larger footprints do not fit.
  const roomSlots = Math.max(0, Math.floor(usableCols / 5) * Math.floor(usableRows / 5))
  const corridorCells = Math.max(0, usableCols * usableRows - markerCells)
  return {
    cols,
    rows,
    tilesPerInch,
    orientation,
    usableCols,
    usableRows,
    usableCells: usableCols * usableRows,
    roomSlots,
    corridorCells,
    markerCells,
    minimumRoomFootprint: { cols: 3, rows: 3 },
    border: 1,
    buffer: 1,
  }
}

function diagnostic(request: GenerationRequest, code: string, message: string, constraint?: string): GenerationDiagnostic {
  return { stage: 'preflight', code, message, style: request.style, seed: normalizeSeed(request.seed), constraint }
}

export function validateGenerationRequest(request: Partial<GenerationRequest>): GenerationDiagnostic[] {
  const issues: GenerationDiagnostic[] = []
  const raw = request as Partial<GenerationRequest> & Record<string, unknown>
  const style = request.style ?? 'spine-shortcuts'
  const seed = typeof request.seed === 'number' && Number.isFinite(request.seed) ? request.seed >>> 0 : 0
  const add = (code: string, message: string, constraint?: string) => issues.push({ stage: 'input', code, message, style, seed, constraint })
  if (!['spine-shortcuts', 'orbit-gates', 'cavern-pressure'].includes(style)) add('invalid-style', 'Choose Critical Spine, Central Hub, or Branch-and-merge.')
  if (!Number.isInteger(request.cols) || (request.cols ?? 0) < 3) add('invalid-cols', 'Page width must be at least 3 tiles.')
  if (!Number.isInteger(request.rows) || (request.rows ?? 0) < 3) add('invalid-rows', 'Page height must be at least 3 tiles.')
  if (!Number.isFinite(request.tilesPerInch) || ![2, 4, 8].includes(request.tilesPerInch ?? 0)) add('invalid-tile-size', 'Tile size must use 2, 4, or 8 tiles per inch.')
  if (!request.complexity || !['compact', 'standard', 'dense'].includes(request.complexity)) add('invalid-complexity', 'Choose Compact, Standard, or Dense complexity.')
  if (request.playerLevel !== undefined && (!Number.isInteger(request.playerLevel) || request.playerLevel < 1 || request.playerLevel > 10)) add('invalid-player-level', 'Dungeon level must be an integer from 1 to 10.')
  if (request.orientation !== undefined && !['landscape', 'portrait'].includes(request.orientation)) add('invalid-orientation', 'Orientation must be landscape or portrait.')
  if (!Number.isSafeInteger(request.loopCount) || (request.loopCount ?? -1) < 0) add('invalid-loop-count', 'Loop count must be a non-negative integer.')
  if (!isLoopPreference(request.loopPreference)) add('invalid-loop-preference', 'Choose a valid loop preference.')
  if (request.loopChallenges !== undefined) {
    if (!Array.isArray(request.loopChallenges)) add('invalid-loop-challenges', 'Per-loop challenges must be a list.')
    else {
      const loopCount = request.loopCount
      if (Number.isInteger(loopCount) && loopCount !== undefined && loopCount >= 0 && request.loopChallenges.length > loopCount) add('loop-challenge-count-mismatch', 'Per-loop challenge selections cannot exceed the requested loop count.')
      request.loopChallenges.forEach((challenge, index) => {
        if (challenge !== undefined && !isLoopPreference(challenge)) add('invalid-loop-challenge', `Loop ${index + 1} has an invalid challenge selection.`)
      })
    }
  }
  if (typeof request.seed === 'number') {
    if (!Number.isSafeInteger(request.seed)) add('invalid-seed', 'Seed must be an integer or a numeric string.')
  } else if (typeof request.seed === 'string') {
    if (!/^[+-]?\d+$/.test(request.seed.trim())) add('invalid-seed', 'Seed must be an integer or a numeric string.')
  } else add('invalid-seed', 'Seed must be an integer or a numeric string.')
  if ('keyCount' in raw || 'lockCount' in raw) add('independent-key-lock-counts', 'Key and Lock counts are derived from Loop Challenges and cannot be provided independently.')
  return issues
}

export function preflightGeneration(request: GenerationRequest): PreflightResult {
  const inputIssues = validateGenerationRequest(request)
  const budget = createComplexityBudget(request)
  const levelBudget = resolveDungeonLevelBudget(request.playerLevel)
  const capacity = derivePageCapacity(request)
  const diagnostics = [...inputIssues]
  const loopCount = Number.isInteger(request.loopCount) && request.loopCount >= 0 ? request.loopCount : 0
  // Each ordinary cycle expands to two neutral route modules and an objective;
  // dependency-bearing challenges add their own key/gate modules. This keeps
  // the preflight estimate aligned with the minimum spatial realization.
  const estimatedRooms = budget.missionNodes + loopCount * 3 + budget.derivedKeys + budget.derivedLocks
  const estimatedCells = estimatedRooms * 9 + Math.max(0, estimatedRooms - 1) * 5 + budget.supportingSpace + loopCount * 8
  const hasInvalidInput = inputIssues.length > 0
  if (hasInvalidInput) return { status: 'impossible', request, budget, levelBudget, capacity, diagnostics, estimatedRooms, estimatedCells }

  if (capacity.usableCols < 3 || capacity.usableRows < 3) {
    diagnostics.push(diagnostic(request, 'page-too-small', 'The page cannot contain the required 3×3 room footprint inside its one-cell border.', 'minimum room footprint'))
  }
  if (estimatedRooms > capacity.roomSlots) {
    diagnostics.push(diagnostic(request, 'capacity-impossible', `The fixed ${request.complexity} request needs about ${estimatedRooms} readable room anchors, but this page has insufficient buffered capacity.`, 'page capacity'))
  }
  if (loopCount > 0 && capacity.roomSlots < budget.minimumRooms + loopCount) {
    diagnostics.push(diagnostic(request, 'loops-do-not-fit', `Exactly ${loopCount} loop${loopCount === 1 ? '' : 's'} were requested, but the page cannot provide enough distinct cycle anchors.`, 'exact loop count'))
  }
  if (loopCount > budget.missionNodes - 2) {
    diagnostics.push(diagnostic(request, 'loop-grammar-limit', `Exactly ${loopCount} loops were requested, but this ${request.complexity} Mission Grammar has only ${budget.missionNodes - 2} distinct progression windows.`, 'non-trivial cycle contract'))
  }
  const ratio = capacity.usableCells === 0 ? Infinity : estimatedCells / capacity.usableCells
  if (ratio > 1 || diagnostics.some(item => item.code === 'capacity-impossible' || item.code === 'loops-do-not-fit' || item.code === 'loop-grammar-limit' || item.code === 'page-too-small' || item.code === 'locks-without-keys')) {
    return { status: 'impossible', request, budget, levelBudget, capacity, diagnostics, estimatedRooms, estimatedCells }
  }
  if (ratio > 0.6 || loopCount > budget.presetLoopTarget + 1) {
    diagnostics.push(diagnostic(request, 'capacity-warning', 'This fixed request is likely to be dense on the selected page; Generate will try a bounded placement and will not reduce its targets.', 'readability'))
    return { status: 'warning', request, budget, levelBudget, capacity, diagnostics, estimatedRooms, estimatedCells }
  }
  return { status: 'fit', request, budget, levelBudget, capacity, diagnostics, estimatedRooms, estimatedCells }
}

export function createGenerationRequest(input: Partial<GenerationRequest> & Pick<GenerationRequest, 'cols' | 'rows'>): GenerationRequest {
  return {
    style: input.style ?? 'spine-shortcuts',
    seed: input.seed ?? 0,
    cols: input.cols,
    rows: input.rows,
    tilesPerInch: input.tilesPerInch ?? 8,
    orientation: input.orientation ?? (input.cols >= input.rows ? 'landscape' : 'portrait'),
    complexity: input.complexity ?? 'standard',
    loopCount: input.loopCount ?? 0,
    loopPreference: input.loopPreference ?? 'varied',
    playerLevel: input.playerLevel ?? 1,
    ...(input.loopChallenges ? { loopChallenges: input.loopChallenges } : {}),
    ...(input.availableStampTypes ? { availableStampTypes: input.availableStampTypes } : {}),
  }
}
