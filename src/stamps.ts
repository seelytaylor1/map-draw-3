export type StampType =
  | 'door'
  | 'secret-door'
  | 'trap'
  | 'star'
  | 'bars'
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
  | 'stairs'

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
  | 'stairs'

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

const toAssetName = (assetPath: string): string => assetPath.split('/').pop()!.replace(/\.[^.]+$/, '')

const iconModules = import.meta.glob('./stamps/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const objectModules = import.meta.glob('./iso-objects/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const STAMP_ASSET_URLS = Object.fromEntries(
  Object.entries(iconModules).map(([path, url]) => [toAssetName(path), String(url)]),
) as Record<string, string>

const OBJECT_ASSET_URLS = Object.fromEntries(
  Object.entries(objectModules).map(([path, url]) => [toAssetName(path), String(url)]),
) as Record<string, string>

const BASE_ICON_TYPES = ['door', 'secret-door', 'trap', 'star', 'bars'] as const
const BASE_OBJECT_TYPES = ['archway', 'bigpillar', 'iron-door', 'passageway-arch', 'pillar', 'portculis', 'ramp', 'well', 'wood-door', 'wood-doubledoor', 'stairs'] as const

export const STAMP_TYPES = [...new Set([...BASE_ICON_TYPES, ...Object.keys(STAMP_ASSET_URLS)])] as StampType[]
export const OBJECT_STAMP_TYPES = [...new Set([...BASE_OBJECT_TYPES, ...Object.keys(OBJECT_ASSET_URLS)])] as ObjectStampType[]

export const STAMP_ASSET_MAP = STAMP_ASSET_URLS as Record<StampType, string>
export const OBJECT_ASSET_MAP = OBJECT_ASSET_URLS as Record<ObjectStampType, string>

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
