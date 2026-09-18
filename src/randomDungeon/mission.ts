import { createComplexityBudget } from './preflight'
import { ALL_LOOP_CHALLENGES } from './loopChallenges'
import type { CycleRoles, GenerationDiagnostic, GenerationRequest, LoopChallenge, Mission, MissionCycle, MissionEdge, MissionNode, MissionSummary } from './missionTypes'

const edge = (id: string, from: string, to: string, kind: MissionEdge['kind'] = 'progression', extra: Partial<MissionEdge> = {}): MissionEdge => ({ id, from, to, kind, coupling: kind === 'progression' ? 'tight' : 'loose', ...extra })

function node(id: string, kind: MissionNode['kind'], patternId: string, label: string, extra: Partial<MissionNode> = {}): MissionNode {
  return { id, kind, patternId, label, ...extra }
}

export interface LoopChallengeContract {
  challenge: LoopChallenge
  requiredRoles: Array<keyof CycleRoles>
  realization: string
  rewrite: (mission: Mission, cycle: MissionCycle) => void
}

function cycleEdges(mission: Mission, cycle: MissionCycle): MissionEdge[] {
  return cycle.routeEdgeIds.map(id => mission.edges.find(candidate => candidate.id === id)).filter((candidate): candidate is MissionEdge => Boolean(candidate))
}

function removeEdges(mission: Mission, ids: readonly string[]): void {
  const remove = new Set(ids)
  mission.edges = mission.edges.filter(candidate => !remove.has(candidate.id))
}

function addKey(mission: Mission, cycle: MissionCycle, keyId: string, holder: string, optional = false, includeAccess = true): string {
  const nodeId = `key-node-${keyId}`
  if (!mission.nodes.some(candidate => candidate.id === nodeId)) mission.nodes.push(node(nodeId, 'key', `loop-${cycle.id}`, `Key ${keyId}`, { keyId, optional }))
  if (!mission.keys.some(candidate => candidate.id === keyId)) mission.keys.push({ id: keyId, nodeId, lockIds: [], optional })
  const edgeId = `key-access-${cycle.id}-${keyId}`
  if (includeAccess && !mission.edges.some(candidate => candidate.id === edgeId)) mission.edges.push(edge(edgeId, holder, nodeId, 'optional', { coupling: 'loose' }))
  cycle.roles.keyNode = nodeId
  return nodeId
}

function addLock(mission: Mission, cycle: MissionCycle, keyId: string, nodeId: string, suffix = ''): string {
  const lockId = `lock-${cycle.id}${suffix}`
  if (!mission.locks.some(candidate => candidate.id === lockId)) mission.locks.push({ id: lockId, nodeId, keyId, optional: false })
  const key = mission.keys.find(candidate => candidate.id === keyId)
  if (key && !key.lockIds.includes(lockId)) key.lockIds.push(lockId)
  return lockId
}

function addRequiredKeyLock(mission: Mission, cycle: MissionCycle, holder: string, suffix = '', includeKeyAccess = true): { keyId: string; keyNodeId: string; lockId: string } {
  const keyId = `key-${cycle.id}${suffix}`
  const keyNodeId = addKey(mission, cycle, keyId, holder, false, includeKeyAccess)
  const lockId = addLock(mission, cycle, keyId, cycle.roles.objectiveNode, suffix)
  return { keyId, keyNodeId, lockId }
}

function replaceEdge(mission: Mission, id: string, replacements: MissionEdge[]): void {
  const index = mission.edges.findIndex(candidate => candidate.id === id)
  if (index < 0) mission.edges.push(...replacements)
  else mission.edges.splice(index, 1, ...replacements)
}

