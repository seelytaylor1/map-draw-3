import type { DangerEntry, DangerKind, GenerationRequest, MissionCycle, RoomEncounter } from './missionTypes'
import type { D6Random } from './random'
import { createD6Random, normalizeSeed } from './random'
import { createMonsterEncounterTable, MONSTER_CATALOG, pickRandomMonsterFromTable, type MonsterRecord } from './monsterCatalog'
import { minimumMonsterEncounterCost, monsterCountDiceNotation, monsterFitsLevelBudget, numericMonsterLevel, remainingMonsterRoomBudget, resolveDungeonLevelBudget, rollMonsterEncounter, type DungeonLevelBudget, type MonsterRejection } from './monsterBudget'
import { createMonsterRoomContext, formatMonsterRoomContext, type MonsterEncounterGroupWithContext } from './monsterContext'
import { createTrapRecord, formatTrapRecord, type TrapRecord } from './trapGenerator'
import { createUniqueHazardRecord, formatHazardRecord, type HazardRecord } from './hazardGenerator'

const HIGH_LEVEL_CONTRACT_MONSTER_LEVEL = 10

type RoomEncounterCycle = Pick<MissionCycle, 'challenge' | 'routeA' | 'dangerEntries' | 'emptyRoomIds'>

export interface RoomEncounterMission {
  cycles: readonly RoomEncounterCycle[]
}

export interface RoomEncounterRoomInput {
  id: string
  missionNodeId?: string
  realized: boolean
}

export interface RoomEncounterRoomDraft {
  id: string
  missionNodeId?: string
  encounters: RoomEncounter[]
}

export interface RoomEncounterPreparation {
  dungeonLevelBudget: DungeonLevelBudget
  monsterEncounterTable: MonsterRecord[]
  generalNote: string
  rooms: RoomEncounterRoomDraft[]
  highLevelContractCycles: RoomEncounterCycle[]
  highLevelContractMonsterCandidates: MonsterRecord[]
}

export interface RoomEncounterRoomResult {
  id: string
  encounter: RoomEncounter
  encounters: RoomEncounter[]
  generatedDetails: string[]
  monsterDetails: MonsterRecord[]
  monsterEncounterGroups: MonsterEncounterGroupWithContext[]
  trapDetails: TrapRecord[]
  hazardDetails: HazardRecord[]
}

export interface RoomEncounterResolution {
  rooms: RoomEncounterRoomResult[]
  monsterLevelsUsed: number
  monsterRejections: MonsterRejection[]
}

/** The danger pool used by mission contracts unless a contract narrows it. */
export const DANGER_KINDS: readonly DangerKind[] = ['monster', 'trap', 'hazard']

const ROOM_POPULATION_TABLE: readonly { kind: RoomEncounter; weight: number }[] = [
  { kind: 'empty', weight: 5 },
  { kind: 'monster', weight: 3 },
  { kind: 'trap', weight: 1 },
  { kind: 'hazard', weight: 1 },
]

export function rollRoomEncounter(random: Pick<D6Random, 'nextD10'>): RoomEncounter {
  let roll = random.nextD10()
  for (const entry of ROOM_POPULATION_TABLE) {
    if (roll <= entry.weight) return entry.kind
    roll -= entry.weight
  }
  return 'empty'
}

export function resolveDangerKind(entry: DangerEntry, sequenceIndex: number): DangerKind {
  const kinds = entry.kinds === 'all' || entry.kinds.length === 0 ? DANGER_KINDS : entry.kinds
  return kinds[sequenceIndex % kinds.length]!
}

function roomPlaceableHighLevelContractMonsters(table: readonly MonsterRecord[], budget: DungeonLevelBudget): MonsterRecord[] {
  const candidates = table.filter(monster => {
    const level = numericMonsterLevel(monster)
    return level !== null && level >= HIGH_LEVEL_CONTRACT_MONSTER_LEVEL && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.dungeonBudget
  })
  if (candidates.length === 0) return []
  const lowestCost = Math.min(...candidates.map(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget)))
  return candidates.filter(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget) === lowestCost)
}

