import type { D6Random } from './random'
import type { MonsterEncounterGroup } from './monsterBudget'

export type MonsterActivityCategory =
  | 'Hunting'
  | 'Eating'
  | 'Building / Nesting'
  | 'Socializing / Playing'
  | 'Guarding'
  | 'Sleeping'

export type MonsterReactionCategory = 'Hostile' | 'Suspicious' | 'Neutral' | 'Curious' | 'Friendly'

export interface MonsterRoomContext {
  activity: {
    category: MonsterActivityCategory
    expression: string
  }
  reaction: {
    category: MonsterReactionCategory
    expression: string
  }
}

export type MonsterEncounterGroupWithContext = MonsterEncounterGroup & { context: MonsterRoomContext }

interface ActivityEntry {
  expression: string
}

const activities: ReadonlyArray<{ category: MonsterActivityCategory; entries: readonly ActivityEntry[] }> = [
  {
    category: 'Hunting',
    entries: [
      { expression: 'tracking' },
      { expression: 'scouting' },
      { expression: 'searching' },
      { expression: 'pursuing' },
      { expression: 'foraging' },
      { expression: 'raiding' },
    ],
  },
  {
    category: 'Eating',
    entries: [
      { expression: 'drinking' },
      { expression: 'resting' },
      { expression: 'tending wounds' },
      { expression: 'dividing spoils' },
      { expression: 'feeding' },
    ],
  },
  {
    category: 'Building / Nesting',
    entries: [
      { expression: 'repairing' },
      { expression: 'excavating' },
      { expression: 'fortifying' },
      { expression: 'making camp' },
      { expression: 'maintaining equipment' },
      { expression: 'preparing a site' },
    ],
  },
  {
    category: 'Socializing / Playing',
    entries: [
      { expression: 'arguing' },
      { expression: 'boasting' },
      { expression: 'gambling' },
      { expression: 'training' },
      { expression: 'celebrating' },
      { expression: 'competing' },
    ],
  },
  {
    category: 'Guarding',
    entries: [
      { expression: 'patrolling' },
      { expression: 'watching' },
      { expression: 'escorting' },
      { expression: 'standing sentry' },
      { expression: 'protecting' },
      { expression: 'waiting' },
    ],
  },
  {
    category: 'Sleeping',
    entries: [
      { expression: 'exhausted' },
      { expression: 'drunk' },
      { expression: 'magically dormant' },
      { expression: 'unconscious' },
      { expression: 'meditating' },
    ],
  },
]

interface ReactionEntry {
  expression: string
}

const reactions: ReadonlyArray<{ category: MonsterReactionCategory; entries: readonly ReactionEntry[] }> = [
  {
    category: 'Hostile',
    entries: [
      { expression: 'aggressive' },
      { expression: 'threatening' },
      { expression: 'predatory' },
      { expression: 'territorial' },
      { expression: 'belligerent' },
      { expression: 'vengeful' },
    ],
  },
  {
    category: 'Suspicious',
    entries: [
      { expression: 'wary' },
      { expression: 'guarded' },
      { expression: 'defensive' },
      { expression: 'watchful' },
      { expression: 'distrustful' },
      { expression: 'apprehensive' },
    ],
  },
  {
    category: 'Neutral',
    entries: [
      { expression: 'indifferent' },
      { expression: 'pragmatic' },
      { expression: 'preoccupied' },
      { expression: 'detached' },
      { expression: 'unconcerned' },
      { expression: 'businesslike' },
    ],
  },
  {
    category: 'Curious',
    entries: [
      { expression: 'intrigued' },
      { expression: 'questioning' },
      { expression: 'assessing' },
      { expression: 'fascinated' },
      { expression: 'receptive' },
    ],
  },
  {
    category: 'Friendly',
    entries: [
      { expression: 'cooperative' },
      { expression: 'respectful' },
      { expression: 'welcoming' },
      { expression: 'sympathetic' },
      { expression: 'approving' },
      { expression: 'helpful' },
    ],
  },
]

function pick<T>(random: D6Random, entries: readonly T[]): T {
  const sides = entries.length === 5 ? 10 : 6
  const roll = sides === 10 ? random.nextD10() : random.nextD6()
  return entries[Math.floor((roll - 1) * entries.length / sides)]!
}

export function createMonsterRoomContext(random: D6Random): MonsterRoomContext {
  const activity = pick(random, activities)
  const reaction = reactions[Math.ceil(random.nextD10() / 2) - 1]!
  return {
    activity: { category: activity.category, ...pick(random, activity.entries) },
    reaction: { category: reaction.category, ...pick(random, reaction.entries) },
  }
}

export function formatMonsterRoomContext(context: MonsterRoomContext): string[] {
  return [
    `Activity: ${context.activity.category} — ${context.activity.expression}.`,
    `Reaction: ${context.reaction.category} — ${context.reaction.expression}.`,
  ]
}
