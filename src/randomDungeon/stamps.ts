import { STAMP_TYPES, type Rotation, type Stamp, type StampType } from '../stamps'
import type { Direction } from './types'

export type StampSemantic = 'door' | 'secret-door' | 'valve' | 'trap' | 'danger' | 'stairs' | 'shaft' | 'rubble' | 'pillar'
export interface StampRequest { semantic: StampSemantic; category?: string; col: number; row: number; direction: Direction; required: boolean }
export interface ResolvedStamp { stamp: Stamp & { type: StampType }; requested: StampSemantic; sourceCategory?: string; unmet?: boolean }

export const STAMP_PRIORITY: Record<StampSemantic, readonly StampType[]> = {
  door: ['Door1x1', 'DoorArchway1x1', 'DoorGate1x1', 'DoorRevolve1way1x1', 'DoorRevolving1x1', 'door'],
  'secret-door': ['DoorSecret1x1', 'DoorConcealed1x1', 'secret-door', 'Door1x1'],
  valve: ['DoorRevolve1way1x1', 'DoorRevolving1x1', 'Door1x1', 'door'],
  trap: ['Trap1x1', 'TrapdoorFloor1x1', 'trap', 'Danger1x1'],
  danger: ['Danger1x1', 'Trap1x1', 'trap'],
  stairs: ['Stairs1x1_01', 'StairSpiralSquareDown1x1', 'StairSpiralCircleDown1x1'],
  shaft: ['PitSquare1x1', 'PitCircle1x1', 'TrapdoorFloor1x1'],
  rubble: ['Unknown1x1', 'SquareFilled1x1', 'Danger1x1'],
  pillar: ['Unknown1x1', 'Square1x1'],
}

const rotationFor = (direction: Direction): Rotation => direction === 'N' ? 0 : direction === 'E' ? 90 : direction === 'S' ? 180 : 270

export function resolveStamp(request: StampRequest, available: readonly StampType[] = STAMP_TYPES): ResolvedStamp | null {
  const type = STAMP_PRIORITY[request.semantic].find(candidate => available.includes(candidate))
  if (!type) return request.required ? null : { stamp: { id: '', type: 'Unknown1x1', col: request.col, row: request.row, rotation: rotationFor(request.direction), z: 0 }, requested: request.semantic, sourceCategory: request.category, unmet: true }
  return { stamp: { id: '', type, col: request.col, row: request.row, rotation: rotationFor(request.direction), z: 0 }, requested: request.semantic, sourceCategory: request.category }
}

export function makeGeneratedStamp(id: string, request: StampRequest, available?: readonly StampType[]): ResolvedStamp | null { const result = resolveStamp(request, available); if (result) result.stamp.id = id; return result }
