import type { D6Random } from './random'
import { getMagicItemsForSources, MAGIC_ITEM_SOURCES, pickRandomMagicItems } from './magicItemSources'
import type { MagicItemSourceId, TreasureDisposition, TreasureFind, TreasurePlan, TreasureTier } from './missionTypes'

export interface TreasureBand {
  levelLabel: string
  gpTotal: number
  poor: { finds: [number, number]; gp: [number, number]; magicItems: [number, number] }
  normal: { finds: [number, number]; gp: [number, number]; magicItems: [number, number] }
  fabulous: { finds: [number, number]; gp: [number, number]; magicItems: [number, number] }
  legend: { finds: [number, number]; gp: [number, number]; magicItems: [number, number] }
}

export const TREASURE_BANDS: readonly TreasureBand[] = [
  {
    levelLabel: '0-3',
    gpTotal: 300,
    poor: { finds: [5, 5], gp: [20, 30], magicItems: [0, 0] },
    normal: { finds: [3, 3], gp: [50, 80], magicItems: [0, 0] },
    fabulous: { finds: [1, 2], gp: [100, 150], magicItems: [1, 2] },
    legend: { finds: [0, 1], gp: [200, 200], magicItems: [0, 1] },
  },
  {
    levelLabel: '4-6',
    gpTotal: 1_000,
    poor: { finds: [5, 5], gp: [50, 80], magicItems: [0, 0] },
    normal: { finds: [3, 3], gp: [120, 200], magicItems: [0, 0] },
    fabulous: { finds: [1, 1], gp: [300, 300], magicItems: [1, 2] },
    legend: { finds: [1, 1], gp: [400, 400], magicItems: [1, 2] },
  },
  {
    levelLabel: '7-9',
    gpTotal: 2_400,
    poor: { finds: [5, 5], gp: [80, 120], magicItems: [0, 0] },
    normal: { finds: [3, 3], gp: [200, 300], magicItems: [0, 0] },
    fabulous: { finds: [1, 1], gp: [500, 500], magicItems: [1, 3] },
    legend: { finds: [1, 1], gp: [600, 600], magicItems: [1, 3] },
  },
  {
    levelLabel: '10+',
    gpTotal: 4_200,
    poor: { finds: [5, 5], gp: [120, 200], magicItems: [0, 0] },
    normal: { finds: [3, 3], gp: [300, 500], magicItems: [0, 0] },
    fabulous: { finds: [1, 1], gp: [800, 800], magicItems: [1, 4] },
    legend: { finds: [1, 1], gp: [1_200, 1_200], magicItems: [1, 6] },
  },
]

function bandForLevel(playerLevel: number | undefined): TreasureBand {
  const level = Number.isInteger(playerLevel) ? playerLevel! : 1
  if (level >= 10) return TREASURE_BANDS[3]!
  if (level >= 7) return TREASURE_BANDS[2]!
  if (level >= 4) return TREASURE_BANDS[1]!
  return TREASURE_BANDS[0]!
}

export function resolveTreasureBand(playerLevel: number | undefined): TreasureBand {
  return bandForLevel(playerLevel)
}

