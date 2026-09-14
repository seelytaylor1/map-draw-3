import type { D6Random } from './random'
import type { BeyondDoorway, DoorCondition, DoorwayCategory, DungeonType, ExitType, FeatureType, HallwayCondition, IntersectionKind, IrregularSubtype, RoomExitKind, RoomShape, StartingLocation, VerticalContent } from './types'

const bySix = <T>(random: D6Random, values: readonly T[]): T => values[random.nextD6() - 1]!
export const DUNGEON_TYPES: readonly DungeonType[] = ['Caves', 'Tombs', 'Ruins']
export const STARTING_LOCATIONS: readonly StartingLocation[] = ['center', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'random']
export const STARTING_ROOM_SHAPES: readonly RoomShape[] = ['square', 'large-square', 'rectangle', 'circular', 'cave-opening', 'cavern']

export function rollDungeonType(random: D6Random): DungeonType {
  const roll = random.nextD6()
  return roll <= 2 ? 'Caves' : roll <= 4 ? 'Tombs' : 'Ruins'
}

export function rollStartingLocation(random: D6Random): StartingLocation {
  const roll = random.nextD6()
  if (roll < 6) return STARTING_LOCATIONS[roll - 1]!
  // Roll 6 remains the semantic `random` result. The generator then consumes
  // two visible D6 values for a stable bounded coordinate rule; it never
  // fit-searches or silently rerolls a candidate.
  return 'random'
}

export function rollStartingRoom(random: D6Random): RoomShape { return bySix(random, STARTING_ROOM_SHAPES) }

export function rollRoomExits(random: D6Random): RoomExitKind { return bySix(random, ['doorway', 'opposite-doorways', 'three-doorways', 'three-doorways', 'three-and-secret', 'three-and-secret']) }
export function rollExitType(random: D6Random): ExitType { return bySix(random, ['doorway', 'doorway', 'room', 'room', 'room', 'hallway']) }
export function rollDoorway(random: D6Random): DoorwayCategory { return bySix(random, ['wooden', 'stone', 'exotic', 'archway', 'portcullis', 'collapsed']) }

export function rollDoorCondition(random: D6Random, doorway: DoorwayCategory): DoorCondition {
  const roll = random.nextD6()
  if (roll <= 2) return 'open'
  if (roll === 3) return 'stuck/blocked'
  // Archways have no lock result in the source table. Keep the roll visible
  // while resolving the exception to an open archway.
  if (roll === 4) return doorway === 'archway' ? 'open' : 'locked'
  if (roll === 5) return 'secret'
  return random.nextD6() <= 3 ? 'locked + trapped' : 'trapped'
}

export function rollBeyondDoorway(random: D6Random): BeyondDoorway { return bySix(random, ['hallway', 'room', 'room', 'room', 'room', 'vertical']) }
export function rollVerticalContent(random: D6Random): VerticalContent { return bySix(random, ['staircase', 'staircase', 'shaft', 'shaft', 'ramp', 'ramp']) }
export function rollIntersection(random: D6Random): IntersectionKind { const roll = random.nextD6(); return roll <= 2 ? 'T-intersection' : roll <= 4 ? 'four-way crossroad' : 'Y-intersection' }
export function rollIntersectionBranch(random: D6Random): 'hallway' | 'doorway' { return random.nextD6() <= 3 ? 'hallway' : 'doorway' }
export function rollHallway(random: D6Random): 1 | 2 | 3 | 4 | 5 | 6 { return random.nextD6() as 1 | 2 | 3 | 4 | 5 | 6 }
export function rollLeftOrRight(random: D6Random): 'left' | 'right' { return random.nextD6() <= 3 ? 'left' : 'right' }
export function rollHallwayCondition(random: D6Random): HallwayCondition | 'width-reroll' | 'difficult' {
  const roll = random.nextD6()
  if (roll <= 2) return 'width-reroll'
  if (roll <= 4) return 'open'
  if (roll === 5) return 'difficult'
  return 'hazard'
}
export function rollDifficultHallwayCondition(random: D6Random): HallwayCondition { return bySix(random, ['flooded', 'flooded', 'collapsed', 'collapsed', 'converted', 'converted']) }
export function rollRoom(random: D6Random): RoomShape { return bySix(random, ['square', 'rectangle', 'circular', 'irregular-chamber', 'natural-cavern', 'underground-feature']) }
export function rollIrregularSubtype(random: D6Random): IrregularSubtype { return bySix(random, ['letter-shaped', 'polygonal', 'trapezoidal', 'cornered', 'natural-cavern', 'underground-feature']) }
export function rollFeature(random: D6Random): FeatureType { return bySix(random, ['chasm', 'underground-river', 'gas-filled', 'random-spell', 'stalagmite-grove', 'stalactite-grove']) }
