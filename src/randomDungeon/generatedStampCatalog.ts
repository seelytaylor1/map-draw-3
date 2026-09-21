import type { StampType } from '../stamps'
import type { GeneratedMarkerSemantic } from './commonTypes'
import type { DoorwayStyle } from './missionTypes'

export const GENERATED_MARKER_STAMP_TYPES = {
  hub: ['Altar1x1', 'CircleFilled1x1', 'Circle1x1'],
  key: ['Key1x1'],
  lock: ['DoorLocked1x1'],
  secret: ['DoorSecret1x1', 'DoorConcealed1x1', 'secret-door'],
  danger: ['Danger1x1', 'Trap1x1', 'trap'],
  'blocked-return': ['DoorConcealed1x1', 'DoorFalse1x1', 'Unknown1x1', 'SquareFilled1x1'],
  'one-way': ['DoorRevolve1way1x1', 'DoorRevolving1x1', 'Door1x1', 'door'],
} as const satisfies Record<GeneratedMarkerSemantic, readonly StampType[]>

export const GENERATED_DOORWAY_STAMP_TYPES = {
  single: ['Door1x1', 'door'],
  double: ['DoorDouble1x1'],
  locked: ['DoorLocked1x1'],
  trapdoor: ['TrapdoorFloor1x1'],
  portcullis: ['DoorPortcullis1x1'],
  revolving: ['DoorRevolving1x1'],
  secret: ['DoorSecret1x1'],
  magic: ['DoorMagic1x1'],
  'ladder-down': ['LadderDown1x1'],
  'ladder-up': ['LadderUp1x1'],
  stairs: ['Stairs1x1_01'],
  'spiral-stairs': ['StairSpiralSquareDown1x1'],
  window: ['Window1x1'],
  archway: ['DoorArchway1x1'],
  curtain: ['Curtain1x1'],
} as const satisfies Record<DoorwayStyle, readonly StampType[]>

export const GENERATED_DECORATION_STAMP_TYPES = {
  hallwayTrap: ['Trap1x1'],
  hallwayHazard: ['Danger1x1'],
  monster: ['TriangleArrowhead1x1'],
  roomTrap: ['Trap1x1'],
  roomHazard: ['Danger1x1'],
  treasure: ['Chest1x1'],
} as const satisfies Record<string, readonly StampType[]>

type StampTypesIn<T> = T[keyof T] extends readonly (infer Stamp)[] ? Stamp : never

export type GeneratedStampType =
  | StampTypesIn<typeof GENERATED_MARKER_STAMP_TYPES>
  | StampTypesIn<typeof GENERATED_DOORWAY_STAMP_TYPES>
  | StampTypesIn<typeof GENERATED_DECORATION_STAMP_TYPES>

export const GENERATED_STAMP_TYPES = [...new Set([
  ...Object.values(GENERATED_MARKER_STAMP_TYPES).flat(),
  ...Object.values(GENERATED_DOORWAY_STAMP_TYPES).flat(),
  ...Object.values(GENERATED_DECORATION_STAMP_TYPES).flat(),
])] as GeneratedStampType[]