function ensureHighLevelContractMonsterOnTable(random: D6Random, table: MonsterRecord[], budget: DungeonLevelBudget): MonsterRecord[] {
  let candidates = roomPlaceableHighLevelContractMonsters(table, budget)
  if (candidates.length > 0) return candidates

  // A high-level danger contract is allowed to add its required entry to the
  // otherwise unrestricted table. Prefer the lowest-level qualifying catalog
  // entry so the contract can fit every dungeon-level budget band.
  const catalogCandidates = MONSTER_CATALOG.filter(monster => {
    const level = numericMonsterLevel(monster)
    return !table.includes(monster) && level !== null && level >= HIGH_LEVEL_CONTRACT_MONSTER_LEVEL && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.dungeonBudget
  })
  if (catalogCandidates.length === 0) return []
  const lowestCost = Math.min(...catalogCandidates.map(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget)))
  const qualifyingCatalogCandidates = catalogCandidates.filter(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget) === lowestCost)
  const requiredMonster = pickRandomMonsterFromTable(random, qualifyingCatalogCandidates)
  table[table.length - 1] = requiredMonster
  candidates = roomPlaceableHighLevelContractMonsters(table, budget)
  return candidates
}

function highLevelContractMonstersForManualTable(table: readonly MonsterRecord[], budget: DungeonLevelBudget): MonsterRecord[] {
  const fromTable = roomPlaceableHighLevelContractMonsters(table, budget)
  if (fromTable.length > 0) return fromTable

  // Keep a user-authored table intact while still satisfying a mission's
  // required high-level danger contract with a separate featured monster.
  const tableNames = new Set(table.map(monster => monster.name.toLocaleLowerCase()))
  const catalogCandidates = MONSTER_CATALOG.filter(monster => {
    const level = numericMonsterLevel(monster)
    return !tableNames.has(monster.name.toLocaleLowerCase()) && level !== null && level >= HIGH_LEVEL_CONTRACT_MONSTER_LEVEL && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.dungeonBudget
  })
  if (catalogCandidates.length === 0) return []
  const lowestCost = Math.min(...catalogCandidates.map(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget)))
  return catalogCandidates.filter(monster => minimumMonsterEncounterCost(numericMonsterLevel(monster)!, budget.encounterBudget) === lowestCost)
}

function createAmbientMonsterRoster(random: D6Random, budget: DungeonLevelBudget): MonsterRecord[] {
  const tierCandidates = MONSTER_CATALOG.filter(monster => monsterFitsLevelBudget(monster, budget))
  const standardEncounterCandidates = tierCandidates.filter(monster => {
    const level = numericMonsterLevel(monster)
    return level !== null && minimumMonsterEncounterCost(level, budget.encounterBudget) <= budget.encounterBudget
  })
  const candidates = standardEncounterCandidates.length >= 5 ? standardEncounterCandidates : tierCandidates
  return createMonsterEncounterTable(random, 5, candidates)
}

/**
 * Rolls the dungeon's room roster and initial room categories before Space
 * Grammar consumes the shared stream for corridor conditions and doors.
 */
