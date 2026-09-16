import type { GenerationRequest, LoopChallenge, LoopPreference } from './missionTypes'

export const ALL_LOOP_CHALLENGES: readonly LoopChallenge[] = [
  'alternate-paths', 'hidden-shortcut', 'dramatic-arc', 'dangerous-route', 'lock-and-key',
  'unknown-return', 'patrolled-cycle', 'gambit', 'hub-and-spoke', 'double-lock',
]

const validPreferences = new Set<LoopPreference>(['varied', ...ALL_LOOP_CHALLENGES])

function hash(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  return value >>> 0
}

export function isLoopPreference(value: unknown): value is LoopPreference {
  return typeof value === 'string' && validPreferences.has(value as LoopPreference)
}

export function selectLoopChallenge(seed: number, index: number, preference: LoopPreference, explicit?: LoopPreference): LoopChallenge {
  const selection = explicit ?? preference
  if (selection !== 'varied') return selection
  return ALL_LOOP_CHALLENGES[hash(seed, index) % ALL_LOOP_CHALLENGES.length]!
}

export function resolveLoopChallenges(request: Pick<GenerationRequest, 'seed' | 'loopCount' | 'loopPreference' | 'loopChallenges'>): LoopChallenge[] {
  const seed = typeof request.seed === 'number' && Number.isFinite(request.seed) ? request.seed >>> 0 : 0
  const count = Number.isInteger(request.loopCount) && request.loopCount >= 0 ? request.loopCount : 0
  return Array.from({ length: count }, (_, index) => selectLoopChallenge(seed, index, request.loopPreference, request.loopChallenges?.[index]))
}

export function dependencyCounts(challenges: readonly LoopChallenge[]): { keys: number; locks: number } {
  return challenges.reduce((counts, challenge) => {
    if (challenge === 'lock-and-key' || challenge === 'unknown-return') {
      counts.keys += 1
      counts.locks += 1
    } else if (challenge === 'double-lock') {
      counts.keys += 2
      counts.locks += 2
    }
    return counts
  }, { keys: 0, locks: 0 })
}
