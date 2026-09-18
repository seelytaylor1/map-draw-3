import type { Mission, MissionCycle, SpacePlan, SpatialConnection } from './missionTypes'

export type TopologyFindingCode = 'late-cycle-choice' | 'missing-route-geometry' | 'no-usable-alternate-route' | 'missing-mission-realization' | 'intentional-route-closure' | 'intentional-hub-rewrite'

export interface TopologyFinding {
  code: TopologyFindingCode
  message: string
  cycleId?: string
}

export interface CycleTopologyAssessment {
  cycleId: string
  challenge: MissionCycle['challenge']
  anchorDistance: number | null
  objectiveDistance: number | null
  choicePosition: number | null
  routeConnectionCounts: [number, number]
  usableRoutes: number
  hasDistinctRouteGeometry: boolean
}

export interface MapTopologyAssessment {
  startGoalDistance: number | null
  firstChoiceDistance: number | null
  cycles: CycleTopologyAssessment[]
  findings: TopologyFinding[]
  supportsMeaningfulChoices: boolean
}

type Graph = Map<string, Set<string>>

function add(graph: Graph, from: string, to: string): void {
  if (!graph.has(from)) graph.set(from, new Set())
  graph.get(from)!.add(to)
}

function graphFor(plan: SpacePlan, includeBlocked = false): Graph {
  const graph: Graph = new Map(plan.modules.map(module => [module.id, new Set<string>()]))
  for (const connection of plan.connections) {
    if (!includeBlocked && connection.traversable === 'blocked') continue
    add(graph, connection.fromModuleId, connection.toModuleId)
    if (connection.traversable !== 'one-way') add(graph, connection.toModuleId, connection.fromModuleId)
  }
  return graph
}

function shortestDistance(graph: Graph, from: string | undefined, to: string | undefined): number | null {
  if (!from || !to || !graph.has(from) || !graph.has(to)) return null
  const distances = new Map([[from, 0]])
  const queue = [from]
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!
    const distance = distances.get(current)!
    if (current === to) return distance
    for (const next of graph.get(current) ?? []) if (!distances.has(next)) {
      distances.set(next, distance + 1)
      queue.push(next)
    }
  }
  return null
}

function routeConnections(mission: Mission, plan: SpacePlan, cycle: MissionCycle, route: readonly string[]): SpatialConnection[] {
  const edgeIds = route.flatMap((nodeId, index) => {
    const next = route[index + 1]
    if (!next) return []
    return mission.edges.filter(edge => edge.from === nodeId && edge.to === next && cycle.routeEdgeIds.includes(edge.id)).map(edge => edge.id)
  })
  return edgeIds.flatMap(edgeId => plan.connections.filter(connection => connection.missionEdgeId === edgeId))
}

/**
 * Judges the realized room/corridor topology, not merely the requested Mission.
 * A late choice is a cycle whose anchor lies beyond half of the actual Start-to-
 * objective route, which is the "linear dungeon with a fork at the end" shape.
 */