function makeContract(challenge: LoopChallenge): LoopChallengeContract {
  const base = {
    challenge,
    requiredRoles: ['anchorNode', 'challengeNode', 'objectiveNode'] as Array<keyof CycleRoles>,
  }
  const contracts: Record<LoopChallenge, LoopChallengeContract> = {
    'alternate-paths': { ...base, realization: 'two readable traversable routes', rewrite: () => {} },
    'hidden-shortcut': { ...base, realization: 'secret connection', rewrite: (mission, cycle) => { const route = cycleEdges(mission, cycle); if (route[0]) route[0].secret = true } },
    'dramatic-arc': { ...base, realization: 'visible obstacle before the objective', rewrite: (mission, cycle) => { const route = cycleEdges(mission, cycle); const last = route[route.length - 1]; if (last) { last.blocked = true; last.visibleObstacle = true } } },
    'dangerous-route': { ...base, realization: 'dangerous challenge route', rewrite: (mission, cycle) => { const route = cycleEdges(mission, cycle); if (route[0]) route[0].dangerous = true } },
    'lock-and-key': { ...base, realization: 'locked objective and Goal with matching key', rewrite: (mission, cycle) => {
      const dependency = addRequiredKeyLock(mission, cycle, cycle.roles.anchorNode)
      const route = cycleEdges(mission, cycle)
      // Both routes approach the same objective room, so both objective
      // apertures carry the required lock. The key is available from the
      // anchor before either route is attempted; removing the detour would
      // turn the challenge into a dead end rather than a loop.
      for (const candidate of route.filter(edgeCandidate => edgeCandidate.to === cycle.roles.objectiveNode)) candidate.lockId = dependency.lockId
      // The selected Key & Lock challenge also marks the main Goal entrance.
      // Reuse one lock across multiple guarded entrances; when another loop
      // already guards the Goal, keep its existing dependency instead.
      const goalEntries = mission.edges.filter(candidate => candidate.to === mission.goalNodeId)
      if (!goalEntries.some(candidate => candidate.lockId)) for (const entry of goalEntries) entry.lockId = dependency.lockId
    } },
    'unknown-return': { ...base, realization: 'required locked goal, one-way valve, key room, and return route', rewrite: (mission, cycle) => {
      const dependency = addRequiredKeyLock(mission, cycle, cycle.roles.challengeNode, '', false)
      const lockEdge = mission.edges.find(candidate => candidate.from === cycle.roles.challengeNode && candidate.to === cycle.roles.objectiveNode)
      if (lockEdge) lockEdge.lockId = dependency.lockId
      for (const entry of mission.edges.filter(e => e.to === cycle.roles.objectiveNode)) entry.lockId = dependency.lockId
      const valve = edge(`unknown-return-valve-${cycle.id}`, cycle.roles.challengeNode, dependency.keyNodeId, 'return', { oneWay: true })
      const returnEdge = edge(`unknown-return-back-${cycle.id}`, dependency.keyNodeId, cycle.roles.anchorNode, 'return')
      mission.edges.push(valve, returnEdge)
      cycle.routeB = [cycle.roles.anchorNode, cycle.roles.challengeNode, dependency.keyNodeId, cycle.roles.anchorNode]
      cycle.routeEdgeIds = [...cycle.routeEdgeIds, valve.id, returnEdge.id]
    } },
    'patrolled-cycle': { ...base, realization: 'danger metadata on both routes', rewrite: (mission, cycle) => { for (const route of cycleEdges(mission, cycle)) route.dangerous = true } },
    'gambit': { ...base, realization: 'dangerous short route and safer return route', rewrite: (mission, cycle) => { const route = cycleEdges(mission, cycle); if (route[0]) route[0].dangerous = true } },
    'hub-and-spoke': { ...base, realization: 'explicit hub and spoke connections', rewrite: (mission, cycle) => {
      const hub = mission.nodes.find(candidate => candidate.id === cycle.roles.anchorNode)
      if (hub) hub.kind = 'hub'
      removeEdges(mission, cycle.routeEdgeIds)
      const destinations = [...new Set([...cycle.routeA, ...cycle.routeB])].filter(id => id !== cycle.roles.anchorNode)
      const spokes = destinations.map(target => edge(`spoke-${cycle.id}-${target}`, cycle.roles.anchorNode, target, 'cycle-route'))
      mission.edges.push(...spokes)
      cycle.routeA = [cycle.roles.anchorNode, cycle.roles.challengeNode]
      cycle.routeB = [cycle.roles.anchorNode, cycle.roles.objectiveNode]
      cycle.routeEdgeIds = spokes.map(candidate => candidate.id)
      // Hub-and-Spoke is a deliberate hub realization rather than a pair of
      // corridor alternatives. It remains a valid selected Loop Challenge;
      // its contract is checked by the explicit spoke set below.
      cycle.nonTrivial = true
    } },
    'double-lock': { ...base, realization: 'two distinct locks on one objective', rewrite: (mission, cycle) => {
      const first = addRequiredKeyLock(mission, cycle, cycle.roles.anchorNode, '')
      const secondKeyId = `key-${cycle.id}-2`
      addKey(mission, cycle, secondKeyId, cycle.roles.challengeNode)
      const gateOneId = `lock-node-${cycle.id}-1`
      const gateTwoId = `lock-node-${cycle.id}-2`
      if (!mission.nodes.some(candidate => candidate.id === gateOneId)) mission.nodes.push(node(gateOneId, 'lock', `loop-${cycle.id}`, `Lock ${first.lockId}`, { lockId: first.lockId }))
      if (!mission.nodes.some(candidate => candidate.id === gateTwoId)) mission.nodes.push(node(gateTwoId, 'lock', `loop-${cycle.id}`, `Lock ${cycle.id}-2`, { lockId: `lock-${cycle.id}-2` }))
      const secondLockId = addLock(mission, cycle, secondKeyId, gateTwoId, '-2')
      const route = cycleEdges(mission, cycle)
      const final = route[route.length - 1]
      if (final) {
        const firstGate = edge(`${final.id}-gate-1`, final.from, gateOneId, final.kind, { coupling: final.coupling })
        const secondGate = edge(`${final.id}-gate-2`, gateOneId, gateTwoId, final.kind, { coupling: final.coupling, lockId: first.lockId })
        const objective = edge(`${final.id}-objective`, gateTwoId, final.to, final.kind, { coupling: final.coupling, lockId: secondLockId })
        replaceEdge(mission, final.id, [firstGate, secondGate, objective])
        const routeIndex = cycle.routeEdgeIds.indexOf(final.id)
        if (routeIndex >= 0) cycle.routeEdgeIds.splice(routeIndex, 1, firstGate.id, secondGate.id, objective.id)
      }
      // Both approaches merge before the two serial gates. Neither entrance
      // may reach the objective without collecting both keys.
      for (const entry of mission.edges.filter(e => e.to === cycle.roles.objectiveNode && e.from !== gateTwoId)) entry.to = gateOneId
      const detour = cycle.routeB[1]!
      cycle.routeA = [cycle.roles.anchorNode, cycle.roles.challengeNode, gateOneId, gateTwoId, cycle.roles.objectiveNode]
      cycle.routeB = [cycle.roles.anchorNode, detour, gateOneId, gateTwoId, cycle.roles.objectiveNode]

    } },
  }
  return contracts[challenge]
}

