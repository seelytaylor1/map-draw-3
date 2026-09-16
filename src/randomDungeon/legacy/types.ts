import type { StampType, Rotation } from '../../stamps'
import type { AppSnapshotShape, Direction, Point } from '../commonTypes'

export type { AppSnapshotShape, Direction, Point } from '../commonTypes'

export type DungeonType = 'Caves' | 'Tombs' | 'Ruins'
export type StartingLocation = 'center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'random'
export type RoomShape = 'square' | 'large-square' | 'rectangle' | 'circular' | 'cave-opening' | 'cavern' | 'natural-cavern' | 'underground-feature'
  | 'irregular-chamber'
export type IrregularSubtype = 'letter-shaped' | 'polygonal' | 'trapezoidal' | 'cornered' | 'natural-cavern' | 'underground-feature'
export type FeatureType = 'chasm' | 'underground-river' | 'gas-filled' | 'random-spell' | 'stalagmite-grove' | 'stalactite-grove'
export type ExitType = 'hallway' | 'doorway' | 'room'
export type RoomExitKind = 'none' | 'doorway' | 'secret-doorway' | 'opposite-doorways' | 'three-doorways' | 'three-and-secret'
export type DoorwayCategory = 'wooden' | 'stone' | 'exotic' | 'archway' | 'portcullis' | 'collapsed' | 'one-way valve'
export type DoorCondition = 'open' | 'stuck/blocked' | 'locked' | 'secret' | 'trapped' | 'locked + trapped'
export type BeyondDoorway = 'hallway' | 'room' | 'intersection' | 'vertical'
export type VerticalContent = 'staircase' | 'shaft' | 'ramp'
export type IntersectionKind = 'T-intersection' | 'four-way crossroad' | 'Y-intersection'
export type HallwayForm = 'straight' | 'intersection' | 'turn' | 'side-passage' | 'doorway-ending' | 'room-ending' | 'terminal'
export type HallwayCondition = 'open' | 'flooded' | 'collapsed' | 'converted' | 'hazard'
export type FailureReason = 'out-of-bounds' | 'overlap' | 'lost-buffer' | 'invalid-path' | 'unavailable-required-stamp'
  | 'unavailable-label-position' | 'invalid-input'

export interface RoomRecord {
  id: string
  origin: Point
  direction: Direction
  shape: RoomShape
  width: number
  height: number
  radius?: number
  irregularSubtype?: IrregularSubtype
  feature?: FeatureType
  tiles: Point[]
  starting?: boolean
  exits: RoomExitKind
  placement?: 'compact-fallback'
}

export interface ExitRecord {
  id: string
  roomId: string
  origin: Point
  direction: Direction
  exitType: ExitType
  secret: boolean
  roll: number
  doorwayCategory?: DoorwayCategory
  condition?: DoorCondition
  beyond?: BeyondDoorway
  verticalContent?: VerticalContent
}

export interface IntersectionRecord { id: string; branchId: string; kind: IntersectionKind; origin: Point; branches: Direction[] }
export interface DoorwayRecord { id: string; branchId: string; origin: Point; direction: Direction; category: DoorwayCategory; condition: DoorCondition; beyond: BeyondDoorway; verticalContent?: VerticalContent }

export interface HallwayRecord {
  id: string
  branchId: string
  origin: Point
  direction: Direction
  form: HallwayForm
  path: Point[]
  width: number
  condition: HallwayCondition
  terminal: boolean
  pillarRequirement?: { requested: boolean; unmet?: boolean }
  placement?: 'compact-fallback'
}

export interface GeneratedStampRecord {
  id: string
  semantic: string
  sourceCategory?: string
  type: StampType
  col: number
  row: number
  rotation: Rotation
  required: boolean
}

export interface GeneratedLabelRecord {
  id: string
  text: string
  col: number
  row: number
  anchor: Point
  anchorKind: 'stamp' | 'hallway'
}

export interface GenerationAttempt {
  id: string
  branchId: string
  kind: 'starting-room' | 'room' | 'hallway' | 'doorway' | 'intersection' | 'stamp' | 'label'
  reason: FailureReason
  candidate: Point[]
  message: string
}

export interface GenerationInput {
  cols: number
  rows: number
  seed: number | string
  dungeonType?: DungeonType
  startingLocation?: StartingLocation
  availableStampTypes?: readonly StampType[]
}

export interface GenerationSummary {
  seed: number
  dungeonType: DungeonType
  startingLocation: StartingLocation
  startingRoom: 'accepted' | 'failed'
  rooms: number
  hallways: number
  terminalHallways: number
  visibleStamps: number
  visibleLabels: number
  failedAttempts: number
}

export interface GenerationResult {
  seed: number
  dungeonType: DungeonType
  startingLocation: StartingLocation
  roomTarget: number
  snapshot: AppSnapshotShape
  map: AppSnapshotShape
  replacement: AppSnapshotShape
  appSnapshot: AppSnapshotShape
  rooms: RoomRecord[]
  exits: ExitRecord[]
  hallways: HallwayRecord[]
  intersections: IntersectionRecord[]
  connectors: Point[]
  doorways: DoorwayRecord[]
  unmetRequirements: { branchId: string; semantic: string; position: Point }[]
  stamps: GeneratedStampRecord[]
  labels: GeneratedLabelRecord[]
  failedAttempts: GenerationAttempt[]
  summary: GenerationSummary
}
