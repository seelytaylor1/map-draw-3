import { STAMP_TYPES, type Stamp, type StampType } from '../stamps'
import type { Direction, GeneratedMarkerSemantic, Point } from './commonTypes'

const semanticPriority: Record<GeneratedMarkerSemantic, StampType[]> = {
  key: ['Key1x1'],
  lock: ['DoorLocked1x1'],
  secret: ['DoorSecret1x1', 'DoorConcealed1x1', 'secret-door'],
  danger: ['Danger1x1', 'Trap1x1', 'trap'],
  'blocked-return': ['DoorConcealed1x1', 'DoorFalse1x1', 'Unknown1x1', 'SquareFilled1x1'],
  'one-way': ['DoorRevolve1way1x1', 'DoorRevolving1x1', 'Door1x1', 'door'],
  hub: ['Altar1x1', 'CircleFilled1x1', 'Circle1x1'],
}

/** Generated-content Adapter: map stable semantic markers to available assets. */
export function resolveGeneratedStamp(semantic: GeneratedMarkerSemantic, id: string, position: Point, available: readonly StampType[] = STAMP_TYPES, direction: Direction = 'E'): Stamp | null {
  const type = semanticPriority[semantic].find(candidate => available.includes(candidate))
  if (!type) return null
  const rotation = direction === 'N' ? 0 : direction === 'E' ? 90 : direction === 'S' ? 180 : 270
  return { id, type, col: position.col, row: position.row, rotation, z: 0 }
}