export function prepareRoomEncounters(
  request: Pick<GenerationRequest, 'seed' | 'playerLevel' | 'monsterEncounterTable'>,
  mission: RoomEncounterMission,
  rooms: readonly RoomEncounterRoomInput[],
  random: D6Random,
): RoomEncounterPreparation {
  const dungeonLevelBudget = resolveDungeonLevelBudget(request.playerLevel)
  // Keep lower-tier monsters eligible in higher-level dungeons, and prefer
  // roster entries that can fill one standard encounter before assigning them.
  const hasManualMonsterEncounterTable = request.monsterEncounterTable !== undefined
  const monsterEncounterTable = hasManualMonsterEncounterTable
    ? [...request.monsterEncounterTable!]
    : createAmbientMonsterRoster(random, dungeonLevelBudget)
  const highLevelContractCycles = mission.cycles.filter(cycle => cycle.challenge === 'dangerous-route' || cycle.challenge === 'patrolled-cycle' || cycle.challenge === 'gambit')
  const highLevelContractMonsterCandidates = highLevelContractCycles.length > 0
    ? hasManualMonsterEncounterTable
      ? highLevelContractMonstersForManualTable(monsterEncounterTable, dungeonLevelBudget)
      : ensureHighLevelContractMonsterOnTable(random, monsterEncounterTable, dungeonLevelBudget)
    : []
  const generalNote = [
    'Random Encounter Table:',
    '1. Torch extinguished',
    ...monsterEncounterTable.map((monster, index) => {
      const entry = `${index + 2}. ${monsterCountDiceNotation(numericMonsterLevel(monster) ?? 1, dungeonLevelBudget.encounterBudget)} ${monster.name} (LV ${monster.level})`
      return hasManualMonsterEncounterTable && monster.flavor.trim() ? `${entry}\n${monster.flavor.trim()}` : entry
    }),
  ].join('\n')
  const preparedRooms = rooms.map(room => {
    const rolledEncounter = room.realized ? rollRoomEncounter(random) : 'empty'
    return {
      id: room.id,
      ...(room.missionNodeId ? { missionNodeId: room.missionNodeId } : {}),
      encounters: rolledEncounter === 'empty' ? [] : [rolledEncounter],
    }
  })

  return {
    dungeonLevelBudget,
    monsterEncounterTable,
    generalNote,
    rooms: preparedRooms,
    highLevelContractCycles,
    highLevelContractMonsterCandidates,
  }
}

function applyMissionRoomDirectives(mission: RoomEncounterMission, rooms: RoomEncounterRoomDraft[]): void {
  const directives = new Map<string, { dangerEntries: DangerEntry[]; empty: boolean }>()
  for (const cycle of mission.cycles) {
    for (const nodeId of cycle.emptyRoomIds) {
      const directive = directives.get(nodeId) ?? { dangerEntries: [], empty: false }
      directive.empty = true
      directives.set(nodeId, directive)
    }
    for (const entry of cycle.dangerEntries) {
      const directive = directives.get(entry.nodeId) ?? { dangerEntries: [], empty: false }
      directive.dangerEntries.push(entry)
      directives.set(entry.nodeId, directive)
    }
  }

  let dangerSequenceIndex = 0
  for (const room of rooms) {
    const nodeId = room.missionNodeId
    if (!nodeId) continue
    const directive = directives.get(nodeId)
    if (!directive) continue
    if (directive.empty) {
      room.encounters = []
      continue
    }
    const encounters: RoomEncounter[] = []
    for (const entry of directive.dangerEntries) {
      for (let index = 0; index < entry.count; index += 1) encounters.push(resolveDangerKind(entry, dangerSequenceIndex++))
    }
    room.encounters = encounters
  }
}

/**
 * Applies Mission room directives and resolves monster, trap, and hazard data
 * after Space Grammar has consumed the intervening corridor rolls.
 */
