import type { StampType } from '../stamps'
import type { AppSnapshotShape, Direction, Point } from './commonTypes'
import type { TrapRecord } from './trapGenerator'
import type { HazardRecord } from './hazardGenerator'
import type { MonsterRecord } from './monsterCatalog'

export type { AppSnapshotShape, Direction, GeneratedMarkerSemantic, Point } from './commonTypes'

export type GenerationStyle = 'spine-shortcuts' | 'orbit-gates' | 'cavern-pressure'
export type ComplexityPreset = 'compact' | 'standard' | 'dense'
export type MissionNodeKind = 'start' | 'task' | 'goal' | 'branch' | 'reward' | 'key' | 'lock' | 'challenge' | 'hub'
export type MissionEdgeKind = 'progression' | 'optional' | 'key-lock' | 'cycle-route' | 'return'
export type Coupling = 'tight' | 'loose'
export type LoopChallenge =
  | 'alternate-paths'
  | 'hidden-shortcut'
  | 'dramatic-arc'
  | 'dangerous-route'
  | 'lock-and-key'
  | 'unknown-return'
  | 'patrolled-cycle'
  | 'gambit'
  | 'hub-and-spoke'
  | 'double-lock'
export type LoopPreference = 'varied' | LoopChallenge

export interface GenerationRequest {
  style: GenerationStyle
  seed: number | string
  cols: number
  rows: number
  tilesPerInch: number
  orientation?: 'landscape' | 'portrait'
  complexity: ComplexityPreset
  loopCount: number
  loopPreference: LoopPreference
  loopChallenges?: readonly (LoopPreference | undefined)[]
  availableStampTypes?: readonly StampType[]
}

export interface ComplexityBudget {
  preset: ComplexityPreset
  missionNodes: number
  branches: number
  challengeDensity: number
  presetLoopTarget: number
  requestedLoops: number
  loopChallenges: readonly LoopChallenge[]
  derivedKeys: number
  derivedLocks: number
  supportingSpace: number
  minimumRooms: number
  corridorWidths: readonly number[]
  seed: number
}

export interface GenerationDiagnostic {
  stage: 'input' | 'preflight' | 'mission' | 'space' | 'rasterization' | 'validation' | 'transaction'
  code: string
  message: string
  style: GenerationStyle
  seed: number
  nodeId?: string
  candidate?: Point
  constraint?: string
}

export interface PageCapacity {
  cols: number
  rows: number
  tilesPerInch: number
  orientation: 'landscape' | 'portrait'
  usableCols: number
  usableRows: number
  usableCells: number
  roomSlots: number
  corridorCells: number
  markerCells: number
  minimumRoomFootprint: { cols: 3; rows: 3 }
  border: number
  buffer: number
}

export interface PreflightResult {
  status: 'fit' | 'warning' | 'impossible'
  request: GenerationRequest
  budget: ComplexityBudget
  capacity: PageCapacity
  diagnostics: GenerationDiagnostic[]
  estimatedRooms: number
  estimatedCells: number
}

export interface MissionNode {
  id: string
  kind: MissionNodeKind
  label: string
  patternId: string
  optional?: boolean
  keyId?: string
  lockId?: string
}

export interface MissionEdge {
  id: string
  from: string
  to: string
  kind: MissionEdgeKind
  coupling: Coupling
  lockId?: string
  secret?: boolean
  blocked?: boolean
  oneWay?: boolean
  dangerous?: boolean
  visibleObstacle?: boolean
}

export interface KeyRecord {
  id: string
  nodeId: string
  lockIds: string[]
  optional: boolean
}

export interface LockRecord {
  id: string
  nodeId: string
  keyId: string
  optional: boolean
}

export interface CycleRoles {
  anchorNode: string
  routeANode: string
  routeBNode: string
  objectiveNode: string
  keyNode?: string
}

export type DangerKind = 'monster' | 'trap' | 'hazard'

export interface DangerEntry {
  nodeId: string
  count: number
  kinds: 'all' | readonly DangerKind[]
}

export interface MissionCycle {
  id: string
  routeA: string[]
  routeB: string[]
  roles: CycleRoles
  challenge: LoopChallenge
  routeEdgeIds: string[]
  nonTrivial: boolean
  dangerEntries: DangerEntry[]
  emptyRoomIds: string[]
}

