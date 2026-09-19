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

function routeEdges(mission: Mission, cycle: MissionCycle, route: readonly string[]): MissionEdge[] {
  return cycle.routeEdgeIds.flatMap(id => {
    const candidate = mission.edges.find(edge => edge.id === id)
    return candidate && route.some((nodeId, index) => index < route.length - 1 && candidate.from === nodeId && candidate.to === route[index + 1]) ? [candidate] : []
  })
}

function addKeyAtNode(mission: Mission, cycle: MissionCycle, keyId: string, nodeId: string, optional = false): string {
  const holder = mission.nodes.find(candidate => candidate.id === nodeId)
  if (holder) holder.keyId = keyId
  if (!mission.keys.some(candidate => candidate.id === keyId)) mission.keys.push({ id: keyId, nodeId, lockIds: [], optional })
  cycle.roles.keyNode = nodeId
  return nodeId
}

function addKey(mission: Mission, cycle: MissionCycle, keyId: string, holder: string, optional = false, includeAccess = true): string {
  const nodeId = `key-node-${keyId}`
  if (!mission.nodes.some(candidate => candidate.id === nodeId)) mission.nodes.push(node(nodeId, 'key', `loop-${cycle.id}`, `Key ${keyId}`, { keyId, optional }))
  addKeyAtNode(mission, cycle, keyId, nodeId, optional)
  const edgeId = `key-access-${cycle.id}-${keyId}`
  if (includeAccess && !mission.edges.some(candidate => candidate.id === edgeId)) mission.edges.push(edge(edgeId, holder, nodeId, 'optional', { coupling: 'loose' }))
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
    requiredRoles: ['anchorNode', 'routeANode', 'routeBNode', 'objectiveNode'] as Array<keyof CycleRoles>,
  }
  const contracts: Record<LoopChallenge, LoopChallengeContract> = {
    'alternate-paths': { ...base, realization: 'two readable traversable routes', rewrite: () => {} },
    'hidden-shortcut': { ...base, realization: 'one secret route', rewrite: (mission, cycle) => { const route = routeEdges(mission, cycle, cycle.routeA); if (route[0]) route[0].secret = true } },
    'dramatic-arc': { ...base, realization: 'visible obstacle before the objective on one route', rewrite: (mission, cycle) => { const route = routeEdges(mission, cycle, cycle.routeA); const last = route[route.length - 1]; if (last) { last.blocked = true; last.visibleObstacle = true } } },
    'dangerous-route': { ...base, realization: 'one dangerous route', rewrite: (mission, cycle) => { const route = routeEdges(mission, cycle, cycle.routeA); if (route[0]) route[0].dangerous = true } },
    'lock-and-key': { ...base, realization: 'locked loop branch with its matching key on the open route', rewrite: (mission, cycle) => {
      const keyId = `key-${cycle.id}`
      addKeyAtNode(mission, cycle, keyId, cycle.roles.routeBNode)
      const lockId = addLock(mission, cycle, keyId, cycle.roles.routeANode)
      // Present the lock at the loop's choice point. The other departure
      // remains open and carries the key, so exploration can continue around
      // the cycle without revisiting any previously entered room.
      const lockedDeparture = routeEdges(mission, cycle, cycle.routeA)[0]
      if (lockedDeparture) lockedDeparture.lockId = lockId
    } },
    'unknown-return': { ...base, realization: 'required locked goal, one-way valve, key room, and return route', rewrite: (mission, cycle) => {
      const routeAApproach = cycle.routeA[cycle.routeA.length - 2]!
      const dependency = addRequiredKeyLock(mission, cycle, routeAApproach, '', false)
      const lockEdge = mission.edges.find(candidate => candidate.from === routeAApproach && candidate.to === cycle.roles.objectiveNode)
      if (lockEdge) lockEdge.lockId = dependency.lockId
      for (const entry of mission.edges.filter(e => e.to === cycle.roles.objectiveNode)) entry.lockId = dependency.lockId
      const valve = edge(`unknown-return-valve-${cycle.id}`, routeAApproach, dependency.keyNodeId, 'return', { oneWay: true })
      const returnEdge = edge(`unknown-return-back-${cycle.id}`, dependency.keyNodeId, cycle.roles.anchorNode, 'return')
      mission.edges.push(valve, returnEdge)
      cycle.routeEdgeIds = [...cycle.routeEdgeIds, valve.id, returnEdge.id]
    } },
    'patrolled-cycle': { ...base, realization: 'danger metadata on both routes', rewrite: (mission, cycle) => { for (const route of cycleEdges(mission, cycle)) route.dangerous = true } },
    'gambit': { ...base, realization: 'dangerous short route and longer safer route', rewrite: (mission, cycle) => {
      const shortRoute = routeEdges(mission, cycle, cycle.routeA)
      if (shortRoute[0]) shortRoute[0].dangerous = true
      const safeRoute = routeEdges(mission, cycle, cycle.routeB)
      const safeFinal = safeRoute[safeRoute.length - 1]
      if (!safeFinal) return
      const additionalNodeCount = Math.max(1, cycle.routeA.length - cycle.routeB.length + 1)
      const safeNodeIds = Array.from({ length: additionalNodeCount }, (_, nodeIndex) => {
        const suffix = nodeIndex === 0 ? '' : `-${nodeIndex + 1}`
        const id = `gambit-${cycle.id}-safe-route${suffix}`
        mission.nodes.push(node(id, 'challenge', `loop-${cycle.id}`, `Loop ${cycle.id} Safe Route ${nodeIndex + 1}`))
        return id
      })
      const safeRouteNodes = [safeFinal.from, ...safeNodeIds, safeFinal.to]
      const replacements = safeRouteNodes.slice(0, -1).map((from, nodeIndex) => edge(`${safeFinal.id}-safe-${nodeIndex + 1}`, from, safeRouteNodes[nodeIndex + 1]!, safeFinal.kind, { coupling: safeFinal.coupling }))
      replaceEdge(mission, safeFinal.id, replacements)
      const routeIndex = cycle.routeEdgeIds.indexOf(safeFinal.id)
      if (routeIndex >= 0) cycle.routeEdgeIds.splice(routeIndex, 1, ...replacements.map(candidate => candidate.id))
      cycle.routeB = [...cycle.routeB.slice(0, -1), ...safeNodeIds, cycle.roles.objectiveNode]
    } },
    'hub-and-spoke': { ...base, realization: 'explicit hub and spoke connections', rewrite: (mission, cycle) => {
      const hub = mission.nodes.find(candidate => candidate.id === cycle.roles.anchorNode)
      if (hub) hub.kind = 'hub'
      // Preserve the two return routes. Turning them into unrelated spokes
      // erased the requested loop, especially in Critical Spine and
      // Branch-and-merge. The hub typed anchor makes the two departures
      // declared spokes when space is realized.
      cycle.nonTrivial = true
    } },
    'double-lock': { ...base, realization: 'two distinct locks on one objective', rewrite: (mission, cycle) => {
      const first = addRequiredKeyLock(mission, cycle, mission.style === 'orbit-gates' ? cycle.roles.routeANode : cycle.roles.anchorNode, '')
      const secondKeyId = `key-${cycle.id}-2`
      addKey(mission, cycle, secondKeyId, cycle.roles.routeANode)
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
      const routeBNode = cycle.routeB[1]!
      cycle.routeA = [cycle.roles.anchorNode, cycle.roles.routeANode, gateOneId, gateTwoId, cycle.roles.objectiveNode]
      cycle.routeB = [cycle.roles.anchorNode, routeBNode, gateOneId, gateTwoId, cycle.roles.objectiveNode]

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

export function createMission(request: GenerationRequest, budget = createComplexityBudget(request)): Mission {
  const seed = budget.seed
  const diagnostics: GenerationDiagnostic[] = []
  const mission: Mission = { id: `mission-${seed}`, seed, style: request.style, patterns: [], nodes: [], edges: [], keys: [], locks: [], cycles: [], goalNodeId: 'goal', diagnostics }
  mission.patterns.push({ id: 'opening', kind: 'opening', expandsTo: ['start'] })
  mission.patterns.push({ id: 'progression', kind: 'progression', expandsTo: [] })
  mission.patterns.push({ id: 'goal-pattern', kind: 'goal', expandsTo: ['goal'] })
  mission.nodes.push(node('start', 'start', 'opening', 'Start'))
  // The styles describe the connection grammar, not a bonus set of bypasses.
  // Keep every budgeted mission node in the base graph so that zero-loop
  // Critical Spine maps remain a literal linear sequence of rooms.
  const taskCount = Math.max(1, budget.missionNodes - 2)
  const tasks = Array.from({ length: taskCount }, (_, index) => `task-${index + 1}`)
  for (const [index, id] of tasks.entries()) {
    mission.nodes.push(node(id, 'task', 'progression', `Task ${index + 1}`))
    mission.patterns[1]!.expandsTo.push(id)
  }
  mission.nodes.push(node('goal', 'goal', 'goal-pattern', 'Goal'))
  const spine = ['start', ...tasks, 'goal']
  if (request.style === 'orbit-gates') {
    // Central Hub starts with a set of spokes. Loops are added below as
    // independent routes that leave the hub and return to it. Once loops
    // exist, their rooms form the radial regions; keeping every task as an
    // extra direct spoke would exhaust the hub's readable apertures.
    const targets = budget.requestedLoops === 0 ? [...tasks, mission.goalNodeId] : [mission.goalNodeId]
    for (const target of targets) mission.edges.push(edge(`spoke-${target}`, 'start', target))
  } else {
    for (let index = 0; index < spine.length - 1; index++) mission.edges.push(edge(`progression-${index + 1}`, spine[index]!, spine[index + 1]!))
  }
  const singleSpineLoop = request.style === 'spine-shortcuts' && budget.requestedLoops === 1

  for (let index = 0; index < budget.requestedLoops; index++) {
    const selected = budget.loopChallenges[index]!
    const isSpineReturn = request.style === 'spine-shortcuts' && budget.requestedLoops > 1
    // A Spine loop returns to a later non-Goal spine room. Central Hub loops
    // always leave and return to Start. Cavern loops remain independent but
    // take their anchors in order along the backbone.
    const anchor = request.style === 'orbit-gates' || singleSpineLoop
      ? 'start'
      : spine[1 + (index % Math.max(1, tasks.length - 1))] ?? 'start'
    const routeANode = `loop-${index + 1}-route-a`
    const routeBNode = `loop-${index + 1}-route-b`
    const objectiveNode = singleSpineLoop
      ? mission.goalNodeId
      : isSpineReturn
        ? spine[2 + (index % Math.max(1, tasks.length - 1))]!
        : `loop-${index + 1}-objective`
    mission.nodes.push(node(routeANode, 'challenge', `loop-${index + 1}`, `Loop ${index + 1} Route A`), node(routeBNode, 'challenge', `loop-${index + 1}`, `Loop ${index + 1} Route B`))
    if (!singleSpineLoop && !isSpineReturn) mission.nodes.push(node(objectiveNode, 'reward', `loop-${index + 1}`, `Loop ${index + 1} Objective`))
    const orbitTasks = request.style === 'orbit-gates'
      ? tasks.slice(Math.floor(index * tasks.length / budget.requestedLoops), Math.floor((index + 1) * tasks.length / budget.requestedLoops))
      : []
    const routeA = singleSpineLoop
      ? [anchor, routeANode, ...tasks.slice(0, Math.ceil(tasks.length / 2)), objectiveNode]
      : request.style === 'orbit-gates'
        ? [anchor, routeANode, ...orbitTasks.slice(0, Math.ceil(orbitTasks.length / 2)), objectiveNode]
        : [anchor, routeANode, objectiveNode]
    const routeB = singleSpineLoop
      ? [anchor, routeBNode, ...tasks.slice(Math.ceil(tasks.length / 2)), objectiveNode]
      : request.style === 'orbit-gates'
        ? [anchor, routeBNode, ...orbitTasks.slice(Math.ceil(orbitTasks.length / 2)), objectiveNode]
        : [anchor, routeBNode, objectiveNode]
    if (singleSpineLoop) mission.edges = mission.edges.filter(candidate => candidate.kind !== 'progression')
    const addRoute = (route: string[], prefix: 'a' | 'b') => route.slice(0, -1).map((from, routeIndex) => edge(`cycle-${index + 1}-${prefix}${routeIndex + 1}`, from, route[routeIndex + 1]!, 'cycle-route'))
    const routeAEdges = addRoute(routeA, 'a')
    const routeBEdges = addRoute(routeB, 'b')
    mission.edges.push(...routeAEdges, ...routeBEdges)
    const cycle: MissionCycle = { id: `cycle-${index + 1}`, routeA, routeB, roles: { anchorNode: anchor, routeANode, routeBNode, objectiveNode }, challenge: selected, routeEdgeIds: [...routeAEdges, ...routeBEdges].map(candidate => candidate.id), nonTrivial: true }
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
