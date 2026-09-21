import { describe, expect, it } from 'vitest'
import { generateMissionDungeon, getDungeonLevelBudget, rollMonsterEncounter } from './missionFirst'
import { createD6Random } from './random'
import { MONSTER_CATALOG, createMonsterEncounterTable } from './monsterCatalog'
import type { MonsterRecord } from './monsterCatalog'

const request = (playerLevel: number) => ({
  style: 'spine-shortcuts' as const,
  seed: 42,
  cols: 88,
  rows: 68,
  tilesPerInch: 8,
  orientation: 'landscape' as const,
  complexity: 'compact' as const,
  playerLevel,
  loopCount: 0,
  loopPreference: 'varied' as const,
})

describe('monster level budgets', () => {
  it('maps party levels to the supplied monster and dungeon budgets', () => {
    expect(getDungeonLevelBudget(1)).toMatchObject({ monsterLevelLabel: '0-3', levelsPerPlayer: 1, encounterBudget: 4, dungeonBudget: 20 })
    expect(getDungeonLevelBudget(3)).toMatchObject({ monsterLevelLabel: '0-3', encounterBudget: 4, dungeonBudget: 20 })
    expect(getDungeonLevelBudget(4)).toMatchObject({ monsterLevelLabel: '4-6', levelsPerPlayer: 3, encounterBudget: 12, dungeonBudget: 60 })
    expect(getDungeonLevelBudget(7)).toMatchObject({ monsterLevelLabel: '7-9', levelsPerPlayer: 5, encounterBudget: 20, dungeonBudget: 100 })
    expect(getDungeonLevelBudget(10)).toMatchObject({ monsterLevelLabel: '10', levelsPerPlayer: 7, encounterBudget: 28, dungeonBudget: 140 })
    expect(() => getDungeonLevelBudget(0)).toThrow(RangeError)
  })

  it('uses monster levels to fill an encounter budget', () => {
    const skeleton: MonsterRecord = { name: 'Skeleton', flavor: 'Bones.', level: 2 }
    const group = rollMonsterEncounter(skeleton, 4, 20)

    expect(group).toMatchObject({ monster: skeleton, count: 2, monsterLevel: 2, levelTotal: 4, encounterBudget: 4, overBudget: 0 })
  })

  it('rounds up when a monster level cannot divide the encounter budget', () => {
    const ogre: MonsterRecord = { name: 'Ogre', flavor: 'Large.', level: 3 }
    const group = rollMonsterEncounter(ogre, 4, 20)

    expect(group).toMatchObject({ count: 2, levelTotal: 6, encounterBudget: 4, overBudget: 2 })
  })

  it('never spends beyond the remaining dungeon budget', () => {
    const skeleton: MonsterRecord = { name: 'Skeleton', flavor: 'Bones.', level: 2 }
    const group = rollMonsterEncounter(skeleton, 4, 5)

    expect(group?.levelTotal).toBeLessThanOrEqual(5)
    expect(group?.count).toBe(2)
  })

  it('does not create a partial encounter when the dungeon pool is too low', () => {
    const badger: MonsterRecord = { name: 'Badger', flavor: 'A badger.', level: 1 }

    expect(rollMonsterEncounter(badger, 4, 3)).toBeNull()
  })

  it('samples the full catalog before applying budgets to room groups', () => {
    const low = generateMissionDungeon(request(1))
    const high = generateMissionDungeon(request(10))

    expect(low.ok).toBe(true)
    expect(high.ok).toBe(true)
    expect(low.space?.monsterEncounterTable).toHaveLength(5)
    expect(new Set(low.space?.monsterEncounterTable.map(monster => monster.name)).size).toBe(5)
    expect(low.space?.monsterEncounterTable.every(monster => MONSTER_CATALOG.includes(monster))).toBe(true)
    let tableWithHighLevelMonster = false
    for (let seed = 1; seed <= 20 && !tableWithHighLevelMonster; seed += 1) {
      const table = createMonsterEncounterTable(createD6Random(seed))
      tableWithHighLevelMonster = table.some(monster => monster.level === '*' || (typeof monster.level === 'number' && monster.level > 3))
    }
    expect(tableWithHighLevelMonster).toBe(true)
    expect(low.space?.monsterLevelsUsed).toBeLessThanOrEqual(low.space!.dungeonLevelBudget.dungeonBudget)
    expect(high.space?.monsterLevelsUsed).toBeLessThanOrEqual(high.space!.dungeonLevelBudget.dungeonBudget)
    expect(low.space?.modules.flatMap(module => module.monsterEncounterGroups ?? []).every(group => group.levelTotal >= low.space!.dungeonLevelBudget.encounterBudget)).toBe(true)
    expect(low.space?.dungeonLevelBudget.encounterBudget).toBe(4)
    expect(high.space?.dungeonLevelBudget.encounterBudget).toBe(28)
  })

  it('rejects a player level outside the picker range', () => {
    const result = generateMissionDungeon({ ...request(1), playerLevel: 11 })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain('invalid-player-level')
  })

  it('replays the same monster quantities for the same seed and player level', () => {
    const first = generateMissionDungeon(request(4))
    const second = generateMissionDungeon(request(4))
    const groups = (result: typeof first) => result.space?.modules.flatMap(module => module.monsterEncounterGroups ?? []) ?? []

    expect(groups(first)).toEqual(groups(second))
    expect(first.space?.monsterLevelsUsed).toBe(second.space?.monsterLevelsUsed)
  })

  it('documents monster encounters rejected by the dungeon budget', () => {
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    for (let seed = 1; seed <= 20 && !generated; seed += 1) {
      const result = generateMissionDungeon({ ...request(1), seed, complexity: 'dense' })
      if (result.space?.monsterRejections.length) generated = result
    }

    expect(generated?.space?.monsterRejections.length).toBeGreaterThan(0)
    const rejection = generated!.space!.monsterRejections[0]!
    const note = generated!.space!.generalNotes.find(candidate => candidate.startsWith('Rejected monster encounters:'))
    expect(note).toContain(rejection.missionNodeId ?? rejection.moduleId)
    expect(note).toContain('rejected')
    expect(note).toContain(String(rejection.remainingDungeonBudget))
  })
})