export function resolveRoomEncounters(
  request: Pick<GenerationRequest, 'seed'>,
  mission: RoomEncounterMission,
  preparation: RoomEncounterPreparation,
  random: D6Random,
): RoomEncounterResolution {
  const rooms = preparation.rooms.map(room => ({ ...room, encounters: [...room.encounters] }))
  applyMissionRoomDirectives(mission, rooms)

  const contractMonsterAssignments = new Map<string, MonsterRecord[]>()
  if (preparation.highLevelContractCycles.length > 0) {
    for (const cycle of preparation.highLevelContractCycles) {
      const routeRooms = cycle.routeA.slice(1, -1).map(nodeId => rooms.find(candidate => candidate.missionNodeId === nodeId)).filter((room): room is RoomEncounterRoomDraft => Boolean(room))
      const room = routeRooms.find(candidate => candidate.encounters.includes('monster')) ?? routeRooms[0]
      const nodeId = room?.missionNodeId
      const selectedMonster = preparation.highLevelContractMonsterCandidates.length > 0 ? pickRandomMonsterFromTable(random, preparation.highLevelContractMonsterCandidates) : undefined
      if (!room || !nodeId || !selectedMonster) continue
      const assignments = contractMonsterAssignments.get(nodeId) ?? []
      assignments.push(selectedMonster)
      contractMonsterAssignments.set(nodeId, assignments)
      // Put the required contract encounter ahead of any ambient result that
      // was already rolled for this room. If the contract route already has a
      // monster encounter, upgrade that encounter instead of adding another
      // one so route-balance contracts retain their intended counts.
      if (!room.encounters.includes('monster')) room.encounters = ['monster', ...room.encounters]
    }
  }

  let monsterLevelsUsed = 0
  const forcedDangerNodes = new Set(mission.cycles.flatMap(cycle => cycle.dangerEntries.map(entry => entry.nodeId)))
  const roomsByMonsterPriority = [...rooms].sort((left, right) => {
    const leftNodeId = left.missionNodeId ?? ''
    const rightNodeId = right.missionNodeId ?? ''
    const leftPriority = contractMonsterAssignments.has(leftNodeId) ? 0 : left.encounters.includes('monster') && forcedDangerNodes.has(leftNodeId) ? 1 : 2
    const rightPriority = contractMonsterAssignments.has(rightNodeId) ? 0 : right.encounters.includes('monster') && forcedDangerNodes.has(rightNodeId) ? 1 : 2
    return leftPriority - rightPriority
  })
  const monsterRoomCount = roomsByMonsterPriority.filter(room => room.encounters.includes('monster')).length
  let monsterRoomsRemaining = monsterRoomCount
  const usedAmbientMonsters = new Set<MonsterRecord>()
  const monsterRejections: MonsterRejection[] = []
  const roomHazardNames = new Set<string>()
  const resolvedRooms = new Map<string, RoomEncounterRoomResult>()

  for (const room of roomsByMonsterPriority) {
    const resolvedEncounters: RoomEncounter[] = []
    const monsterGroups: MonsterEncounterGroupWithContext[] = []
    const monsterDetails: MonsterRecord[] = []
    const contractMonsters = contractMonsterAssignments.get(room.missionNodeId ?? '') ?? []
    const hasMonsterRoom = room.encounters.includes('monster')
    const futureMonsterRooms = Math.max(0, monsterRoomsRemaining - (hasMonsterRoom ? 1 : 0))
    let contractMonsterIndex = 0
    for (const encounter of room.encounters) {
      if (encounter !== 'monster') {
        resolvedEncounters.push(encounter)
        continue
      }
      const isMissionContractMonster = forcedDangerNodes.has(room.missionNodeId ?? '') || contractMonsterAssignments.has(room.missionNodeId ?? '')
      // Mission-directed danger is a required contract, so it gets a complete
      // encounter even when ambient rooms have already spent the dungeon pool.
      // Ordinary random monster rooms remain hard-capped by that pool.
      const remainingDungeonBudget = isMissionContractMonster ? Number.MAX_SAFE_INTEGER : preparation.dungeonLevelBudget.dungeonBudget - monsterLevelsUsed
      const reservedDungeonBudget = isMissionContractMonster ? 0 : futureMonsterRooms * preparation.dungeonLevelBudget.encounterBudget
      const availableDungeonBudget = isMissionContractMonster
        ? Number.MAX_SAFE_INTEGER
        : remainingMonsterRoomBudget(preparation.dungeonLevelBudget.dungeonBudget, monsterLevelsUsed, preparation.dungeonLevelBudget.encounterBudget, futureMonsterRooms)
      const contractMonster = contractMonsterIndex < contractMonsters.length ? contractMonsters[contractMonsterIndex++] : undefined
      const affordableMonsters = preparation.monsterEncounterTable.filter(monster => {
        const level = numericMonsterLevel(monster)
        return level !== null && minimumMonsterEncounterCost(level, preparation.dungeonLevelBudget.encounterBudget) <= availableDungeonBudget
      })
      const unusedAffordableMonsters = affordableMonsters.filter(monster => !usedAmbientMonsters.has(monster))
      const selectedMonster = contractMonster ?? (unusedAffordableMonsters.length > 0
        ? pickRandomMonsterFromTable(random, unusedAffordableMonsters)
        : affordableMonsters.length > 0 ? pickRandomMonsterFromTable(random, affordableMonsters) : undefined)
      const group = selectedMonster
        ? rollMonsterEncounter(selectedMonster, preparation.dungeonLevelBudget.encounterBudget, remainingDungeonBudget)
        : null
      if (!group) {
        const minimumRequiredLevel = Math.min(...preparation.monsterEncounterTable.map(monster => {
          const level = numericMonsterLevel(monster)
          return level === null ? Number.MAX_SAFE_INTEGER : minimumMonsterEncounterCost(level, preparation.dungeonLevelBudget.encounterBudget)
        }))
        monsterRejections.push({
          moduleId: room.id,
          ...(room.missionNodeId ? { missionNodeId: room.missionNodeId } : {}),
          candidateMonsters: (affordableMonsters.length > 0 ? [selectedMonster?.name ?? 'Selected monster'] : preparation.monsterEncounterTable.map(monster => monster.name)),
          remainingDungeonBudget: Math.max(0, remainingDungeonBudget),
          reservedDungeonBudget,
          availableDungeonBudget: Math.max(0, availableDungeonBudget),
          futureMonsterRooms,
          encounterBudget: preparation.dungeonLevelBudget.encounterBudget,
          minimumRequiredLevel,
          reason: 'insufficient-dungeon-budget',
        })
        continue
      }
      resolvedEncounters.push('monster')
      monsterGroups.push({
        ...group,
        context: createMonsterRoomContext(createD6Random(`${normalizeSeed(request.seed)}:room-monster:${room.id}:${monsterGroups.length}`)),
      })
      monsterDetails.push(group.monster)
      if (!contractMonster) usedAmbientMonsters.add(group.monster)
      monsterLevelsUsed += group.levelTotal
    }
    if (hasMonsterRoom) monsterRoomsRemaining -= 1
    const encounter = resolvedEncounters[0] ?? 'empty'
    const trapDetails = resolvedEncounters.flatMap(kind => kind === 'trap' ? [createTrapRecord(random)] : [])
    const hazardDetails = resolvedEncounters.flatMap(kind => {
      if (kind !== 'hazard') return []
      const hazard = createUniqueHazardRecord(random, roomHazardNames)
      roomHazardNames.add(hazard.name)
      return [hazard]
    })
    let trapIndex = 0
    let hazardIndex = 0
    let monsterIndex = 0
    const generatedDetails = encounter === 'empty'
      ? ['Empty room.']
      : resolvedEncounters.flatMap(kind => {
        if (kind === 'monster') {
          const group = monsterGroups[monsterIndex++]!
          return [
            `Monster: ${group.count} ${group.monster.name.toLowerCase()} (LV ${group.monster.level})${group.monster.flavor ? `\n${group.monster.flavor}` : ''}`,
            ...formatMonsterRoomContext(group.context),
          ]
        }
        if (kind === 'trap') return [formatTrapRecord(trapDetails[trapIndex++]!)]
        if (kind === 'hazard') return [formatHazardRecord(hazardDetails[hazardIndex++]!)]
        return []
      })

    resolvedRooms.set(room.id, {
      id: room.id,
      encounter,
      encounters: resolvedEncounters,
      generatedDetails,
      monsterDetails,
      monsterEncounterGroups: monsterGroups,
      trapDetails,
      hazardDetails,
    })
  }

  return {
    rooms: rooms.map(room => resolvedRooms.get(room.id)!),
    monsterLevelsUsed,
    monsterRejections,
  }
}