function rollBetween(random: Pick<D6Random, 'nextD6'>, [minimum, maximum]: readonly [number, number]): number {
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

function chooseRoom(random: Pick<D6Random, 'nextD6'>, roomIds: readonly string[]): string {
  return roomIds[rollBetween(random, [0, roomIds.length - 1])]!
}

function dispositionForEncounter(encounter: string | undefined): TreasureDisposition {
  if (encounter === 'monster') return 'owned'
  if (encounter === 'trap') return 'protected'
  if (encounter === 'lore') return 'hidden'
  return 'unattended'
}

function tierLabel(tier: TreasureTier): string {
  return tier[0]!.toUpperCase() + tier.slice(1)
}

function formatMagicItem(item: NonNullable<TreasureFind['magicItems']>[number]): string {
  const traits = item.traits.map(trait => `${trait.name}: ${trait.description}`).join('\n')
  return [`Magic item: ${item.name}`, item.description, traits].filter(Boolean).join('\n')
}

export function formatTreasureFind(find: TreasureFind): string {
  const amount = find.magicItems && find.magicItems.length > 0
    ? find.magicItems.map(formatMagicItem).join('\n')
    : find.gp === undefined ? 'Treasure' : `${find.gp} gp`
  const context = find.disposition === 'owned'
    ? ' Monster owns it.'
    : find.disposition === 'protected'
      ? ' Trap protects it.'
      : find.disposition === 'hidden'
        ? ' Hidden with the lore.'
        : ''
  const magicNote = find.magicItemUnavailable
    ? ' (no enabled magic-item source)'
    : find.magicItemPossible && find.magicItemRange && !find.magicItems?.length
      ? ` (or ${find.magicItemRange[0]}-${find.magicItemRange[1]} magic item${find.magicItemRange[1] === 1 ? '' : 's'}; this find resolved to GP)`
      : ''
  return `Treasure: ${tierLabel(find.tier)} find — ${amount}${magicNote}.${context}`
}

export function generateTreasurePlan(
  playerLevel: number | undefined,
  random: Pick<D6Random, 'nextD6'>,
  rooms: readonly { id: string; encounter?: string }[],
  goldRoomId: string,
  magicItemSources: readonly MagicItemSourceId[] = ['shadowdark-core'],
): TreasurePlan {
  const band = bandForLevel(playerLevel)
  const roomsById = new Map(rooms.map(room => [room.id, room]))
  const otherRoomIds = rooms.filter(room => room.id !== goldRoomId).map(room => room.id)
  const availableMagicItems = getMagicItemsForSources(magicItemSources)
  const magicSourceLabels = MAGIC_ITEM_SOURCES.filter(source => magicItemSources.includes(source.id) && source.items.length > 0).map(source => source.label)
  const finds: TreasureFind[] = []
  const tiers: TreasureTier[] = ['fabulous', 'legend', 'poor', 'normal']

  for (const tier of tiers) {
    const definition = band[tier]
    const count = rollBetween(random, definition.finds)
    for (let index = 0; index < count; index += 1) {
      const moduleId = tier === 'fabulous' || tier === 'legend' || otherRoomIds.length === 0
        ? goldRoomId
        : chooseRoom(random, otherRoomIds)
      const room = roomsById.get(moduleId)
      const isMagicTier = tier === 'fabulous' || tier === 'legend'
      const magicItemCount = isMagicTier && availableMagicItems.length > 0 && random.nextD6() <= 2
        ? rollBetween(random, definition.magicItems)
        : 0
      const magicItems = magicItemCount > 0 ? pickRandomMagicItems(random, magicItemCount, magicItemSources) : []
      const find: TreasureFind = {
        id: `treasure-${tier}-${index + 1}`,
        tier,
        moduleId,
        ...(magicItems.length > 0 ? {} : { gp: rollBetween(random, definition.gp) }),
        ...(isMagicTier
          ? {
              magicItemPossible: true,
              magicItemRange: definition.magicItems,
              ...(magicItems.length > 0 ? { magicItems } : {}),
              ...(availableMagicItems.length === 0 ? { magicItemUnavailable: true } : {}),
            }
          : {}),
        disposition: dispositionForEncounter(room?.encounter),
      }
      finds.push(find)
    }
  }

  const counts = tiers.map(tier => `${finds.filter(find => find.tier === tier).length} ${tierLabel(tier)}`).join(' · ')
  return {
    levelLabel: band.levelLabel,
    gpTotal: band.gpTotal,
    goldRoomId,
    finds,
    notes: [
      `Treasure GP reference: dungeon level ${band.levelLabel} · ${band.gpTotal} gp for manual distribution; generated find amounts are rolled individually.`,
      `Treasure finds: ${counts}.`,
      'Fabulous and Legend finds are in the gold room. Poor and Normal finds are distributed among the other rooms.',
      availableMagicItems.length > 0
        ? `Magic items: ${magicSourceLabels.join(', ')} selected when a Fabulous or Legend find rolls the magic-item outcome.`
        : 'No magic-item source is enabled; Fabulous and Legend finds resolve to GP.',
    ],
  }
}
