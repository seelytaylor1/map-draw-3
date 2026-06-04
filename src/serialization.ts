import { STAMP_TYPES, OBJECT_STAMP_TYPES, type Stamp, type StampType, type ObjectStampType, type Rotation } from './stamps'

export interface MapSave {
  version: 1
  cols: number
  rows: number
  grid: number[]
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  stamps: Stamp[]
}

export function serialize(params: {
  grid: Uint8Array
  cols: number
  rows: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  stamps: Stamp[]
}): MapSave {
  return {
    version: 1,
    cols: params.cols,
    rows: params.rows,
    grid: Array.from(params.grid),
    wallColor: params.wallColor,
    wallOpacity: params.wallOpacity,
    brushShape: params.brushShape,
    showGrid: params.showGrid,
    show3D: params.show3D,
    stamps: params.stamps.map(s => {
      if (s.scale === undefined || s.scale === 1) {
        const { scale: _, ...rest } = s
        return rest as Stamp
      }
      return s
    }),
  }
}

export function deserialize(raw: unknown): MapSave {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid save: not an object')
  const s = raw as Record<string, unknown>
  if (s['version'] !== 1) throw new Error(`Unsupported version: ${s['version']}`)
  if (typeof s['cols'] !== 'number' || s['cols'] < 1) throw new Error('Invalid cols')
  if (typeof s['rows'] !== 'number' || s['rows'] < 1) throw new Error('Invalid rows')
  if (!Array.isArray(s['grid'])) throw new Error('Invalid grid')
  if (typeof s['wallColor'] !== 'string') throw new Error('Invalid wallColor')
  if (typeof s['wallOpacity'] !== 'number') throw new Error('Invalid wallOpacity')
  if (s['brushShape'] !== 'square' && s['brushShape'] !== 'circle') throw new Error('Invalid brushShape')
  if (typeof s['showGrid'] !== 'boolean') throw new Error('Invalid showGrid')
  const show3D = s['show3D'] === true

  const rawStamps = Array.isArray(s['stamps']) ? s['stamps'] : []
  const stamps: Stamp[] = rawStamps.map((entry: unknown): Stamp => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid stamp entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid stamp id')
    const allTypes = [...STAMP_TYPES, ...OBJECT_STAMP_TYPES]
    if (!allTypes.includes(o['type'] as StampType | ObjectStampType)) throw new Error('Invalid stamp type')
    if (typeof o['col'] !== 'number') throw new Error('Invalid stamp col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid stamp row')
    if (![0, 90, 180, 270].includes(o['rotation'] as number)) throw new Error('Invalid stamp rotation')
    const rawScale = o['scale']
    const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
      ? rawScale
      : undefined

    const stamp: Stamp = {
      id: o['id'] as string,
      type: o['type'] as StampType | ObjectStampType,
      col: o['col'] as number,
      row: o['row'] as number,
      rotation: o['rotation'] as Rotation,
    }
    if (scale !== undefined && scale !== 1) stamp.scale = scale
    return stamp
  })

  return {
    version: 1,
    cols: s['cols'] as number,
    rows: s['rows'] as number,
    grid: s['grid'] as number[],
    wallColor: s['wallColor'] as string,
    wallOpacity: s['wallOpacity'] as number,
    brushShape: s['brushShape'] as 'square' | 'circle',
    showGrid: s['showGrid'] as boolean,
    show3D,
    stamps,
  }
}
