import type { MonsterRecord } from './monsterCatalog'

export interface DungeonLevelBudget {
  playerLevelMin: number
  playerLevelMax: number
  monsterLevelMin: number
  monsterLevelMax: number | null
  monsterLevelLabel: string
  levelsPerPlayer: number
  encounterBudget: number
  dungeonBudget: number
}

export interface MonsterEncounterGroup {
  monster: MonsterRecord
  count: number
  monsterLevel: number
  levelTotal: number
  encounterBudget: number
  overBudget: number
}

export interface MonsterRejection {
  moduleId: string
  missionNodeId?: string
  candidateMonsters: string[]
  remainingDungeonBudget: number
  reservedDungeonBudget: number
  availableDungeonBudget: number
  futureMonsterRooms: number
  encounterBudget: number
  minimumRequiredLevel: number
  reason: 'insufficient-dungeon-budget'
}

const LEVEL_BUDGETS: readonly DungeonLevelBudget[] = [
  { playerLevelMin: 1, playerLevelMax: 3, monsterLevelMin: 0, monsterLevelMax: 3, monsterLevelLabel: '0-3', levelsPerPlayer: 1, encounterBudget: 4, dungeonBudget: 20 },
  { playerLevelMin: 4, playerLevelMax: 6, monsterLevelMin: 4, monsterLevelMax: 6, monsterLevelLabel: '4-6', levelsPerPlayer: 3, encounterBudget: 12, dungeonBudget: 60 },
  { playerLevelMin: 7, playerLevelMax: 9, monsterLevelMin: 7, monsterLevelMax: 9, monsterLevelLabel: '7-9', levelsPerPlayer: 5, encounterBudget: 20, dungeonBudget: 100 },
  { playerLevelMin: 10, playerLevelMax: 10, monsterLevelMin: 10, monsterLevelMax: 10, monsterLevelLabel: '10', levelsPerPlayer: 7, encounterBudget: 28, dungeonBudget: 140 },
]

export const DUNGEON_LEVEL_BUDGETS = LEVEL_BUDGETS

export function getDungeonLevelBudget(playerLevel: number): DungeonLevelBudget {
  if (!Number.isInteger(playerLevel) || playerLevel < 1 || playerLevel > 10) {
    throw new RangeError('Dungeon level must be an integer from 1 to 10.')
  }
  return LEVEL_BUDGETS.find(budget => playerLevel >= budget.playerLevelMin && playerLevel <= budget.playerLevelMax)!
}

export function resolveDungeonLevelBudget(playerLevel: number | undefined): DungeonLevelBudget {
  return getDungeonLevelBudget(Number.isInteger(playerLevel) && playerLevel! >= 1 && playerLevel! <= 10 ? playerLevel! : 1)
}

export function numericMonsterLevel(monster: MonsterRecord): number | null {
  return typeof monster.level === 'number' && Number.isFinite(monster.level) && monster.level >= 0 ? monster.level : null
}

export function monsterFitsLevelBudget(monster: MonsterRecord, budget: DungeonLevelBudget): boolean {
  const level = numericMonsterLevel(monster)
  return level !== null && level >= budget.monsterLevelMin && (budget.monsterLevelMax === null || level <= budget.monsterLevelMax)
}

export function minimumMonsterEncounterCost(monsterLevel: number, encounterBudget: number): number {
  const cost = Math.max(1, monsterLevel)
  return Math.ceil(encounterBudget / cost) * cost
}

const MONSTER_QUANTITY_DICE = [
  { count: 1, sides: 2 },
  { count: 1, sides: 3 },
  { count: 1, sides: 4 },
  { count: 1, sides: 6 },
  { count: 1, sides: 8 },
  { count: 1, sides: 10 },
  { count: 1, sides: 12 },
  { count: 2, sides: 3 },
  { count: 2, sides: 4 },
  { count: 2, sides: 8 },
  { count: 2, sides: 10 },
] as const

/**
 * Choose a quantity roll whose expected creature count is close to the
 * encounter budget divided by the monster's level.
 */
export function monsterCountDiceNotation(monsterLevel: number, encounterBudget: number): string {
  const cost = Math.max(1, monsterLevel)
  const targetCount = Math.max(0, encounterBudget) / cost
  const best = MONSTER_QUANTITY_DICE.reduce((selected, candidate) => {
    const average = candidate.count * (candidate.sides + 1) / 2
    const difference = Math.abs(average - targetCount)
    const selectedAverage = selected.count * (selected.sides + 1) / 2
    const selectedDifference = Math.abs(selectedAverage - targetCount)
    return difference < selectedDifference || (difference === selectedDifference && average > selectedAverage)
      ? candidate
      : selected
  })

  return `${best.count === 1 ? '' : best.count}d${best.sides}`
}

/**
 * Keep one standard encounter's worth of dungeon budget available for each
 * future monster room before allowing the current room to spend the surplus.
 */
export function remainingMonsterRoomBudget(
  dungeonBudget: number,
  monsterLevelsUsed: number,
  encounterBudget: number,
  futureMonsterRooms: number,
): number {
  return Math.max(0, dungeonBudget - monsterLevelsUsed - encounterBudget * futureMonsterRooms)
}

/**
 * Roll a single monster group. The group contains the fewest whole monsters
 * needed to reach the encounter target, so its total may exceed the target.
 * The remaining dungeon budget is the hard ceiling for the actual group.
 */
export function rollMonsterEncounter(
  monster: MonsterRecord,
  encounterBudget: number,
  remainingDungeonBudget: number,
): MonsterEncounterGroup | null {
  const monsterLevel = numericMonsterLevel(monster)
  if (monsterLevel === null || encounterBudget < 1 || remainingDungeonBudget < encounterBudget) return null

  const cost = Math.max(1, monsterLevel)
  const maxCount = Math.floor(remainingDungeonBudget / cost)
  const minimumCount = Math.ceil(encounterBudget / cost)
  if (maxCount < minimumCount) return null
  const count = minimumCount
  const levelTotal = count * cost

  return {
    monster,
    count,
    monsterLevel,
    levelTotal,
    encounterBudget,
    overBudget: Math.max(0, levelTotal - encounterBudget),
  }
}
