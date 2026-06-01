export type StampType = 'door' | 'trap' | 'star' | 'bars' | 'stairs'
export type Rotation = 0 | 90 | 180 | 270

export interface Stamp {
  id: string
  type: StampType
  col: number
  row: number
  rotation: Rotation
}

export const STAMP_TYPES: StampType[] = ['door', 'trap', 'star', 'bars', 'stairs']

export function stampSize(type: StampType): { cols: number; rows: number } {
  return type === 'stairs' ? { cols: 2, rows: 1 } : { cols: 1, rows: 1 }
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