export const LOOP_CHALLENGE_CONTRACTS: Readonly<Record<LoopChallenge, LoopChallengeContract>> = Object.fromEntries(ALL_LOOP_CHALLENGES.map(challenge => [challenge, makeContract(challenge)])) as Record<LoopChallenge, LoopChallengeContract>

export function applyLoopChallenge(mission: Mission, cycle: MissionCycle, challenge = cycle.challenge): Mission {
  cycle.challenge = challenge
  LOOP_CHALLENGE_CONTRACTS[challenge].rewrite(mission, cycle)
  return mission
}

export function validateLoopChallengeContract(mission: Mission, cycle: MissionCycle): GenerationDiagnostic[] {
  const contract = LOOP_CHALLENGE_CONTRACTS[cycle.challenge]
  const diagnostics: GenerationDiagnostic[] = []
  for (const role of contract.requiredRoles) if (!cycle.roles[role]) diagnostics.push({ stage: 'mission', code: 'missing-loop-role', message: `${cycle.challenge} requires ${role}.`, style: mission.style, seed: mission.seed, nodeId: cycle.id, constraint: 'loop challenge roles' })
  if (cycle.challenge !== 'hub-and-spoke' && (!cycle.nonTrivial || new Set(cycle.routeA).size < 3 || new Set(cycle.routeB).size < 3)) diagnostics.push({ stage: 'mission', code: 'trivial-cycle', message: `Cycle ${cycle.id} does not contain two distinct non-trivial routes.`, style: mission.style, seed: mission.seed, nodeId: cycle.id, constraint: 'non-trivial cycle' })
  if (cycle.challenge === 'unknown-return' && !mission.locks.some(lock => lock.nodeId === cycle.roles.objectiveNode && !lock.optional)) diagnostics.push({ stage: 'mission', code: 'unknown-return-missing-lock', message: `${cycle.id} must lock its Goal before the return route.`, style: mission.style, seed: mission.seed, nodeId: cycle.id, constraint: 'Unknown Return progression' })
  return diagnostics
}