export interface Mission {
  id: string
  seed: number
  style: GenerationStyle
  patterns: Array<{ id: string; kind: 'opening' | 'progression' | 'goal' | 'loop'; expandsTo: string[] }>
  nodes: MissionNode[]
  edges: MissionEdge[]
  keys: KeyRecord[]
  locks: LockRecord[]
  cycles: MissionCycle[]
  goalNodeId: string
  diagnostics: GenerationDiagnostic[]
}

export interface Port {
  id: string
  point: Point
  direction: Direction
  width: 1 | 2 | 4
  connectionId?: string
}

export type SpatialModuleType = 'room' | 'corridor' | 'branch' | 'junction' | 'cycle' | 'hub' | 'gate' | 'secret-connection' | 'blocked-return' | 'terminal-challenge'
export type RoomEncounter = 'empty' | DangerKind
export type CorridorCondition = 'open' | 'flooded' | 'trap' | 'hazard'
export type DoorwayStyle =
  | 'single' | 'double' | 'locked' | 'trapdoor' | 'portcullis'
  | 'revolving' | 'secret' | 'magic' | 'ladder-down' | 'ladder-up'
  | 'stairs' | 'spiral-stairs' | 'window' | 'archway' | 'curtain'

export interface GeneratedDoorway {
  point: Point
  direction: Direction
  style: DoorwayStyle
  location: 'room-aperture' | 'hallway'
}

export interface SpatialModule {
  id: string
  type: SpatialModuleType
  missionNodeId?: string
  cycleId?: string
  anchorRole?: keyof CycleRoles
  origin: Point
  width: number
  height: number
  footprint: Point[]
  ports: Port[]
  /** Interior cells that may never be selected as corridor apertures. */
  excludedPortPoints?: Point[]
  encounter?: RoomEncounter
  /** Forced or rolled encounter payload. A room may deliberately hold more
   * than one encounter when a mission contract needs concentrated danger. */
  encounters?: RoomEncounter[]
  /** Generated encounter prose shown in the room ledger and copied to labels. */
  generatedDetails?: string[]
  /** Structured monster assignments selected from the dungeon encounter table. */
  monsterDetails?: MonsterRecord[]
  /** Structured generated room traps used to render their ledger prose. */
  trapDetails?: TrapRecord[]
  /** Structured generated room hazards used to render their ledger prose. */
  hazardDetails?: HazardRecord[]
  hasTreasure?: boolean
}

export type SpatialConnectionSemantic = 'corridor' | 'spoke' | 'secret' | 'locked' | 'dangerous' | 'blocked-return' | 'one-way' | 'junction'

export interface SpatialConnection {
  id: string
  fromModuleId: string
  toModuleId: string
  path: Point[]
  width: 1 | 2 | 4
  semantic: SpatialConnectionSemantic
  missionEdgeId?: string
  cycleId?: string
  explicitJunction?: boolean
  traversable: 'both' | 'one-way' | 'blocked'
  apertureFrom: Point
  apertureTo: Point
  condition?: CorridorCondition
  conditionDetails?: string
  doorways?: GeneratedDoorway[]
}

export interface SpacePlan {
  style: GenerationStyle
  modules: SpatialModule[]
  connections: SpatialConnection[]
  anchors: Record<string, string>
  monsterEncounterTable: MonsterRecord[]
  generalNotes: string[]
  diagnostics: GenerationDiagnostic[]
}

export interface MissionSummary {
  patterns: number
  nodes: number
  keys: number
  locks: number
  cycles: number
  loopChallenges: Array<{ cycleId: string; challenge: LoopChallenge; realization: string }>
  pairings: Array<{ keyId: string; lockIds: string[] }>
}

export interface MissionGenerationSummary {
  seed: number
  style: GenerationStyle
  status: 'success' | 'failed'
  budget: ComplexityBudget
  preflight: PreflightResult
  mission: MissionSummary
  space: { modules: number; connections: number; realization: string }
  diagnostics: GenerationDiagnostic[]
  rejectedAttempts: number
}

export interface MissionGenerationResult {
  ok: boolean
  request: GenerationRequest
  seed: number
  snapshot?: AppSnapshotShape
  mission: Mission
  space?: SpacePlan
  preflight: PreflightResult
  summary: MissionGenerationSummary
  diagnostics: GenerationDiagnostic[]
  failedAttempts: GenerationDiagnostic[]
}