export function assessMapTopology(mission: Mission, plan: SpacePlan): MapTopologyAssessment {
  const moduleFor = (nodeId: string) => plan.modules.find(module => module.missionNodeId === nodeId)?.id
  const start = moduleFor('start')
  const goal = moduleFor(mission.goalNodeId)
  const traversable = graphFor(plan)
  const structural = graphFor(plan, true)
  const startGoalDistance = shortestDistance(traversable, start, goal)
  const branchingModules = [...structural].filter(([, neighbors]) => neighbors.size >= 3).map(([id]) => id)
  const firstChoiceDistance = branchingModules.map(id => shortestDistance(structural, start, id)).filter((distance): distance is number => distance !== null).sort((a, b) => a - b)[0] ?? null
  const findings: TopologyFinding[] = []

  const cycles = mission.cycles.map(cycle => {
    const anchor = moduleFor(cycle.roles.anchorNode)
    const objective = moduleFor(cycle.roles.objectiveNode)
    const anchorDistance = shortestDistance(structural, start, anchor)
    const objectiveDistance = shortestDistance(structural, start, objective)
    const choicePosition = anchorDistance === null || objectiveDistance === null || objectiveDistance === 0 ? null : anchorDistance / objectiveDistance
    const routeA = routeConnections(mission, plan, cycle, cycle.routeA)
    const routeB = routeConnections(mission, plan, cycle, cycle.routeB)
    const routeAIds = new Set(routeA.map(connection => connection.id))
    const routeBIds = new Set(routeB.map(connection => connection.id))
    const hasDistinctRouteGeometry = routeAIds.size > 0 && routeBIds.size > 0 && [...routeAIds].some(id => !routeBIds.has(id)) && [...routeBIds].some(id => !routeAIds.has(id))
    const usableRoutes = [routeA, routeB].filter(route => route.length > 0 && route.every(connection => connection.traversable !== 'blocked')).length

    if (cycle.challenge === 'hub-and-spoke') {
      findings.push({ code: 'intentional-hub-rewrite', cycleId: cycle.id, message: `${cycle.id} intentionally rewrites its base loop into a hub-and-spoke.` })
    } else {
      if (!hasDistinctRouteGeometry) findings.push({ code: 'missing-route-geometry', cycleId: cycle.id, message: `${cycle.id} does not retain private realized corridor geometry for both routes.` })
      if (usableRoutes < 2) {
        const code: TopologyFindingCode = cycle.challenge === 'dramatic-arc' ? 'intentional-route-closure' : 'no-usable-alternate-route'
        findings.push({ code, cycleId: cycle.id, message: cycle.challenge === 'dramatic-arc' ? `${cycle.id} intentionally closes one route with its visible obstacle.` : `${cycle.id} has only ${usableRoutes} usable route${usableRoutes === 1 ? '' : 's'} after realization.` })
      }
      if (choicePosition !== null && choicePosition > 0.5) findings.push({ code: 'late-cycle-choice', cycleId: cycle.id, message: `${cycle.id}'s anchor occurs ${(choicePosition * 100).toFixed(0)}% of the way from Start to its objective, so the map reads as a long linear prefix followed by a late fork.` })
    }
    const addMissingRealization = (message: string) => findings.push({ code: 'missing-mission-realization', cycleId: cycle.id, message })
    const routeAApproach = cycle.routeA[cycle.routeA.length - 2]
    const objectiveConnections = plan.connections.filter(connection => connection.toModuleId === objective)
    if (cycle.challenge === 'hidden-shortcut' && !routeA.some(connection => connection.semantic === 'secret')) addMissingRealization(`${cycle.id} has no secret corridor on Route A.`)
    if (cycle.challenge === 'dramatic-arc' && (!routeA.some(connection => connection.traversable === 'blocked') || !routeB.some(connection => connection.traversable !== 'blocked'))) addMissingRealization(`${cycle.id} must block Route A while keeping Route B open.`)
    if (cycle.challenge === 'dangerous-route' && !routeA.some(connection => connection.semantic === 'dangerous')) addMissingRealization(`${cycle.id} has no dangerous Route A corridor.`)
    if (cycle.challenge === 'patrolled-cycle' && ![...routeA, ...routeB].every(connection => connection.semantic === 'dangerous')) addMissingRealization(`${cycle.id} must mark both routes dangerous.`)
    if (cycle.challenge === 'gambit' && (!routeA.some(connection => connection.semantic === 'dangerous') || routeB.length <= routeA.length || routeB.some(connection => connection.semantic === 'dangerous'))) addMissingRealization(`${cycle.id} must have a dangerous short Route A and a longer safe Route B.`)
    if (cycle.challenge === 'lock-and-key' && (mission.keys.filter(key => key.id.includes(cycle.id)).length !== 1 || objectiveConnections.length === 0 || !objectiveConnections.every(connection => connection.semantic === 'locked'))) addMissingRealization(`${cycle.id} must place one key and lock every objective entrance.`)
    if (cycle.challenge === 'unknown-return' && (!objectiveConnections.every(connection => connection.semantic === 'locked') || !plan.connections.some(connection => connection.missionEdgeId === `unknown-return-valve-${cycle.id}` && connection.semantic === 'one-way') || !mission.edges.some(edge => edge.from === routeAApproach && edge.id === `unknown-return-valve-${cycle.id}`))) addMissingRealization(`${cycle.id} must lock its objective and realize the Route A-to-Key one-way return valve.`)
    if (cycle.challenge === 'hub-and-spoke' && (plan.modules.find(module => module.id === anchor)?.type !== 'hub' || !plan.connections.some(connection => connection.cycleId === cycle.id && connection.semantic === 'spoke'))) addMissingRealization(`${cycle.id} must realize its anchor as a hub with explicit spokes.`)
    if (cycle.challenge === 'double-lock' && (mission.keys.filter(key => key.id.includes(cycle.id)).length !== 2 || mission.locks.filter(lock => lock.id.includes(cycle.id)).length !== 2 || new Set(mission.edges.filter(edge => edge.lockId?.includes(cycle.id)).map(edge => edge.lockId)).size !== 2)) addMissingRealization(`${cycle.id} must realize two distinct Key/Lock dependencies.`)
    return { cycleId: cycle.id, challenge: cycle.challenge, anchorDistance, objectiveDistance, choicePosition, routeConnectionCounts: [routeA.length, routeB.length] as [number, number], usableRoutes, hasDistinctRouteGeometry }
  })

  const blockingCodes: TopologyFindingCode[] = ['late-cycle-choice', 'missing-route-geometry', 'no-usable-alternate-route', 'missing-mission-realization']
  return { startGoalDistance, firstChoiceDistance, cycles, findings, supportsMeaningfulChoices: !findings.some(finding => blockingCodes.includes(finding.code)) }
}
