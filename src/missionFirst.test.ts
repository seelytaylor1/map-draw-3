import { describe, expect, it } from 'vitest'
import { DARKNESS, FLOOR, WALL, WATER } from './constants'
import { ALL_LOOP_CHALLENGES, assessMapTopology, createComplexityBudget, createMission, generateMissionDungeon, preflightGeneration, rasterizeSpacePlan, validateGenerationRequest, validateProgression, validateSpacePlan } from './randomDungeon/missionFirst'
import type { Mission } from './randomDungeon/missionFirst'
import { runTiles } from './directionalRun'
import { deserialize, serialize } from './serialization'

const request = (overrides: Partial<Parameters<typeof generateMissionDungeon>[0]> = {}) => ({
  style: 'spine-shortcuts' as const,
  seed: 42,
  cols: 88,
  rows: 68,
  tilesPerInch: 8,
  orientation: 'landscape' as const,
  complexity: 'standard' as const,
  loopCount: 1,
  loopPreference: 'varied' as const,
  ...overrides,
})

describe('mission-first dungeon generation', () => {
  it('derives deterministic inspectable budgets and preflight results', () => {
    expect(createComplexityBudget({ complexity: 'dense', loopCount: 3, seed: 7 })).toEqual(createComplexityBudget({ complexity: 'dense', loopCount: 3, seed: 7 }))
    expect(preflightGeneration(request())).toEqual(preflightGeneration(request()))
    expect(preflightGeneration(request({ cols: 22, rows: 17, complexity: 'dense', loopCount: 4 })).status).toBe('impossible')
    expect(generateMissionDungeon(request({ cols: 22, rows: 17, complexity: 'compact', loopCount: 0 })).ok).toBe(true)
    expect(preflightGeneration(request({ cols: 22, rows: 40, complexity: 'standard', loopCount: 1 })).status).not.toBe('impossible')
    expect(preflightGeneration({ ...request(), complexity: 'invalid' as never }).diagnostics.map(diagnostic => diagnostic.code)).toContain('invalid-complexity')
  })

  it('derives Key/Lock dependencies from selected challenges only', () => {
    const noLoops = createComplexityBudget(request({ loopCount: 0 }))
    expect(noLoops.loopChallenges).toEqual([])
    expect(noLoops.derivedKeys).toBe(0)
    expect(noLoops.derivedLocks).toBe(0)

    const lockAndKey = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['lock-and-key'] }))
    expect(lockAndKey.ok).toBe(true)
    expect(lockAndKey.mission.keys).toHaveLength(1)
    expect(lockAndKey.mission.locks).toHaveLength(1)
    expect(lockAndKey.mission.locks[0]?.keyId).toBe(lockAndKey.mission.keys[0]?.id)

    const doubleLock = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['double-lock'] }))
    expect(doubleLock.ok).toBe(true)
    expect(doubleLock.mission.keys).toHaveLength(2)
    expect(doubleLock.mission.locks).toHaveLength(2)
    expect(new Set(doubleLock.mission.keys.map(key => key.id)).size).toBe(2)
    expect(new Set(doubleLock.mission.locks.map(lock => lock.keyId)).size).toBe(2)
  })

  it('puts Lock and Key’s key on the loop and its lock in a midpoint leaf room', () => {
    const mission = createMission(request({ loopCount: 1, loopChallenges: ['lock-and-key'] }))
    const cycle = mission.cycles[0]!
    const key = mission.keys[0]!
    const lock = mission.locks[0]!
    const lockedEdges = mission.edges.filter(edge => edge.lockId === lock.id)

    expect([...cycle.routeA.slice(1, -1), ...cycle.routeB.slice(1, -1)]).toContain(key.nodeId)
    expect(cycle.roles.keyNode).toBe(key.nodeId)
    expect(mission.edges.some(edge => edge.id.startsWith('key-access-'))).toBe(false)
    expect(lockedEdges).toEqual([expect.objectContaining({ to: lock.nodeId })])
    expect(mission.edges.filter(edge => edge.from === lock.nodeId || edge.to === lock.nodeId)).toHaveLength(1)
  })

  it('validates exact request inputs and rejects legacy independent counts', () => {
    expect(validateGenerationRequest({ ...request(), seed: 'abc' }).map(diagnostic => diagnostic.code)).toContain('invalid-seed')
    expect(validateGenerationRequest({ ...request(), seed: 1.5 }).map(diagnostic => diagnostic.code)).toContain('invalid-seed')
    expect(validateGenerationRequest({ ...request(), orientation: 'diagonal' as never }).map(diagnostic => diagnostic.code)).toContain('invalid-orientation')
    expect(validateGenerationRequest({ ...request({ loopCount: 1 }), loopChallenges: ['alternate-paths', 'gambit'] }).map(diagnostic => diagnostic.code)).toContain('loop-challenge-count-mismatch')
    const legacy = { ...request(), keyCount: 1, lockCount: 1 } as unknown as Parameters<typeof validateGenerationRequest>[0]
    expect(validateGenerationRequest(legacy).map(diagnostic => diagnostic.code)).toContain('independent-key-lock-counts')
    expect(generateMissionDungeon(legacy as Parameters<typeof generateMissionDungeon>[0]).ok).toBe(false)
  })

  it('resolves per-loop overrides before the global preference and keeps Varied seeded', () => {
    const mixed = createComplexityBudget(request({ loopCount: 3, loopPreference: 'dangerous-route', loopChallenges: [undefined, 'gambit'] }))
    expect(mixed.loopChallenges).toEqual(['dangerous-route', 'gambit', 'dangerous-route'])
    const first = createComplexityBudget(request({ loopCount: 4, loopPreference: 'varied' }))
    const second = createComplexityBudget(request({ loopCount: 4, loopPreference: 'varied' }))
    expect(first.loopChallenges).toEqual(second.loopChallenges)
    expect(first.loopChallenges.every(challenge => ALL_LOOP_CHALLENGES.includes(challenge))).toBe(true)
  })

  it('realizes Unknown Return as a required lock, directed valve, and spatial return lane', () => {
    const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['unknown-return'] }))
    expect(result.ok).toBe(true)
    const lock = result.mission.locks[0]!
    const goalEntry = result.mission.edges.find(edge => edge.to === result.mission.goalNodeId)
    expect(lock.optional).toBe(false)
    expect(lock.nodeId).toBe(result.mission.goalNodeId)
    expect(goalEntry?.lockId).toBe(lock.id)
    expect(result.mission.edges.some(edge => edge.oneWay)).toBe(true)
    expect(result.mission.edges.some(edge => edge.id.startsWith('key-access-'))).toBe(false)
    expect(result.space?.modules.some(module => module.cycleId === 'cycle-1' && module.missionNodeId === undefined)).toBe(true)
    expect(result.space?.connections.filter(connection => connection.missionEdgeId === 'unknown-return-back-cycle-1').length).toBeGreaterThan(1)
    expect(result.space?.connections.some(connection => connection.semantic === 'one-way' && connection.traversable === 'one-way')).toBe(true)
  })

  it('builds a solvable mission with exact non-trivial cycles', () => {
    const result = generateMissionDungeon(request({ loopCount: 2, loopChallenges: ['alternate-paths', 'alternate-paths'] }))
    expect(result.ok).toBe(true)
    expect(result.mission.nodes.some(node => node.kind === 'start')).toBe(true)
    expect(result.mission.nodes.some(node => node.kind === 'goal')).toBe(true)
    expect(result.mission.cycles).toHaveLength(2)
    expect(result.mission.cycles.map(cycle => cycle.roles.objectiveNode)).not.toContain(result.mission.goalNodeId)
    expect(new Set(result.mission.cycles.map(cycle => cycle.roles.objectiveNode)).size).toBe(2)
    expect(result.mission.cycles.every(cycle => cycle.nonTrivial && new Set(cycle.routeA).size >= 3 && new Set(cycle.routeB).size >= 3)).toBe(true)
    expect(validateProgression(result.mission).goalReachable).toBe(true)
    expect(result.summary.mission.pairings).toHaveLength(0)
  })

  it('realizes a five-loop Lock and Key map for the reported high-loop seed', () => {
    const result = generateMissionDungeon(request({
      seed: 3322568453,
      loopCount: 5,
      loopPreference: 'lock-and-key',
      loopChallenges: Array.from({ length: 5 }, () => 'lock-and-key'),
    }))

    expect(result.ok).toBe(true)
    expect(result.mission.keys).toHaveLength(5)
    expect(result.mission.locks).toHaveLength(5)
    for (const cycle of result.mission.cycles) {
      const key = result.mission.keys.find(candidate => candidate.id === `key-${cycle.id}`)
      const lock = result.mission.locks.find(candidate => candidate.id === `lock-${cycle.id}`)
      const lockedEdges = result.mission.edges.filter(edge => edge.lockId === lock?.id)
      expect(key).toBeDefined()
      expect(lock).toBeDefined()
      expect([...cycle.routeA.slice(1, -1), ...cycle.routeB.slice(1, -1)]).toContain(key!.nodeId)
      expect(lockedEdges).toEqual([expect.objectContaining({ to: lock!.nodeId })])
    }
  }, 15_000)

  it('builds Central Hub loops as independent returns to the Start hub', () => {
    const mission = createMission(request({ style: 'orbit-gates', loopCount: 2, loopChallenges: ['alternate-paths', 'alternate-paths'] }))

    expect(mission.edges.filter(edge => edge.from === 'start' && edge.to === 'goal')).toHaveLength(1)
    expect(mission.cycles.map(cycle => cycle.roles.anchorNode)).toEqual(['start', 'start'])
    expect(mission.cycles.map(cycle => cycle.roles.objectiveNode)).not.toContain('goal')
    expect(new Set(mission.cycles.map(cycle => cycle.roles.objectiveNode)).size).toBe(2)
  })

  it('uses the requested Critical Spine, Central Hub, and Branch-and-merge loop grammars', () => {
    const spineWithoutLoops = createMission(request({ style: 'spine-shortcuts', loopCount: 0 }))
    expect(spineWithoutLoops.edges.every(edge => edge.kind === 'progression')).toBe(true)
    expect(spineWithoutLoops.edges).toHaveLength(spineWithoutLoops.nodes.length - 1)

    const oneSpineLoop = createMission(request({ style: 'spine-shortcuts', loopCount: 1, loopChallenges: ['alternate-paths'] }))
    expect(oneSpineLoop.cycles[0]?.roles.objectiveNode).toBe('goal')
    expect(oneSpineLoop.edges.some(edge => edge.kind === 'progression')).toBe(false)

    const multipleSpineLoops = createMission(request({ style: 'spine-shortcuts', loopCount: 2, loopChallenges: ['alternate-paths', 'alternate-paths'] }))
    expect(multipleSpineLoops.cycles.every(cycle =>
      cycle.roles.objectiveNode !== 'goal'
      && multipleSpineLoops.edges.some(edge => edge.kind === 'progression' && edge.from === cycle.roles.anchorNode && edge.to === cycle.roles.objectiveNode),
    )).toBe(true)

    const hubWithoutLoops = createMission(request({ style: 'orbit-gates', loopCount: 0 }))
    expect(hubWithoutLoops.nodes.filter(node => node.id !== 'start').every(node => hubWithoutLoops.edges.some(edge => edge.from === 'start' && edge.to === node.id))).toBe(true)

    const hubWithLoops = createMission(request({ style: 'orbit-gates', loopCount: 2, loopChallenges: ['alternate-paths', 'alternate-paths'] }))
    expect(hubWithLoops.cycles.every(cycle => cycle.roles.anchorNode === 'start' && cycle.roles.objectiveNode !== 'goal')).toBe(true)
    expect(hubWithLoops.edges.some(edge => edge.from === 'start' && edge.to === 'goal')).toBe(true)

    const cavern = generateMissionDungeon(request({ style: 'cavern-pressure', loopCount: 2, loopChallenges: ['alternate-paths', 'alternate-paths'] }))
    expect(cavern.ok).toBe(true)
    expect(cavern.mission.cycles.every(cycle => cycle.roles.objectiveNode !== 'goal')).toBe(true)
    expect(cavern.mission.cycles.slice(1).every((cycle, index) => cavern.mission.edges.some(edge => edge.kind === 'progression' && edge.from === cavern.mission.cycles[index]!.roles.anchorNode && edge.to === cycle.roles.anchorNode))).toBe(true)
    expect(cavern.space!.modules.filter(module => cavern.mission.cycles.some(cycle => cycle.roles.objectiveNode === module.missionNodeId)).every(module => module.type === 'junction')).toBe(true)
  })

  it('places loop reward treasure in the Goal room', () => {
    const result = generateMissionDungeon(request({ seed: 1, loopCount: 1, loopChallenges: ['alternate-paths'] }))
    const goal = result.space!.modules.find(module => module.missionNodeId === result.mission.goalNodeId)!
    const chests = result.snapshot!.stamps.filter(stamp => stamp.type === 'Chest1x1')

    expect(result.ok).toBe(true)
    expect(goal.hasTreasure).toBe(true)
    expect(chests.some(chest => goal.footprint.some(point => point.col === chest.col && point.row === chest.row))).toBe(true)
  })

  it('uses the dungeon Goal as the objective room when there is one loop', () => {
    const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['alternate-paths'] }))
    const cycle = result.mission.cycles[0]!

    expect(result.ok).toBe(true)
    expect(cycle.roles.objectiveNode).toBe(result.mission.goalNodeId)
    expect(cycle.routeA[cycle.routeA.length - 1]).toBe(result.mission.goalNodeId)
    expect(cycle.routeB[cycle.routeB.length - 1]).toBe(result.mission.goalNodeId)
    expect(result.mission.nodes.some(node => node.id === 'loop-1-objective')).toBe(false)
    expect(result.space!.modules.filter(module => module.missionNodeId === result.mission.goalNodeId)).toHaveLength(1)
  })

  it('starts an ordinary loop as two neutral routes before a mission modifies it', () => {
    const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['alternate-paths'] }))
    const cycle = result.mission.cycles[0]!
    const routeNodes = [cycle.roles.routeANode, cycle.roles.routeBNode].map(id => result.mission.nodes.find(node => node.id === id)!)

    expect(result.ok).toBe(true)
    expect(cycle.routeA.slice(0, 2)).toEqual([cycle.roles.anchorNode, cycle.roles.routeANode])
    expect(cycle.routeB.slice(0, 2)).toEqual([cycle.roles.anchorNode, cycle.roles.routeBNode])
    expect(cycle.routeA[cycle.routeA.length - 1]).toBe(cycle.roles.objectiveNode)
    expect(cycle.routeB[cycle.routeB.length - 1]).toBe(cycle.roles.objectiveNode)
    expect(cycle.routeA.length).toBeGreaterThan(3)
    expect(cycle.routeB.length).toBeGreaterThan(3)
    expect(routeNodes.map(node => node.label)).toEqual(['Loop 1 Route A', 'Loop 1 Route B'])
    expect(result.mission.nodes.some(node => /detour/i.test(node.label))).toBe(false)
  })

  it('puts the unmodified loop choice before the midpoint of the realized map', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      const result = generateMissionDungeon(request({ style, loopCount: 1, loopChallenges: ['alternate-paths'] }))
      const assessment = assessMapTopology(result.mission, result.space!)

      expect(assessment.cycles[0]?.hasDistinctRouteGeometry, style).toBe(true)
      expect(assessment.cycles[0]?.choicePosition, style).toBeLessThanOrEqual(0.5)
      expect(assessment.findings.map(finding => finding.code), style).not.toContain('late-cycle-choice')
      expect(assessment.supportsMeaningfulChoices, style).toBe(true)
    }
  })

  it('applies route-specific missions to the neutral loop', () => {
    const dramatic = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['dramatic-arc'] }))
    const dramaticCycle = dramatic.mission.cycles[0]!
    const dramaticA = dramatic.mission.edges.find(edge => edge.from === dramaticCycle.routeA[dramaticCycle.routeA.length - 2] && edge.to === dramaticCycle.roles.objectiveNode)!
    const dramaticB = dramatic.mission.edges.find(edge => edge.from === dramaticCycle.routeB[dramaticCycle.routeB.length - 2] && edge.to === dramaticCycle.roles.objectiveNode)!
    expect(dramaticA).toMatchObject({ blocked: true, visibleObstacle: true })
    expect(dramaticB.blocked).toBeUndefined()

    const gambit = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['gambit'] }))
    const gambitCycle = gambit.mission.cycles[0]!
    const gambitA = gambit.mission.edges.find(edge => edge.from === gambitCycle.roles.anchorNode && edge.to === gambitCycle.roles.routeANode)!
    expect(gambitA.dangerous).toBe(true)
    expect(gambitCycle.routeB.length).toBeGreaterThan(gambitCycle.routeA.length)
    expect(gambit.mission.nodes.some(node => node.id === 'gambit-cycle-1-safe-route')).toBe(true)

    const hiddenShortcut = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['hidden-shortcut'] }))
    const hiddenShortcutCycle = hiddenShortcut.mission.cycles[0]!
    expect(hiddenShortcut.ok).toBe(true)
    expect(hiddenShortcutCycle.routeA.length).toBeLessThan(hiddenShortcutCycle.routeB.length)

    const unknownReturn = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['unknown-return'] }))
    const unknownCycle = unknownReturn.mission.cycles[0]!
    expect(unknownCycle.routeA[unknownCycle.routeA.length - 1]).toBe(unknownCycle.roles.objectiveNode)
    expect(unknownCycle.routeB[unknownCycle.routeB.length - 1]).toBe(unknownCycle.roles.objectiveNode)
    expect(unknownReturn.mission.edges.some(edge => edge.id === 'unknown-return-valve-cycle-1')).toBe(true)
  })

  it('enforces concentrated danger and non-bypassable key contracts', () => {
    const dangerous = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['dangerous-route'] }))
    const dangerousCycle = dangerous.mission.cycles[0]!
    const encounters = (nodeId: string) => dangerous.space!.modules.find(module => module.missionNodeId === nodeId)?.encounters ?? []
    expect(dangerousCycle.dangerEntries.map(entry => entry.nodeId)).toEqual(dangerousCycle.routeA.slice(1, -1))
    expect(dangerousCycle.dangerEntries.every(entry => entry.count === 1 && entry.kinds === 'all')).toBe(true)
    expect(dangerousCycle.emptyRoomIds).toEqual(dangerousCycle.routeB.slice(1, -1))
    expect(dangerousCycle.routeA.slice(1, -1).every(nodeId => encounters(nodeId).length > 0)).toBe(true)
    expect(dangerousCycle.routeB.slice(1, -1).every(nodeId => encounters(nodeId).length === 0)).toBe(true)
    expect(dangerousCycle.routeA.slice(1, -1).flatMap(nodeId => encounters(nodeId))).toEqual(expect.arrayContaining(['monster', 'trap', 'hazard']))

    const gambit = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['gambit'] }))
    const gambitCycle = gambit.mission.cycles[0]!
    const gambitCount = (route: readonly string[]) => route.slice(1, -1).reduce((count, nodeId) => count + (gambit.space!.modules.find(module => module.missionNodeId === nodeId)?.encounters?.length ?? 0), 0)
    const gambitDangerCount = (route: readonly string[]) => route.slice(1, -1).reduce((count, nodeId) => count + gambitCycle.dangerEntries.filter(entry => entry.nodeId === nodeId).reduce((sum, entry) => sum + entry.count, 0), 0)
    expect(gambitCycle.routeB.length - 2).toBe((gambitCycle.routeA.length - 2) * 2)
    expect(gambitDangerCount(gambitCycle.routeA)).toBe(gambitDangerCount(gambitCycle.routeB))
    expect(gambitCount(gambitCycle.routeA)).toBe(gambitCount(gambitCycle.routeB))

    const unknown = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['unknown-return'] }))
    const unknownCycle = unknown.mission.cycles[0]!
    const key = unknown.mission.keys[0]!
    const valveId = `unknown-return-valve-${unknownCycle.id}`
    const reachable = new Set(['start'])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of unknown.mission.edges) {
        if (edge.id === valveId || edge.lockId) continue
        if (reachable.has(edge.from) && !reachable.has(edge.to)) { reachable.add(edge.to); changed = true }
        if (!edge.oneWay && reachable.has(edge.to) && !reachable.has(edge.from)) { reachable.add(edge.from); changed = true }
      }
    }
    expect(reachable.has(key.nodeId)).toBe(false)

    const doubleLock = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['double-lock'] }))
    const doubleCycle = doubleLock.mission.cycles[0]!
    const loopRooms = new Set([...doubleCycle.routeA.slice(1, -1), ...doubleCycle.routeB.slice(1, -1)])
    expect(doubleLock.mission.keys.every(keyRecord => loopRooms.has(keyRecord.nodeId))).toBe(true)
    expect(doubleLock.mission.locks).toHaveLength(2)
  })

  it('realizes Dramatic Arc inside Start behind a room-wide darkness band', () => {
    const result = generateMissionDungeon(request({ seed: 42, loopCount: 1, loopChallenges: ['dramatic-arc'] }))
    const start = result.space!.modules.find(module => module.missionNodeId === 'start')!
    const grid = result.snapshot!.grids.get(0)!
    const darkness = start.footprint.filter(point => grid[point.row * result.request.cols + point.col] === DARKNESS)
    const darkRows = new Map<number, number>()
    for (const point of darkness) darkRows.set(point.row, (darkRows.get(point.row) ?? 0) + 1)
    const darknessKeys = new Set(darkness.map(point => `${point.col},${point.row}`))

    expect(result.space!.anchors[result.mission.goalNodeId]).toBe(start.id)
    expect(result.space!.modules.some(module => module.missionNodeId === result.mission.goalNodeId)).toBe(false)
    expect(result.snapshot!.labels.some(label => label.id === 'label-dramatic-goal')).toBe(true)
    expect(start.width).toBeGreaterThanOrEqual(7)
    expect(start.height).toBeGreaterThanOrEqual(7)
    expect(start.footprint).toHaveLength(start.width * start.height)
    expect(darkRows.size).toBeGreaterThanOrEqual(3)
    expect(darkRows.size).toBeLessThanOrEqual(6)
    expect([...darkRows.values()].every(width => width === start.width)).toBe(true)
    for (const connection of result.space!.connections) {
      const aperture = connection.fromModuleId === start.id ? connection.path[0] : connection.toModuleId === start.id ? connection.path[connection.path.length - 1] : undefined
      if (aperture) expect(darknessKeys.has(`${aperture.col},${aperture.row}`)).toBe(false)
    }
    const descent = result.snapshot!.steps[0] ?? result.snapshot!.ramps[0]!
    const [entryTile] = runTiles(descent)
    const chest = result.snapshot!.stamps.find(stamp => stamp.id === `generated-room-treasure-${start.id}`)!
    const darkTop = Math.min(...darkRows.keys())
    const darkBottom = Math.max(...darkRows.keys())
    const side = (row: number) => row < darkTop ? 'before' : row > darkBottom ? 'after' : 'darkness'
    expect(side(entryTile!.row)).not.toBe('darkness')
    expect(side(chest.row)).not.toBe('darkness')
    expect(side(entryTile!.row)).not.toBe(side(chest.row))
  })

  it('realizes Hub and Spoke as a central hub with two declared cycle spokes', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      const result = generateMissionDungeon(request({ style, loopCount: 1, loopChallenges: ['hub-and-spoke'] }))
      const cycle = result.mission.cycles[0]!
      const hub = result.space!.modules.find(module => module.missionNodeId === cycle.roles.anchorNode)!
      const routeModules = cycle.routeA.slice(1, 2).concat(cycle.routeB.slice(1, 2)).map(nodeId => result.space!.anchors[nodeId])
      expect(hub.type, style).toBe('hub')
      expect(result.space!.connections.filter(connection => connection.fromModuleId === hub.id && routeModules.includes(connection.toModuleId) && connection.semantic === 'spoke'), style).toHaveLength(2)
    }
  })

  it('keeps Dramatic Arc darkness when the mission contains multiple loops', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      const result = generateMissionDungeon(request({ style, loopCount: 2, loopChallenges: ['dramatic-arc', 'alternate-paths'] }))
      const cycle = result.mission.cycles.find(candidate => candidate.challenge === 'dramatic-arc')!
      const chamber = result.space!.modules.find(module => module.id === result.space!.anchors[cycle.roles.objectiveNode])!
      const grid = result.snapshot!.grids.get(0)!
      const darkness = new Set(chamber.footprint.filter(point => grid[point.row * result.request.cols + point.col] === DARKNESS).map(point => `${point.col},${point.row}`))

      expect(result.ok, style).toBe(true)
      expect(darkness.size, style).toBeGreaterThan(0)
      for (const connection of result.space!.connections) {
        const aperture = connection.fromModuleId === chamber.id ? connection.path[0] : connection.toModuleId === chamber.id ? connection.path[connection.path.length - 1] : undefined
        if (aperture) expect(darkness.has(`${aperture.col},${aperture.row}`), style).toBe(false)
      }
    }
  })

  it('realizes every mission modifier on an early, inspectable base loop', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      for (const challenge of ALL_LOOP_CHALLENGES) {
        for (const seed of [1, 42, 123456789]) {
          const result = generateMissionDungeon(request({ style, seed, loopCount: 1, loopChallenges: [challenge] }))
          const assessment = assessMapTopology(result.mission, result.space!)
          expect(result.ok, `${style}/${challenge}/${seed}`).toBe(true)
          expect(assessment.supportsMeaningfulChoices, `${style}/${challenge}/${seed}: ${assessment.findings.map(finding => finding.message).join(' ')}`).toBe(true)
          if (challenge === 'hidden-shortcut') expect(result.mission.cycles[0]!.routeA.length, `${style}/${seed}`).toBeLessThan(result.mission.cycles[0]!.routeB.length)
        }
      }
    }
  }, 30_000)

  it('marks an unused starting-room wall with a seeded exterior descent', () => {
    const runKinds = new Set<string>()

    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const result = generateMissionDungeon(request({ style, seed, loopCount: 0, complexity: 'compact' }))
      expect(result.ok, `${style}/${seed}`).toBe(true)

      const start = result.space!.modules.find(module => module.missionNodeId === 'start')!
      const run = result.snapshot!.steps[0] ?? result.snapshot!.ramps[0]
      expect(result.snapshot!.steps.length + result.snapshot!.ramps.length).toBe(1)
      expect(run).toMatchObject({ id: 'generated-start-descent', z: 0, ascending: true })
      const startTiles = new Set(start.footprint.map(point => `${point.col},${point.row}`))
      const [interior, exterior] = runTiles(run)
      expect(interior && exterior).toBeDefined()
      expect(startTiles.has(`${interior!.col},${interior!.row}`)).toBe(true)
      expect(startTiles.has(`${exterior!.col},${exterior!.row}`)).toBe(false)
      expect(start.ports.some(port => port.point.col === interior!.col && port.point.row === interior!.row)).toBe(false)
      const grid = result.snapshot!.grids.get(0)!
      expect(grid[exterior!.row * result.request.cols + exterior!.col]).toBe(WALL)
      const hallwayTiles = result.space!.connections.flatMap(connection => connection.path.slice(1, -1))
      expect(hallwayTiles.every(point => Math.abs(point.col - exterior!.col) + Math.abs(point.row - exterior!.row) > 1)).toBe(true)
      expect(result.snapshot!.stamps.some(stamp => runTiles(run).some(point => point.col === stamp.col && point.row === stamp.row))).toBe(false)
      expect(result.snapshot!.labels.some(label => label.text === 'Start' || label.text === 'Hub / Start')).toBe(false)
      runKinds.add(result.snapshot!.steps.length ? 'steps' : 'ramp')
    }

    expect(runKinds).toEqual(new Set(['steps', 'ramp']))
  })

  it('rolls room encounters and independent treasure by seed', () => {
    const encounterKinds = new Set<string>()
    const encounterCounts = { empty: 0, monster: 0, trap: 0, hazard: 0 }
    const encounterTreasurePairs = new Set<string>()
    let roomCount = 0
    let treasureCount = 0

    for (let seed = 1; seed <= 80; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      expect(result.ok, `seed ${seed}`).toBe(true)
      const rooms = result.space!.modules.filter(module => module.footprint.length > 0)
      const chest = result.snapshot!.stamps.filter(stamp => stamp.type === 'Chest1x1')
      const roomHazards = rooms.flatMap(room => room.hazardDetails ?? [])
      expect(new Set(roomHazards.map(hazard => hazard.name)).size).toBe(roomHazards.length)

      for (const room of rooms) {
        expect(['empty', 'monster', 'trap', 'hazard']).toContain(room.encounter)
        encounterKinds.add(room.encounter!)
        encounterCounts[room.encounter as keyof typeof encounterCounts]++
        const hasTreasure = Boolean(room.hasTreasure)
        const chestInRoom = chest.some(stamp => room.footprint.some(point => point.col === stamp.col && point.row === stamp.row))
        expect(chestInRoom).toBe(hasTreasure)
        encounterTreasurePairs.add(`${room.encounter}/${hasTreasure}`)
        roomCount++
        if (hasTreasure) treasureCount++
        if (room.encounter === 'monster') {
          expect(result.snapshot!.stamps.some(stamp => stamp.type === 'TriangleArrowhead1x1' && room.footprint.some(point => point.col === stamp.col && point.row === stamp.row))).toBe(true)
          expect(result.snapshot!.labels.some(label => label.text === 'Monster' && room.footprint.some(point => point.col === label.col && point.row === label.row))).toBe(false)
        }
        if (room.encounter === 'trap') {
          expect(result.snapshot!.stamps.some(stamp => stamp.type === 'Trap1x1' && room.footprint.some(point => point.col === stamp.col && point.row === stamp.row))).toBe(true)
        }
        if (room.encounter === 'hazard') {
          expect(room.generatedDetails?.[0]).toMatch(/^Hazard: /)
          expect(result.snapshot!.stamps.some(stamp => stamp.type === 'Danger1x1' && room.footprint.some(point => point.col === stamp.col && point.row === stamp.row))).toBe(true)
        }
      }
      expect(chest).toHaveLength(rooms.filter(room => room.hasTreasure).length)
    }

    expect([...encounterKinds].sort()).toEqual(['empty', 'hazard', 'monster', 'trap'])
    expect(encounterCounts.empty / roomCount).toBeGreaterThan(0.42)
    expect(encounterCounts.empty / roomCount).toBeLessThan(0.58)
    expect(encounterCounts.monster / roomCount).toBeGreaterThan(0.22)
    expect(encounterCounts.monster / roomCount).toBeLessThan(0.38)
    expect(encounterCounts.trap / roomCount).toBeGreaterThan(0.05)
    expect(encounterCounts.trap / roomCount).toBeLessThan(0.17)
    expect(encounterCounts.hazard / roomCount).toBeGreaterThan(0.05)
    expect(encounterCounts.hazard / roomCount).toBeLessThan(0.17)
    expect(treasureCount / roomCount).toBeGreaterThan(0.27)
    expect(treasureCount / roomCount).toBeLessThan(0.40)
    expect([...encounterTreasurePairs]).toEqual(expect.arrayContaining(['empty/false', 'empty/true', 'monster/false', 'monster/true', 'trap/false', 'trap/true', 'hazard/false', 'hazard/true']))
  })

  it('builds one five-entry monster encounter table and assigns monster rooms from it', () => {
    const first = generateMissionDungeon(request({ seed: 42, complexity: 'compact', loopCount: 0 }))
    const second = generateMissionDungeon(request({ seed: 42, complexity: 'compact', loopCount: 0 }))

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    const table = first.space!.monsterEncounterTable
    const monsterRooms = first.space!.modules.filter(module => module.encounter === 'monster')
    const assignments = monsterRooms.flatMap(room => room.monsterDetails ?? [])

    expect(table).toHaveLength(5)
    expect(new Set(table.map(monster => monster.name)).size).toBe(5)
    expect(monsterRooms.length).toBeGreaterThan(0)
    expect(assignments.length).toBe(monsterRooms.length)
    expect(assignments.every(monster => table.some(entry => entry.name === monster.name))).toBe(true)
    expect(first.space!.generalNotes[0]).toBe([
      'Random Encounter Table:',
      '1. Torch extinguished',
      ...table.map((monster, index) => `${index + 2}. ${monster.name} (LV ${monster.level})`),
    ].join('\n'))
    expect(second.space!.monsterEncounterTable).toEqual(table)
    expect(second.space!.modules.flatMap(room => room.monsterDetails ?? [])).toEqual(assignments)
  })

  it('documents the selected monster in its room ledger entry', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let monsterModule: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['modules'][number] | undefined

    for (let seed = 1; seed <= 100 && !monsterModule; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidate = result.space?.modules.find(module => module.encounter === 'monster')
      if (candidate) {
        generated = result
        monsterModule = candidate
      }
    }

    expect(generated?.ok).toBe(true)
    expect(monsterModule).toBeDefined()
    const label = generated?.snapshot?.labels.find(candidate => candidate.id === `label-${monsterModule!.id}`)
    expect(label?.details).toMatch(/^Monster: .+ \(LV [\d*]+\)\n/)
  })

  it('documents the generated trap method in its room ledger entry', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let trapModule: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['modules'][number] | undefined

    for (let seed = 1; seed <= 100 && !trapModule; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidate = result.space?.modules.find(module => module.encounter === 'trap')
      if (candidate) {
        generated = result
        trapModule = candidate
      }
    }

    expect(generated?.ok).toBe(true)
    expect(trapModule).toBeDefined()
    const label = generated?.snapshot?.labels.find(candidate => candidate.id === `label-${trapModule!.id}`)
    expect(label?.details).toMatch(/^Trap: (Hidden Trap|Trap with Tell|Obvious Trap)\./)
    expect(label?.details).toContain('Attack: ')
    expect(label?.details).toContain('Effect: ')
  })

  it('documents empty rooms in their room ledger entry', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let emptyModule: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['modules'][number] | undefined

    for (let seed = 1; seed <= 100 && !emptyModule; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidate = result.space?.modules.find(module => module.encounter === 'empty')
      if (candidate) {
        generated = result
        emptyModule = candidate
      }
    }

    expect(generated?.ok).toBe(true)
    expect(emptyModule).toBeDefined()
    const label = generated?.snapshot?.labels.find(candidate => candidate.id === `label-${emptyModule!.id}`)
    expect(label?.details).toContain('Empty room.')
  })

  it('documents treasure in its room ledger entry', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let treasureModule: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['modules'][number] | undefined

    for (let seed = 1; seed <= 100 && !treasureModule; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidate = result.space?.modules.find(module => module.hasTreasure)
      if (candidate) {
        generated = result
        treasureModule = candidate
      }
    }

    expect(generated?.ok).toBe(true)
    expect(treasureModule).toBeDefined()
    const label = generated?.snapshot?.labels.find(candidate => candidate.id === `label-${treasureModule!.id}`)
    expect(label?.details).toContain('Treasure: present.')
  })

  it('records one shared hallway trap variety in general notes', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let trappedConnections: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['connections'] = []

    for (let seed = 1; seed <= 100 && trappedConnections.length === 0; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidates = result.space?.connections.filter(connection => connection.condition === 'trap') ?? []
      if (candidates.length > 0) {
        generated = result
        trappedConnections = candidates
      }
    }

    expect(generated?.ok).toBe(true)
    expect(trappedConnections.length).toBeGreaterThan(0)
    expect(new Set(trappedConnections.map(connection => connection.conditionDetails)).size).toBe(1)
    const sharedDetails = trappedConnections[0]?.conditionDetails
    expect(sharedDetails).toBeTruthy()
    expect(generated?.space?.generalNotes).toEqual(expect.arrayContaining([expect.stringContaining(sharedDetails!)]))
  })

  it('documents specific generated content for hazardous hallways', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let hazard: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['connections'][number] | undefined

    for (let seed = 1; seed <= 100 && !hazard; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidate = result.space?.connections.find(connection => connection.condition === 'hazard')
      if (candidate) {
        generated = result
        hazard = candidate
      }
    }

    expect(generated?.ok).toBe(true)
    expect(hazard).toBeDefined()
    expect(hazard?.conditionDetails).toMatch(/^Hazard: /)
    expect(generated?.space?.generalNotes).toEqual(expect.arrayContaining([expect.stringContaining(hazard!.conditionDetails!)]))
  })

  it('uses one shared hazard key for every hazardous hallway', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let hazards: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['connections'] = []

    for (let seed = 1; seed <= 100 && hazards.length < 2; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const candidates = result.space?.connections.filter(connection => connection.condition === 'hazard') ?? []
      if (candidates.length >= 2) {
        generated = result
        hazards = candidates
      }
    }

    expect(generated?.ok).toBe(true)
    expect(hazards.length).toBeGreaterThanOrEqual(2)
    const sharedDetails = hazards[0]?.conditionDetails
    expect(new Set(hazards.map(connection => connection.conditionDetails)).size).toBe(1)
    expect(generated?.space?.generalNotes.filter(note => note.startsWith('Hallway hazards: '))).toEqual([expect.stringContaining(sharedDetails!)])
  })

  it('rolls hallway conditions and marks flooded, trapped, and hazardous passages', () => {
    const conditions = new Set<string>()

    for (let seed = 1; seed <= 40; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      const grid = result.snapshot!.grids.get(0)!
      for (const connection of result.space!.connections) {
        expect(['open', 'flooded', 'trap', 'hazard']).toContain(connection.condition)
        conditions.add(connection.condition!)
        const interior = connection.path.slice(1, -1)
        if (connection.condition === 'flooded') {
          expect(interior.every(point => grid[point.row * result.request.cols + point.col] === WATER)).toBe(true)
        }
        if (connection.condition === 'trap') {
          expect(result.snapshot!.stamps.some(stamp => ['Trap1x1', 'trap'].includes(stamp.type) && interior.some(point => point.col === stamp.col && point.row === stamp.row))).toBe(true)
        }
        if (connection.condition === 'hazard') {
          expect(result.snapshot!.stamps.some(stamp => stamp.type === 'Danger1x1' && interior.some(point => point.col === stamp.col && point.row === stamp.row))).toBe(true)
        }
      }
    }

    expect([...conditions].sort()).toEqual(['flooded', 'hazard', 'open', 'trap'])
  })

  it('rolls doors at some room apertures and along longer corridors', () => {
    const doorStyles = new Set<string>()
    let apertureDoors = 0
    let shortHallwayTrials = 0
    let shortHallwayDoors = 0
    let longHallwayTrials = 0
    let longHallwayDoors = 0
    let apertureCount = 0
    const stampForStyle = {
      single: 'Door1x1', double: 'DoorDouble1x1', portcullis: 'DoorPortcullis1x1', trapdoor: 'TrapdoorFloor1x1', locked: 'DoorLocked1x1',
      revolving: 'DoorRevolving1x1', secret: 'DoorSecret1x1', magic: 'DoorMagic1x1', 'ladder-down': 'LadderDown1x1', 'ladder-up': 'LadderUp1x1',
      stairs: 'Stairs1x1_01', 'spiral-stairs': 'StairSpiralSquareDown1x1', window: 'Window1x1', archway: 'DoorArchway1x1', curtain: 'Curtain1x1',
    }

    for (let seed = 1; seed <= 240; seed++) {
      const result = generateMissionDungeon(request({ seed, loopCount: 0 }))
      expect(result.ok, `seed ${seed}`).toBe(true)
      for (const connection of result.space!.connections) {
        apertureCount += 2
        const hallwayLength = connection.path.length - 2
        if (hallwayLength >= 5 && hallwayLength < 10) shortHallwayTrials++
        if (hallwayLength >= 10) longHallwayTrials++
        for (const doorway of connection.doorways ?? []) {
          doorStyles.add(doorway.style)
          const matchingStamp = result.snapshot!.stamps.find(stamp => stamp.col === doorway.point.col && stamp.row === doorway.point.row)
          expect(matchingStamp?.type).toBe(stampForStyle[doorway.style])
          if (doorway.location === 'room-aperture') {
            apertureDoors++
            const firstHallwayTiles = [connection.path[1], connection.path[connection.path.length - 2]]
            expect(firstHallwayTiles).toContainEqual(doorway.point)
            expect([connection.path[0], connection.path[connection.path.length - 1]]).not.toContainEqual(doorway.point)
          } else {
            if (hallwayLength < 10) shortHallwayDoors++
            else longHallwayDoors++
            expect(connection.path.length - 2).toBeGreaterThanOrEqual(5)
            expect(connection.path.slice(1, -1)).toContainEqual(doorway.point)
          }
        }
      }
    }

    expect(apertureDoors).toBeGreaterThan(0)
    expect(apertureDoors / apertureCount).toBeGreaterThan(0.42)
    expect(apertureDoors / apertureCount).toBeLessThan(0.58)
    expect(shortHallwayTrials).toBeGreaterThan(0)
    expect(longHallwayTrials).toBeGreaterThan(0)
    expect(shortHallwayDoors / shortHallwayTrials).toBeGreaterThan(0.40)
    expect(shortHallwayDoors / shortHallwayTrials).toBeLessThan(0.60)
    expect(longHallwayDoors / longHallwayTrials).toBeGreaterThan(0.70)
    expect(longHallwayDoors / longHallwayTrials).toBeLessThan(0.97)
    expect([...doorStyles]).toEqual(expect.arrayContaining(Object.keys(stampForStyle)))
  })

  it('places locked door markers on the apertures governed by real Key/Lock relationships', () => {
    for (const challenge of ['lock-and-key', 'double-lock', 'unknown-return'] as const) {
      const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: [challenge] }))
      expect(result.ok, challenge).toBe(true)
      const lockedConnections = result.space!.connections.filter(connection => result.mission.edges.some(edge => edge.id === connection.missionEdgeId && edge.lockId))
      const expected = lockedConnections.map(connection => connection.path[connection.path.length - 2]!)
      const lockedStamps = result.snapshot!.stamps.filter(stamp => stamp.type === 'DoorLocked1x1')
      const keyStamps = result.snapshot!.stamps.filter(stamp => result.mission.keys.some(key => stamp.id === `generated-${key.id}`))

      expect(lockedConnections.length, challenge).toBeGreaterThan(0)
      expect(keyStamps).toHaveLength(result.mission.keys.length)
      expect(keyStamps.every(stamp => stamp.type === 'Key1x1')).toBe(true)
      expect(lockedConnections.every(connection => {
        const lockPoint = connection.path[connection.path.length - 2]!
        return connection.doorways?.some(doorway => doorway.style === 'locked' && doorway.point.col === lockPoint.col && doorway.point.row === lockPoint.row)
      })).toBe(true)
      expect(lockedStamps.map(({ col, row }) => ({ col, row }))).toEqual(expect.arrayContaining(expected))
    }
  })

  it('accepts later nested loops when the realized five-loop map has an early meaningful choice', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      const result = generateMissionDungeon(request({ style, seed: 1, loopCount: 5, loopChallenges: Array(5).fill('alternate-paths') }))
      const assessment = assessMapTopology(result.mission, result.space!)

      expect(result.ok, style).toBe(true)
      expect(assessment.cycles).toHaveLength(5)
      expect(assessment.supportsMeaningfulChoices, `${style}: ${assessment.findings.map(finding => finding.message).join(' ')}`).toBe(true)
    }
  }, 30_000)

  it('color codes each generated key with its matching locked doors', () => {
    const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['double-lock'] }))
    expect(result.ok).toBe(true)

    const stamps = result.snapshot!.stamps
    const keyColors = result.mission.keys.map(key => {
      const keyStamp = stamps.find(stamp => stamp.id === `generated-${key.id}`)!
      expect(keyStamp.color).toBeDefined()
      expect(result.snapshot!.labels.find(label => label.id === `label-${key.id}`)?.color).toBe(keyStamp.color)

      const matchingLocks = result.mission.locks.filter(lock => lock.keyId === key.id)
      const matchingDoorStamps = matchingLocks.flatMap(lock => stamps.filter(stamp => {
        const suffix = stamp.id.slice(`generated-${lock.id}-`.length)
        return stamp.id.startsWith(`generated-${lock.id}-`) && /^\d+$/.test(suffix)
      }))
      expect(matchingDoorStamps.length).toBeGreaterThan(0)
      expect(matchingDoorStamps.every(stamp => stamp.color === keyStamp.color)).toBe(true)
      return keyStamp.color
    })

    expect(new Set(keyColors).size).toBe(result.mission.keys.length)
  })

  it('places the Lock and Key door at a locked loop leaf and its key on the loop', () => {
    const result = generateMissionDungeon(request({ seed: 382040039, loopCount: 1, loopChallenges: ['lock-and-key'] }))
    expect(result.ok).toBe(true)

    const cycle = result.mission.cycles[0]!
    const key = result.mission.keys[0]!
    const lock = result.mission.locks[0]!
    const lockedEdge = result.mission.edges.find(edge => edge.lockId === lock.id)!
    const lockedConnection = result.space!.connections.find(connection => connection.missionEdgeId === lockedEdge.id)!
    const position = lockedConnection.path[lockedConnection.path.length - 2]!

    expect(lockedEdge.to).toBe(lock.nodeId)
    expect([...cycle.routeA.slice(1, -1), ...cycle.routeB.slice(1, -1)]).toContain(key.nodeId)
    expect(result.snapshot!.stamps.some(stamp => stamp.type === 'DoorLocked1x1' && stamp.col === position.col && stamp.row === position.row)).toBe(true)
    expect(result.snapshot!.stamps.some(stamp => stamp.id === `generated-${key.id}` && stamp.type === 'Key1x1')).toBe(true)
  })

  it('places every Key marker visibly and moves a colliding marker beside the room center', () => {
    const generated = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['double-lock'] }))
    expect(generated.ok).toBe(true)

    const mission = structuredClone(generated.mission)
    mission.keys[1]!.nodeId = mission.keys[0]!.nodeId
    const rasterized = rasterizeSpacePlan(generated.request, mission, generated.space!)
    expect(rasterized.snapshot).toBeDefined()

    const keyStamps = rasterized.snapshot!.stamps.filter(stamp => mission.keys.some(key => stamp.id === `generated-${key.id}`))
    expect(keyStamps).toHaveLength(mission.keys.length)
    expect(new Set(keyStamps.map(stamp => `${stamp.col},${stamp.row}`)).size).toBe(keyStamps.length)

    const keyRoom = generated.space!.modules.find(module => module.missionNodeId === mission.keys[0]!.nodeId)!
    const center = { col: keyRoom.origin.col + Math.floor(keyRoom.width / 2), row: keyRoom.origin.row + Math.floor(keyRoom.height / 2) }
    expect(keyStamps.some(stamp => stamp.col === center.col && stamp.row === center.row)).toBe(true)
    const adjacentKey = keyStamps.find(stamp => Math.abs(stamp.col - center.col) + Math.abs(stamp.row - center.row) === 1)!
    expect(rasterized.snapshot!.grids.get(0)![adjacentKey.row * generated.request.cols + adjacentKey.col]).toBe(FLOOR)
    expect(rasterized.snapshot!.labels.every(label => !keyStamps.some(stamp => stamp.col === label.col && stamp.row === label.row))).toBe(true)

    const allStampPositions = rasterized.snapshot!.stamps.map(stamp => `${stamp.col},${stamp.row}`)
    expect(new Set(allStampPositions).size).toBe(allStampPositions.length)
  })

  it('rejects an optional lock that incorrectly blocks the only Goal path', () => {
    const mission: Mission = {
      id: 'optional-lock-fixture',
      seed: 1,
      style: 'spine-shortcuts',
      patterns: [],
      nodes: [],
      edges: [{ id: 'optional-goal-edge', from: 'start', to: 'goal', kind: 'progression', coupling: 'tight', lockId: 'optional-lock' }],
      keys: [],
      locks: [{ id: 'optional-lock', nodeId: 'goal', keyId: 'missing-key', optional: true }],
      cycles: [],
      goalNodeId: 'goal',
      diagnostics: [],
    }
    const progression = validateProgression(mission)
    expect(progression.goalReachable).toBe(false)
    expect(progression.diagnostics.map(d => d.code)).toContain('goal-unreachable')
  })

  it('covers the complete loop challenge vocabulary', () => {
    expect(ALL_LOOP_CHALLENGES).toHaveLength(10)
    for (const challenge of ALL_LOOP_CHALLENGES) {
      const result = generateMissionDungeon(request({ loopCount: 1, loopChallenges: [challenge] }))
      expect(result.ok, challenge).toBe(true)
      expect(result.mission.cycles[0]?.challenge, challenge).toBe(challenge)
    }
  })

  it('fails transactionally when a required semantic stamp is unavailable', () => {
    const result = generateMissionDungeon(request({ availableStampTypes: [] }))
    expect(result.ok).toBe(false)
    expect(result.snapshot).toBeUndefined()
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'missing-required-stamp')).toBe(true)
  })

  it('realizes each production style through the shared pipeline', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      const result = generateMissionDungeon(request({ style }))
      expect(result.ok, style).toBe(true)
      expect(result.space?.modules.some(module => module.type === 'hub' || module.type === 'branch' || module.type === 'junction' || module.type === 'room')).toBe(true)
      expect(result.summary.style).toBe(style)
    }
    const orbit = generateMissionDungeon(request({ style: 'orbit-gates' }))
    expect(orbit.space?.modules[0]?.type).toBe('hub')
    expect(orbit.space?.connections.some(connection => connection.semantic === 'spoke')).toBe(true)
    expect(orbit.snapshot?.stamps.some(stamp => stamp.type === 'Altar1x1' || stamp.type === 'CircleFilled1x1' || stamp.type === 'Circle1x1')).toBe(true)
    expect(orbit.snapshot?.labels.some(label => label.text === 'Hub')).toBe(true)
    const cavern = generateMissionDungeon(request({ style: 'cavern-pressure' }))
    expect(cavern.space?.modules.some(module => module.type === 'branch')).toBe(true)
    expect(cavern.space?.modules.some(module => module.type === 'junction')).toBe(true)
  })

  it('realizes every Loop Challenge in every Generation Style', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      for (const challenge of ALL_LOOP_CHALLENGES) {
        const result = generateMissionDungeon(request({ style, loopCount: 1, loopChallenges: [challenge] }))
        expect(result.ok, `${style}/${challenge}`).toBe(true)
      }
    }
  }, 30_000)

  it('realizes mixed multi-mission requests across every style and complexity', () => {
    const scenarios = [
      { complexity: 'compact' as const, loopChallenges: ['alternate-paths', 'hidden-shortcut', 'dramatic-arc'] as const },
      { complexity: 'standard' as const, loopChallenges: ['dangerous-route', 'lock-and-key', 'unknown-return'] as const },
      { complexity: 'dense' as const, loopChallenges: ['patrolled-cycle', 'gambit', 'hub-and-spoke', 'double-lock'] as const },
    ]
    const styles = ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const

    for (const style of styles) for (const scenario of scenarios) for (const seed of [1, 42, 123456789, 0xffffffff]) {
      const result = generateMissionDungeon(request({
        style,
        seed,
        complexity: scenario.complexity,
        loopCount: scenario.loopChallenges.length,
        loopPreference: 'varied',
        loopChallenges: scenario.loopChallenges,
      }))
      const label = `${style}/${scenario.complexity}/seed-${seed}`

      expect(result.ok, `${label}: ${JSON.stringify(result.diagnostics)}`).toBe(true)
      expect(result.mission.cycles.map(cycle => cycle.challenge), label).toEqual(scenario.loopChallenges)
      expect(validateProgression(result.mission).solvable, label).toBe(true)
      expect(validateSpacePlan(result.request, result.space!, result.mission).valid, label).toBe(true)
    }
  }, 30_000)

  it('keeps representative style layouts inside the page across seeded replays', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      for (const seed of [1, 42, 123456789, 0xffffffff]) {
        const result = generateMissionDungeon(request({ style, seed }))
        expect(result.ok, `${style} seed ${seed}`).toBe(true)
        const modules = result.space!.modules
        const minCol = Math.min(...modules.map(module => module.origin.col))
        const minRow = Math.min(...modules.map(module => module.origin.row))
        const maxCol = Math.max(...modules.map(module => module.origin.col + module.width - 1))
        const maxRow = Math.max(...modules.map(module => module.origin.row + module.height - 1))
        expect(minCol, `${style} seed ${seed} left border`).toBeGreaterThan(0)
        expect(minRow, `${style} seed ${seed} top border`).toBeGreaterThan(0)
        expect(maxCol, `${style} seed ${seed} right border`).toBeLessThan(88 - 1)
        expect(maxRow, `${style} seed ${seed} bottom border`).toBeLessThan(68 - 1)
      }
    }
  }, 30_000)

  it('supports every loop challenge independently without runtime simulation', () => {
    for (const challenge of ALL_LOOP_CHALLENGES) {
      const result = generateMissionDungeon(request({ loopPreference: challenge, loopChallenges: [challenge] }))
      expect(result.ok, challenge).toBe(true)
      expect(result.mission.cycles[0]?.challenge).toBe(challenge)
      expect(result.mission.cycles[0]?.roles.objectiveNode).toBe(result.mission.goalNodeId)
      expect(result.mission.cycles[0]?.roles.keyNode === undefined || result.mission.nodes.some(node => node.id === result.mission.cycles[0]?.roles.keyNode)).toBe(true)
      expect(result.mission.edges.some(edge => edge.blocked || edge.oneWay || edge.secret || edge.dangerous || edge.lockId) || challenge === 'alternate-paths' || challenge === 'hub-and-spoke').toBe(true)
    }
  })

  it('keeps Mission and Space metadata ephemeral across Save Files while preserving Map state', () => {
    const result = generateMissionDungeon(request({ style: 'orbit-gates' }))
    expect(result.snapshot).toBeDefined()
    const snapshot = result.snapshot!
    const saved = serialize({
      grids: snapshot.grids,
      cols: 88,
      rows: 68,
      tilesPerInch: 8,
      wallColor: '#000000',
      wallOpacity: 0,
      brushShape: 'square',
      showGrid: false,
      show3D: false,
      isoFaceColor: '#6a5040',
      showHatching: false,
      hatchColor: '#000000',
      showWallOutline: true,
      wallOutlineColor: '#000000',
      wallOutlineStyle: 'clean',
      waterColor: '#6baed6',
      lavaColor: '#c1440e',
      darknessColor: '#1a0a2e',
      stamps: snapshot.stamps,
      steps: snapshot.steps,
      ramps: snapshot.ramps,
      labels: snapshot.labels,
      environmentalColors: snapshot.environmentalColors,
    })
    expect(JSON.stringify(saved)).not.toContain('mission')
    expect(JSON.stringify(saved)).not.toContain('orbit-gates')
    expect((deserialize(saved).grids.get(0) ?? []).length).toBe(88 * 68)
  })
})
