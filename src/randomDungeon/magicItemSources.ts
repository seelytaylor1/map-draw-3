import coreDatabase from './data/magic-items-core.jsonl?raw'
import type { D6Random } from './random'
import type { MagicItemRecord, MagicItemSourceId, MagicItemTrait } from './missionTypes'

export interface MagicItemSource {
  id: MagicItemSourceId
  label: string
  items: readonly MagicItemRecord[]
}

function parseCoreDatabase(database: string): readonly MagicItemRecord[] {
  return database
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const record = JSON.parse(line) as { name?: unknown; slug?: unknown; description?: unknown; traits?: unknown }
      if (typeof record.name !== 'string' || typeof record.slug !== 'string' || typeof record.description !== 'string' || !Array.isArray(record.traits)) {
        throw new Error(`Invalid Shadowdark Core magic item record at line ${index + 1}.`)
      }
      const traits = record.traits.map(trait => {
        const parsed = trait as { name?: unknown; description?: unknown }
        if (typeof parsed.name !== 'string' || typeof parsed.description !== 'string') throw new Error(`Invalid trait in Shadowdark Core magic item at line ${index + 1}.`)
        return { name: parsed.name, description: parsed.description } satisfies MagicItemTrait
      })
      return { name: record.name, slug: record.slug, description: record.description, traits, source: 'shadowdark-core' } satisfies MagicItemRecord
    })
}

export const SHADOWDARK_CORE_MAGIC_ITEMS: readonly MagicItemRecord[] = parseCoreDatabase(coreDatabase)

/**
 * Source modules keep the database boundary separate from treasure rolling.
 * Custom items can be added as another source without changing the picker.
 */
export const MAGIC_ITEM_SOURCES: readonly MagicItemSource[] = [
  { id: 'shadowdark-core', label: 'Shadowdark Core', items: SHADOWDARK_CORE_MAGIC_ITEMS },
  { id: 'custom', label: 'Custom', items: [] },
]

export function getMagicItemsForSources(sourceIds: readonly MagicItemSourceId[] = ['shadowdark-core']): MagicItemRecord[] {
  const enabled = new Set(sourceIds)
  return MAGIC_ITEM_SOURCES.filter(source => enabled.has(source.id)).flatMap(source => source.items)
}

function rollBetween(random: Pick<D6Random, 'nextD6'>, minimum: number, maximum: number): number {
  const range = maximum - minimum + 1
  if (range <= 1) return minimum
  let space = 1
  let digits = 0
  while (space < range) {
    space *= 6
    digits += 1
  }
  const limit = space - (space % range)
  let value = 0
  do {
    value = 0
    for (let index = 0; index < digits; index += 1) value = value * 6 + random.nextD6() - 1
  } while (value >= limit)
  return minimum + (value % range)
}

export function pickRandomMagicItems(
  random: Pick<D6Random, 'nextD6'>,
  count: number,
  sourceIds: readonly MagicItemSourceId[] = ['shadowdark-core'],
): MagicItemRecord[] {
  const items = getMagicItemsForSources(sourceIds)
  if (items.length === 0 || count <= 0) return []
  return Array.from({ length: count }, () => items[rollBetween(random, 0, items.length - 1)]!)
}
