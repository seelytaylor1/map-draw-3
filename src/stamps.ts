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
  | 'Altar1x1'
  | 'Arrow1x1'
  | 'Bed1x1'
  | 'BedDouble1x1'
  | 'Bench1x1'
  | 'Bookcase1x1'
  | 'Cage1x1'
  | 'Cask1x1'
  | 'Chair1x1'
  | 'Chest1x1'
  | 'Circle1x1'
  | 'CircleDotted1x1'
  | 'CircleFilled1x1'
  | 'CoffinClosed1x1'
  | 'CoffinOpen1x1'
  | 'Cross1x1'
  | 'Curtain1x1'
  | 'CurtainCorner1x1'
  | 'Danger1x1'
  | 'Door1x1'
  | 'DoorArchway1x1'
  | 'DoorConcealed1x1'
  | 'DoorDouble1x1'
  | 'DoorFalse1x1'
  | 'DoorGate1x1'
  | 'DoorLocked1x1'
  | 'DoorMagic1x1'
  | 'DoorPortcullis1x1'
  | 'DoorRevolve1way1x1'
  | 'DoorRevolving1x1'
  | 'DoorSecret1x1'
  | 'DoorSlides1x1'
  | 'Fire1x1'
  | 'FireCamp1x1'
  | 'Fireplace1x1'
  | 'Fountain1x1'
  | 'Grave1x1'
  | 'Illusion1x1'
  | 'Key1x1'
  | 'LadderDown1x1'
  | 'LadderUp1x1'
  | 'Light1x1'
  | 'Loot1x1'
  | 'Lounge1x1'
  | 'PitCircle1x1'
  | 'PitClosedCircle1x1'
  | 'PitClosedSquare1x1'
  | 'PitSquare1x1'
  | 'Railing1x1'
  | 'RailingCorner1x1'
  | 'RailingCurve1x1'
  | 'RailingHalf1x1'
  | 'Square1x1'
  | 'SquareDotted1x1'
  | 'SquareFilled1x1'
  | 'Stairs1x1_01'
  | 'StairSpiralCircleBig2x2'
  | 'StairSpiralCircleDown1x1'
  | 'StairSpiralCircleUp1x1'
  | 'StairSpiralSquareBig2x2'
  | 'StairSpiralSquareDown1x1'
  | 'StairSpiralSquareUp1x1'
  | 'Statue1x1'
  | 'StatueSmall1x1'
  | 'Stool1x1'
  | 'TableLong2x1'
  | 'TableRectangle1x1'
  | 'TableRound1x1'
  | 'TableSet2x1'
  | 'TableSet3x1'
  | 'TableSetCircle1x1'
  | 'TableSetRect2x1'
  | 'TableSetSquare1x1'
  | 'TableSetTwo3x1'
  | 'TableSquare1x1'
  | 'Throne1x1'
  | 'Trap1x1'
  | 'TrapdoorCieling1x1'
  | 'TrapdoorFloor1x1'
  | 'TrapdoorSecret1x1'
  | 'TriangleArrowhead1x1'
  | 'Trigger1x1'
  | 'Unknown1x1'
  | 'WellCircle1x1'
  | 'WellSquare1x1'
  | 'Window1x1'

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
// The supplied PNG set is the default picker palette. Legacy SVG icons remain
// registered above so existing save files continue to load and render.
export const DEFAULT_ICON_TYPES = Object.entries(iconModules)
  .filter(([path]) => path.toLowerCase().endsWith('.png'))
  .map(([path]) => toAssetName(path))
  .sort((a, b) => a.localeCompare(b)) as StampType[]

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
  const size = type.match(/(\d+)x(\d+)(?:_\d+)?$/)
  if (size) return { cols: Number(size[1]), rows: Number(size[2]) }
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
