import { describe, expect, it } from 'vitest'
import { FLOOR, WALL, WATER } from './constants'
import { ALL_LOOP_CHALLENGES, assessMapTopology, createComplexityBudget, generateMissionDungeon, preflightGeneration, rasterizeSpacePlan, validateGenerationRequest, validateProgression, validateSpacePlan } from './randomDungeon/missionFirst'
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

    const unknownReturn = generateMissionDungeon(request({ loopCount: 1, loopChallenges: ['unknown-return'] }))
    const unknownCycle = unknownReturn.mission.cycles[0]!
    expect(unknownCycle.routeA[unknownCycle.routeA.length - 1]).toBe(unknownCycle.roles.objectiveNode)
    expect(unknownCycle.routeB[unknownCycle.routeB.length - 1]).toBe(unknownCycle.roles.objectiveNode)
    expect(unknownReturn.mission.edges.some(edge => edge.id === 'unknown-return-valve-cycle-1')).toBe(true)
  })

  it('realizes every mission modifier on an early, inspectable base loop', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
      for (const challenge of ALL_LOOP_CHALLENGES) {
        for (const seed of [1, 42, 123456789]) {
          const result = generateMissionDungeon(request({ style, seed, loopCount: 1, loopChallenges: [challenge] }))
          const assessment = assessMapTopology(result.mission, result.space!)
          expect(result.ok, `${style}/${challenge}/${seed}`).toBe(true)
          expect(assessment.supportsMeaningfulChoices, `${style}/${challenge}/${seed}: ${assessment.findings.map(finding => finding.message).join(' ')}`).toBe(true)
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
    const encounterCounts = { empty: 0, monster: 0, trap: 0 }
    const encounterTreasurePairs = new Set<string>()
    let roomCount = 0
    let treasureCount = 0

    for (let seed = 1; seed <= 80; seed++) {
      const result = generateMissionDungeon(request({ seed, complexity: 'compact', loopCount: 0 }))
      expect(result.ok, `seed ${seed}`).toBe(true)
      const rooms = result.space!.modules.filter(module => module.footprint.length > 0)
      const chest = result.snapshot!.stamps.filter(stamp => stamp.type === 'Chest1x1')

      for (const room of rooms) {
        expect(['empty', 'monster', 'trap']).toContain(room.encounter)
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
      }
      expect(chest).toHaveLength(rooms.filter(room => room.hasTreasure).length)
    }

    expect([...encounterKinds].sort()).toEqual(['empty', 'monster', 'trap'])
    expect(encounterCounts.empty / roomCount).toBeGreaterThan(0.42)
    expect(encounterCounts.empty / roomCount).toBeLessThan(0.58)
    expect(encounterCounts.monster / roomCount).toBeGreaterThan(0.27)
    expect(encounterCounts.monster / roomCount).toBeLessThan(0.40)
    expect(encounterCounts.trap / roomCount).toBeGreaterThan(0.10)
    expect(encounterCounts.trap / roomCount).toBeLessThan(0.24)
    expect(treasureCount / roomCount).toBeGreaterThan(0.27)
    expect(treasureCount / roomCount).toBeLessThan(0.40)
    expect([...encounterTreasurePairs]).toEqual(expect.arrayContaining(['empty/false', 'empty/true', 'monster/false', 'monster/true', 'trap/false', 'trap/true']))
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

  it('places a locked door at the main Goal for a Lock and Key challenge', () => {
    const result = generateMissionDungeon(request({ seed: 382040039, loopCount: 1, loopChallenges: ['lock-and-key'] }))
    expect(result.ok).toBe(true)

    const goal = result.space!.modules.find(module => module.missionNodeId === result.mission.goalNodeId)!
    const goalConnections = result.space!.connections.filter(connection => connection.toModuleId === goal.id)
    expect(goalConnections.length).toBeGreaterThan(0)

    for (const connection of goalConnections) {
      const edge = result.mission.edges.find(candidate => candidate.id === connection.missionEdgeId)!
      expect(edge.lockId).toBe(result.mission.locks[0]!.id)
      const position = connection.path[connection.path.length - 2]!
      expect(result.snapshot!.stamps.some(stamp => stamp.type === 'DoorLocked1x1' && stamp.col === position.col && stamp.row === position.row)).toBe(true)
    }
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
