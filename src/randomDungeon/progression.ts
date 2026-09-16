import type { GenerationDiagnostic, Mission } from './missionTypes'

export interface ProgressionResult {
  solvable: boolean
  goalReachable: boolean
  reachableNodes: string[]
  collectedKeys: string[]
  openedLocks: string[]
  diagnostics: GenerationDiagnostic[]
}

export function validateProgression(mission: Mission): ProgressionResult {
  const reachable = new Set<string>(['start'])
  const keys = new Set<string>()
  const locks = new Set<string>()
  const diagnostics: GenerationDiagnostic[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const key of mission.keys) if (reachable.has(key.nodeId) && !keys.has(key.id)) { keys.add(key.id); changed = true }
    for (const lock of mission.locks) if (keys.has(lock.keyId) && !locks.has(lock.id)) { locks.add(lock.id); changed = true }
    for (const route of mission.edges) {
      if (route.blocked) continue
      const edgeLock = route.lockId ? mission.locks.find(lock => lock.id === route.lockId) : undefined
      // Optional locks gate optional content only. They must not turn a
      // missing optional dependency into a false Goal-unreachable result.
      if (route.lockId && (!edgeLock || (!edgeLock.optional && !locks.has(route.lockId)))) continue
      if (reachable.has(route.from) && !reachable.has(route.to)) { reachable.add(route.to); changed = true }
      // Static one-way metadata describes the forward relationship only. The
      // graph is not mutated to simulate a door opening or a player action.
    }
  }
  const goalReachable = reachable.has(mission.goalNodeId)
  if (!goalReachable) diagnostics.push({ stage: 'validation', code: 'goal-unreachable', message: 'The Goal is not reachable after iterative Key acquisition.', style: mission.style, seed: mission.seed, constraint: 'progression validation' })
  for (const lock of mission.locks) if (!keys.has(lock.keyId) && !lock.optional) diagnostics.push({ stage: 'validation', code: 'required-key-unreachable', message: `Required ${lock.id} has no reachable ${lock.keyId}.`, style: mission.style, seed: mission.seed, nodeId: lock.nodeId, constraint: 'Key/Lock dependency' })
  return { solvable: goalReachable && diagnostics.length === 0, goalReachable, reachableNodes: [...reachable], collectedKeys: [...keys], openedLocks: [...locks], diagnostics }
}
