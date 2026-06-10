export type StampType = 'door' | 'trap' | 'star' | 'bars'
export type ObjectStampType =
  | 'archway'
  | 'bigpillar'
  | 'iron-door'
  | 'passageway-arch'
  | 'pillar'
  | 'portculis'
  | 'ramp'
  | 'well'
  | 'wood-door'
  | 'wood-doubledoor'
export type Rotation = 0 | 90 | 180 | 270

export interface Stamp {
  id: string
  type: StampType | ObjectStampType
  col: number
  row: number
  rotation: Rotation
  z: number
  scale?: number
  mirrored?: boolean
}

export const STAMP_TYPES: StampType[] = ['door', 'trap', 'star', 'bars']
export const OBJECT_STAMP_TYPES: ObjectStampType[] = [
  'archway',
  'bigpillar',
  'iron-door',
  'passageway-arch',
  'pillar',
  'portculis',
  'ramp',
  'well',
  'wood-door',
  'wood-doubledoor',
]

export function isObjectStamp(s: Stamp): s is Stamp & { type: ObjectStampType } {
  return (OBJECT_STAMP_TYPES as string[]).includes(s.type)
}

export function isFloorStamp(s: Stamp): s is Stamp & { type: StampType } {
  return (STAMP_TYPES as string[]).includes(s.type)
}

export function stampSize(type: StampType | ObjectStampType): { cols: number; rows: number } {
  if (type === 'wood-doubledoor') return { cols: 2, rows: 1 }
  return { cols: 1, rows: 1 }
}

export function addStamp(stamps: Stamp[], stamp: Stamp): Stamp[] {
  return [...stamps, stamp]
}

export function removeStamp(stamps: Stamp[], id: string): Stamp[] {
  return stamps.filter(s => s.id !== id)
}

export function rotateStamp(stamps: Stamp[], id: string): Stamp[] {
  return stamps.map(s =>
    s.id === id ? { ...s, rotation: ((s.rotation + 90) % 360) as Rotation } : s,
  )
}

export function moveStamp(stamps: Stamp[], id: string, col: number, row: number): Stamp[] {
  return stamps.map(s => s.id === id ? { ...s, col, row } : s)
}

export function scaleStamp(stamps: Stamp[], id: string, scale: number): Stamp[] {
  return stamps.map(s => s.id === id ? { ...s, scale } : s)
}

export function mirrorStamp(stamps: Stamp[], id: string): Stamp[] {
  return stamps.map(s => {
    if (s.id !== id) return s
    const { mirrored: _, ...rest } = s
    return s.mirrored ? rest : { ...rest, mirrored: true }
  })
}
