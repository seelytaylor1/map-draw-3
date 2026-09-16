import { describe, expect, it } from 'vitest'
import { ALL_LOOP_CHALLENGES, createComplexityBudget, generateMissionDungeon, preflightGeneration, validateGenerationRequest, validateProgression } from './randomDungeon/missionFirst'
import type { Mission } from './randomDungeon/missionFirst'
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
    expect(result.mission.cycles.every(cycle => cycle.nonTrivial && new Set(cycle.routeA).size >= 3 && new Set(cycle.routeB).size >= 3)).toBe(true)
    expect(validateProgression(result.mission).goalReachable).toBe(true)
    expect(result.summary.mission.pairings).toHaveLength(0)
  })

  it('does not let an optional lock block the Goal path', () => {
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
    expect(progression.goalReachable).toBe(true)
    expect(progression.diagnostics).toHaveLength(0)
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
    expect(orbit.snapshot?.labels.some(label => label.text === 'Hub / Start')).toBe(true)
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
