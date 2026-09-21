import type { D6Random } from './random'

export type TrapPattern = 'hidden' | 'tell' | 'obvious'

export interface TrapRecord {
  pattern: TrapPattern
  tell: string
  trigger: string
  attack: string
  effect: string
}

const HIDDEN_TRAP_TELLS = [
  'unique furnishing',
  'nature of the room',
  'unique symbol',
  'particular color',
  'particular sound',
  'particular odour',
] as const

const TRAP_WITH_TELL = [
  'the corpse or skeleton of a past victim',
  'remnants of previous triggers',
  'part of the mechanism showing',
  'the trap was just activated by something',
  'a particular sound',
  'a unique odour',
] as const

const TRIGGERS = ['stepped on', 'noise', 'proximity', 'touched', 'looked at', 'moved or opened'] as const

const ATTACKS = [
  'blade', 'bludgeon', 'skewer', 'crush', 'fling', 'projectile',
  'gas', 'spore', 'oil', 'steam', 'gel', 'dust',
  'pit', 'drop', 'lock', 'sucked', 'pushed', 'blocked',
  'fire', 'ice', 'water', 'sand', 'mud', 'air',
  'arcane', 'curse', 'divine', 'clockwork', 'poison', 'magma',
  'rocks', 'roots', 'boulder', 'void', 'blood', 'chaos',
] as const

const EFFECTS = ['attacks the body', 'attacks light', 'restrains', 'alarms', 'attacks wealth', 'attacks dungeon navigation'] as const

function pick<T>(random: D6Random, values: readonly T[]): T {
  return values[random.nextD6() - 1]!
}

function attack(random: D6Random): string {
  const row = random.nextD6()
  const column = random.nextD6()
  return ATTACKS[(row - 1) * 6 + column - 1]!
}

export function createTrapRecord(random: D6Random): TrapRecord {
  const patternRoll = random.nextD6()
  const pattern: TrapPattern = patternRoll === 1 ? 'hidden' : patternRoll === 6 ? 'obvious' : 'tell'
  const tell = pattern === 'hidden' ? pick(random, HIDDEN_TRAP_TELLS) : pattern === 'tell' ? pick(random, TRAP_WITH_TELL) : 'the trap is currently in operation'
  const trigger = pattern === 'obvious' ? 'always triggered' : pick(random, TRIGGERS)
  return { pattern, tell, trigger, attack: attack(random), effect: pick(random, EFFECTS) }
}

export function formatTrapRecord(record: TrapRecord): string {
  const pattern = record.pattern === 'hidden' ? 'Hidden Trap' : record.pattern === 'tell' ? 'Trap with Tell' : 'Obvious Trap'
  return `Trap: ${pattern}. Tell: ${record.tell}. Trigger: ${record.trigger}. Attack: ${record.attack}. Effect: ${record.effect}.`
}
