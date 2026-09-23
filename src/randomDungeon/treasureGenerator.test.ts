import { generateMissionDungeon, generateTreasurePlan, resolveTreasureBand } from './missionFirst'
import { createD6Random } from './random'
import { describe, expect, it } from 'vitest'

const request = (overrides: Partial<Parameters<typeof generateMissionDungeon>[0]> = {}) => ({
  style: 'spine-shortcuts' as const,
  seed: 42,
  cols: 88,
  rows: 68,
  tilesPerInch: 8,
  orientation: 'landscape' as const,
  complexity: 'compact' as const,
  loopCount: 0,
  loopPreference: 'varied' as const,
  playerLevel: 1,
  ...overrides,
})

describe('dungeon treasure generation', () => {
  it('exposes the four level-scaled GP totals and magic-item ranges', () => {
    const expected = [
      [1, '0-3', 300, [1, 2], [0, 1]],
      [4, '4-6', 1_000, [1, 2], [1, 2]],
      [7, '7-9', 2_400, [1, 3], [1, 3]],
      [10, '10+', 4_200, [1, 4], [1, 6]],
    ] as const

    for (const [level, label, gpTotal, fabulousMagicItems, legendMagicItems] of expected) {
      const band = resolveTreasureBand(level)
      expect(band).toMatchObject({ levelLabel: label, gpTotal })
      expect(band.fabulous.magicItems).toEqual(fabulousMagicItems)
      expect(band.legend.magicItems).toEqual(legendMagicItems)
    }
  })

  it('creates level-scaled finds with no more than one find per room', () => {
    const result = generateMissionDungeon(request())

    expect(result.ok).toBe(true)
    const plan = result.space!.treasurePlan
    const rooms = result.space!.modules.filter(module => module.footprint.length > 0)
    const goal = result.space!.modules.find(module => module.id === result.space!.anchors[result.mission.goalNodeId])!

    expect(plan.gpTotal).toBe(300)
    expect(plan.finds.filter(find => find.tier === 'poor').length).toBeLessThanOrEqual(5)
    expect(plan.finds.filter(find => find.tier === 'normal').length).toBeLessThanOrEqual(3)
    expect(plan.finds.filter(find => find.tier === 'fabulous').length).toBeGreaterThanOrEqual(1)
    expect(plan.finds.filter(find => find.tier === 'fabulous').length).toBeLessThanOrEqual(2)
    expect(plan.finds.filter(find => find.tier === 'legend').length).toBeLessThanOrEqual(1)
    expect(new Set(plan.finds.map(find => find.moduleId)).size).toBe(plan.finds.length)
    expect(rooms.every(room => (room.treasureFinds?.length ?? 0) <= 1)).toBe(true)
    expect(plan.finds.every(find => rooms.some(room => room.id === find.moduleId))).toBe(true)
    expect(goal.treasureFinds?.every(find => find.tier === 'fabulous' || find.tier === 'legend')).toBe(true)
    expect(plan.notes).toEqual(expect.arrayContaining([expect.stringMatching(/Treasure budget: dungeon level 0-3 · \d+ of 300 gp used/)]))
  })

  it('uses each available room once and reports finds that do not fit', () => {
    const rooms = [
      { id: 'goal', encounter: 'monster' },
      { id: 'hall', encounter: 'trap' },
      { id: 'vault', encounter: 'empty' },
    ]
    const plan = generateTreasurePlan(1, createD6Random(42), rooms, 'goal', [])

    expect(plan.finds).toHaveLength(rooms.length)
    expect(new Set(plan.finds.map(find => find.moduleId))).toEqual(new Set(rooms.map(room => room.id)))
    expect(plan.finds.find(find => find.moduleId === 'goal')?.tier).toBe('fabulous')
    expect(plan.notes).toEqual(expect.arrayContaining([expect.stringMatching(/rolled treasure finds could not be placed/)]))
  })

  it('rejects an over-budget magic item and rerolls that room as affordable gold', () => {
    const dice = [1, 1, 1, 1, 1, 1, 6, 6, 3, 1, 1, 1]
    const random = { nextD6: () => dice.shift() ?? 1 }
    const plan = generateTreasurePlan(1, random, [{ id: 'goal' }], 'goal')

    expect(plan.finds).toHaveLength(1)
    expect(plan.finds[0]).toMatchObject({ moduleId: 'goal', tier: 'fabulous', gp: 100 })
    expect(plan.finds[0]?.magicItems).toBeUndefined()
  })

  it('keeps gold and magic item values within the shared level budget', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = generateMissionDungeon(request({ seed }))
      if (!result.ok || !result.space) continue
      const { finds, gpTotal } = result.space.treasurePlan
      const spent = finds.reduce((total, find) => total + (find.gp ?? 0) + (find.magicItems ?? []).reduce((items, item) => items + (item.valueGp ?? 0), 0), 0)
      expect(spent).toBeLessThanOrEqual(gpTotal)
    }
  })

  it('records the encounter relationship and enabled magic-item source for each find', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    let ownedFind: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['treasurePlan']['finds'][number] | undefined
    let protectedFind: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['treasurePlan']['finds'][number] | undefined
    let ownedResult: ReturnType<typeof generateMissionDungeon> | undefined
    let protectedResult: ReturnType<typeof generateMissionDungeon> | undefined

    for (let seed = 1; seed <= 100 && (!ownedFind || !protectedFind); seed += 1) {
      const result = generateMissionDungeon(request({ seed }))
      const finds = result.space?.treasurePlan.finds ?? []
      if (!ownedFind) {
        ownedFind = finds.find(find => find.disposition === 'owned')
        if (ownedFind) ownedResult = result
      }
      if (!protectedFind) {
        protectedFind = finds.find(find => find.disposition === 'protected')
        if (protectedFind) protectedResult = result
      }
    }

    generated = ownedResult ?? protectedResult
    expect(generated?.ok).toBe(true)
    expect(ownedFind).toBeDefined()
    expect(protectedFind).toBeDefined()
    expect(generated?.space?.treasurePlan.notes).toEqual(expect.arrayContaining([
      expect.stringContaining('Shadowdark Core selected'),
    ]))
    const ownedRoom = ownedResult?.space?.modules.find(room => room.id === ownedFind!.moduleId)
    const protectedRoom = protectedResult?.space?.modules.find(room => room.id === protectedFind!.moduleId)
    expect(ownedRoom?.generatedDetails?.join('\n')).toContain('Monster owns it.')
    expect(protectedRoom?.generatedDetails?.join('\n')).toContain('Trap protects it.')
  })
})