function addBranches(mission: Mission, spine: string[], count: number, style: Mission['style'], keepGoalAsLoopObjective = false): void {
  for (let index = 0; index < count; index++) {
    const id = `branch-${index + 1}`
    // Keep the first progression anchor open for a Loop Challenge shortcut.
    // Branches still attach to the spine, but do not consume every aperture
    // around the node where the first explicit cycle originates.
    const branchOffset = style === 'spine-shortcuts' ? 4 : style === 'orbit-gates' ? 0 : 1
    // When the one loop converges on Goal, keep optional branches from adding
    // a third route that bypasses the loop's challenge and detour.
    const lastBranchSpineIndex = spine.length - (keepGoalAsLoopObjective ? 3 : 2)
    const branchSpineIndex = Math.min(lastBranchSpineIndex, index + branchOffset)
    const from = spine[branchSpineIndex]!
    const to = spine[branchSpineIndex + 1]!
    mission.nodes.push(node(id, 'branch', 'progression', `Branch ${index + 1}`))
    mission.patterns[1]!.expandsTo.push(id)
    mission.edges.push(edge(`branch-${index + 1}-out`, from, id, 'optional'), edge(`branch-${index + 1}-return`, id, to, 'optional'))
  }
}

export function createMission(request: GenerationRequest, budget = createComplexityBudget(request)): Mission {
  const seed = budget.seed
  const diagnostics: GenerationDiagnostic[] = []
  const mission: Mission = { id: `mission-${seed}`, seed, style: request.style, patterns: [], nodes: [], edges: [], keys: [], locks: [], cycles: [], goalNodeId: 'goal', diagnostics }
  mission.patterns.push({ id: 'opening', kind: 'opening', expandsTo: ['start'] })
  mission.patterns.push({ id: 'progression', kind: 'progression', expandsTo: [] })
  mission.patterns.push({ id: 'goal-pattern', kind: 'goal', expandsTo: ['goal'] })
  mission.nodes.push(node('start', 'start', 'opening', 'Start'))
  const taskCount = Math.max(1, budget.missionNodes - 2 - budget.branches)
  const tasks = Array.from({ length: taskCount }, (_, index) => `task-${index + 1}`)
  for (const [index, id] of tasks.entries()) {
    mission.nodes.push(node(id, 'task', 'progression', `Task ${index + 1}`))
    mission.patterns[1]!.expandsTo.push(id)
  }
  mission.nodes.push(node('goal', 'goal', 'goal-pattern', 'Goal'))
  const spine = ['start', ...tasks, 'goal']
  for (let index = 0; index < spine.length - 1; index++) mission.edges.push(edge(`progression-${index + 1}`, spine[index]!, spine[index + 1]!))
  const singleLoop = budget.requestedLoops === 1
  addBranches(mission, spine, budget.branches, request.style, singleLoop)

  for (let index = 0; index < budget.requestedLoops; index++) {
    const selected = budget.loopChallenges[index]!
    if (selected === 'unknown-return' && index === 0) {
      const approach = tasks[tasks.length - 1]!
      const routeEdges = spine.slice(0, -1).map((_, edgeIndex) => mission.edges.find(candidate => candidate.id === `progression-${edgeIndex + 1}`)!).filter(Boolean)
      const cycle: MissionCycle = { id: `cycle-${index + 1}`, routeA: [...spine], routeB: ['start', approach], roles: { anchorNode: 'start', challengeNode: approach, objectiveNode: 'goal' }, challenge: selected, routeEdgeIds: routeEdges.map(candidate => candidate.id), nonTrivial: true }
      mission.cycles.push(cycle)
      applyLoopChallenge(mission, cycle)
      const lock = mission.locks.find(candidate => candidate.nodeId === 'goal')
      const lockedSpineEdge = mission.edges.find(candidate => candidate.from === approach && candidate.to === 'goal')
      if (lock && lockedSpineEdge) lockedSpineEdge.lockId = lock.id
      continue
    }
    const anchor = singleLoop ? tasks[tasks.length - 1]! : request.style === 'orbit-gates' ? 'start' : spine[1 + (index % Math.max(1, tasks.length - 1))] ?? 'start'
    const challengeNode = `loop-${index + 1}-challenge`
    const detourNode = `loop-${index + 1}-detour`
    const objectiveNode = singleLoop ? mission.goalNodeId : `loop-${index + 1}-objective`
    mission.nodes.push(node(challengeNode, 'challenge', `loop-${index + 1}`, `Loop ${index + 1} Challenge`), node(detourNode, 'challenge', `loop-${index + 1}`, `Loop ${index + 1} Detour`))
    if (!singleLoop) mission.nodes.push(node(objectiveNode, 'reward', `loop-${index + 1}`, `Loop ${index + 1} Objective`))
    else mission.edges = mission.edges.filter(candidate => !(candidate.from === anchor && candidate.to === mission.goalNodeId && candidate.kind === 'progression'))
    const a1 = edge(`cycle-${index + 1}-a1`, anchor, challengeNode, 'cycle-route')
    const a2 = edge(`cycle-${index + 1}-a2`, challengeNode, objectiveNode, 'cycle-route')
    const b1 = edge(`cycle-${index + 1}-b1`, anchor, detourNode, 'cycle-route')
    const b2 = edge(`cycle-${index + 1}-b2`, detourNode, objectiveNode, 'cycle-route')
    mission.edges.push(a1, a2, b1, b2)
    const cycle: MissionCycle = { id: `cycle-${index + 1}`, routeA: [anchor, challengeNode, objectiveNode], routeB: [anchor, detourNode, objectiveNode], roles: { anchorNode: anchor, challengeNode, objectiveNode }, challenge: selected, routeEdgeIds: [a1.id, a2.id, b1.id, b2.id], nonTrivial: true }
    mission.cycles.push(cycle)
    applyLoopChallenge(mission, cycle)
  }
  mission.diagnostics.push(...mission.cycles.flatMap(cycle => validateLoopChallengeContract(mission, cycle)))
  return mission
}

export function summarizeMission(mission: Mission): MissionSummary {
  return {
    patterns: mission.patterns.length,
    nodes: mission.nodes.length,
    keys: mission.keys.length,
    locks: mission.locks.length,
    cycles: mission.cycles.length,
    loopChallenges: mission.cycles.map(cycle => ({ cycleId: cycle.id, challenge: cycle.challenge, realization: LOOP_CHALLENGE_CONTRACTS[cycle.challenge].realization })),
    pairings: mission.keys.map(key => ({ keyId: key.id, lockIds: [...key.lockIds] })),
  }
}

export function validateCompleteStyleContract(request: GenerationRequest, availableSemantics: readonly string[] = ['key', 'lock', 'secret', 'danger', 'blocked-return', 'one-way']): GenerationDiagnostic[] {
  const required = ['key', 'lock', 'secret', 'danger', 'blocked-return']
  return required.filter(semantic => !availableSemantics.includes(semantic)).map(semantic => ({ stage: 'mission' as const, code: 'incomplete-style-contract', message: `${request.style} cannot realize required semantic type ${semantic}.`, style: request.style, seed: typeof request.seed === 'number' ? request.seed >>> 0 : 0, constraint: 'Generation Style contract' }))
}
