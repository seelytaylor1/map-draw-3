import { describe, expect, it } from 'vitest'
import { generateMissionDungeon, getMagicItemsForSources } from './missionFirst'

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

describe('magic item sources', () => {
  it('loads the Shadowdark Core database and uses it for a magical find', () => {
    const coreItems = getMagicItemsForSources(['shadowdark-core'])

    expect(coreItems).toHaveLength(94)
    expect(coreItems.some(item => item.name === 'Bag Of Holding')).toBe(true)

    let magicFind: NonNullable<ReturnType<typeof generateMissionDungeon>['space']>['treasurePlan']['finds'][number] | undefined
    let generated: ReturnType<typeof generateMissionDungeon> | undefined
    for (let seed = 1; seed <= 100 && !magicFind; seed += 1) {
      const result = generateMissionDungeon(request({ seed, magicItemSources: ['shadowdark-core'] }))
      magicFind = result.space?.treasurePlan.finds.find(find => (find.magicItems?.length ?? 0) > 0)
      if (magicFind) generated = result
    }

    expect(magicFind?.magicItems?.length).toBeGreaterThan(0)
    expect(magicFind?.magicItems?.every(item => item.source === 'shadowdark-core')).toBe(true)
    const room = generated?.space?.modules.find(module => module.id === magicFind!.moduleId)
    expect(room?.generatedDetails?.join('\n')).toContain(`Magic item: ${magicFind!.magicItems![0]!.name}`)
  })

  it('does not assign magic items when every source is disabled', () => {
    const result = generateMissionDungeon(request({ magicItemSources: [] }))

    expect(result.ok).toBe(true)
    expect(result.space!.treasurePlan.finds.every(find => (find.magicItems?.length ?? 0) === 0)).toBe(true)
    expect(result.space!.generalNotes).toEqual(expect.arrayContaining([
      expect.stringContaining('No magic-item source is enabled'),
    ]))
  })
})
