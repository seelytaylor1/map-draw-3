import type { D6Random } from './random'
import type { DangerEntry, DangerKind, RoomEncounter } from './missionTypes'

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
