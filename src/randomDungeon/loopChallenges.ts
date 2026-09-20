import type { GenerationRequest, LoopChallenge, LoopPreference } from './missionTypes'

export const ALL_LOOP_CHALLENGES: readonly LoopChallenge[] = [
  'alternate-paths', 'hidden-shortcut', 'dramatic-arc', 'dangerous-route', 'lock-and-key',
  'unknown-return', 'patrolled-cycle', 'gambit', 'hub-and-spoke', 'double-lock',
]

export const LOOP_CHALLENGE_DESCRIPTIONS: Readonly<Record<LoopPreference, string>> = {
  varied: 'Choose a challenge from the seeded random selection. The result stays reproducible for the same map seed.',
  'alternate-paths': 'Keep two readable routes between the same anchor and objective, with neither route given a special drawback.',
  'hidden-shortcut': 'Make one route secret and shorter, while the public route takes longer to reach the objective.',
  'dramatic-arc': 'Block one route with a visible obstacle before the objective; the other route remains open.',
  'dangerous-route': 'Mark one route as dangerous and leave the alternate route as the safer way through.',
  'lock-and-key': 'Lock one loop branch and place its matching key on the other open route.',
  'unknown-return': 'Lock the objective, then add a one-way bypass to its key and a return route before the objective is revisited.',
  'patrolled-cycle': 'Make both routes dangerous, as if a powerful encounter patrols the entire cycle.',
  gambit: 'Offer a shorter dangerous route alongside a longer route that is safer.',
  'hub-and-spoke': 'Organize the loop around a central hub with explicit spoke connections to the surrounding rooms.',
  'double-lock': 'Put two distinct locks on the objective, each requiring its own matching key.',
}

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

export function formatLoopChallenge(challenge: LoopChallenge): string {
  return challenge.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
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
