import { STAMP_TYPES, type Stamp, type StampType } from '../stamps'
import type { Direction, GeneratedMarkerSemantic, Point } from './commonTypes'
import { GENERATED_MARKER_STAMP_TYPES } from './generatedStampCatalog'

/** Generated-content Adapter: map stable semantic markers to available assets. */
export function resolveGeneratedStamp(semantic: GeneratedMarkerSemantic, id: string, position: Point, available: readonly StampType[] = STAMP_TYPES, direction: Direction = 'E'): Stamp | null {
  const type = GENERATED_MARKER_STAMP_TYPES[semantic].find(candidate => available.includes(candidate))
  if (!type) return null
  const rotation = direction === 'N' ? 0 : direction === 'E' ? 90 : direction === 'S' ? 180 : 270
  return { id, type, col: position.col, row: position.row, rotation, z: 0 }
}
