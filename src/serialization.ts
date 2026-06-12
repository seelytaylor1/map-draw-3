import { STAMP_TYPES, OBJECT_STAMP_TYPES, type Stamp, type StampType, type ObjectStampType, type Rotation } from './stamps'
import { type StepDirection, type StepRun } from './steps'
import { type RampDirection, type RampRun } from './ramps'

const STEP_DIRECTIONS: StepDirection[] = ['N', 'E', 'S', 'W']
const RAMP_DIRECTIONS: RampDirection[] = ['N', 'E', 'S', 'W']

export interface MapSave {
  version: 1
  cols: number
  rows: number
  grids: Record<string, number[]>
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor?: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}

export interface DeserializedMap {
  version: 1
  cols: number
  rows: number
  grids: Map<number, Uint8Array>
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}

export function serialize(params: {
  grids: Map<number, Uint8Array>
  cols: number
  rows: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}): MapSave {
  const grids: Record<string, number[]> = {}
  for (const [z, grid] of params.grids) {
    grids[String(z)] = Array.from(grid)
  }
  return {
    version: 1,
    cols: params.cols,
    rows: params.rows,
    grids,
    wallColor: params.wallColor,
    wallOpacity: params.wallOpacity,
    brushShape: params.brushShape,
    showGrid: params.showGrid,
    show3D: params.show3D,
    isoFaceColor: params.isoFaceColor,
    stamps: params.stamps.map(s => {
      const { scale, mirrored, z, ...rest } = s
      const out: Partial<Stamp> = { ...rest }
      if (z !== 0) out.z = z
      if (scale !== undefined && scale !== 1) out.scale = scale
      if (mirrored) out.mirrored = mirrored
      return out as Stamp
    }),
    steps: params.steps.map(s => ({ ...s })),
    ramps: params.ramps.map(r => ({ ...r })),
  }
}

export function deserialize(raw: unknown): DeserializedMap {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid save: not an object')
  const s = raw as Record<string, unknown>
  if (s['version'] !== 1) throw new Error(`Unsupported version: ${s['version']}`)
  if (typeof s['cols'] !== 'number' || s['cols'] < 1) throw new Error('Invalid cols')
  if (typeof s['rows'] !== 'number' || s['rows'] < 1) throw new Error('Invalid rows')
  if (typeof s['wallColor'] !== 'string') throw new Error('Invalid wallColor')
  if (typeof s['wallOpacity'] !== 'number') throw new Error('Invalid wallOpacity')
  if (s['brushShape'] !== 'square' && s['brushShape'] !== 'circle') throw new Error('Invalid brushShape')
  if (typeof s['showGrid'] !== 'boolean') throw new Error('Invalid showGrid')
  const show3D = s['show3D'] === true
  const isoFaceColor = typeof s['isoFaceColor'] === 'string' ? s['isoFaceColor'] : '#6a5040'

  // Accept both new `grids` format and old `grid` format (backward compat)
  const grids = new Map<number, Uint8Array>()
  if (typeof s['grids'] === 'object' && s['grids'] !== null && !Array.isArray(s['grids'])) {
    const raw = s['grids'] as Record<string, unknown>
    for (const [key, val] of Object.entries(raw)) {
      const z = parseInt(key, 10)
      if (!Number.isFinite(z)) throw new Error(`Invalid grid key: ${key}`)
      if (!Array.isArray(val)) throw new Error(`Invalid grid for Z=${key}`)
      grids.set(z, new Uint8Array(val as number[]))
    }
  } else if (Array.isArray(s['grid'])) {
    grids.set(0, new Uint8Array(s['grid'] as number[]))
  } else {
    throw new Error('Invalid grid')
  }

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
    const z = typeof o['z'] === 'number' && Number.isFinite(o['z']) ? o['z'] : 0

    const stamp: Stamp = {
      id: o['id'] as string,
      type: o['type'] as StampType | ObjectStampType,
      col: o['col'] as number,
      row: o['row'] as number,
      rotation: o['rotation'] as Rotation,
      z,
    }
    if (scale !== undefined && scale !== 1) stamp.scale = scale
    if (o['mirrored'] === true) stamp.mirrored = true
    return stamp
  })

  const rawSteps = Array.isArray(s['steps']) ? s['steps'] : []
  const steps: StepRun[] = rawSteps.map((entry: unknown): StepRun => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid step entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid step id')
    if (typeof o['col'] !== 'number') throw new Error('Invalid step col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid step row')
    if (!STEP_DIRECTIONS.includes(o['direction'] as StepDirection)) throw new Error('Invalid step direction')
    const z = typeof o['z'] === 'number' && Number.isFinite(o['z']) ? o['z'] : 0
    return {
      id: o['id'] as string,
      col: o['col'] as number,
      row: o['row'] as number,
      z,
      direction: o['direction'] as StepDirection,
    }
  })

  const rawRamps = Array.isArray(s['ramps']) ? s['ramps'] : []
  const ramps: RampRun[] = rawRamps.map((entry: unknown): RampRun => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid ramp entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid ramp id')
    if (typeof o['col'] !== 'number') throw new Error('Invalid ramp col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid ramp row')
    if (!RAMP_DIRECTIONS.includes(o['direction'] as RampDirection)) throw new Error('Invalid ramp direction')
    const z = typeof o['z'] === 'number' && Number.isFinite(o['z']) ? o['z'] : 0
    return {
      id: o['id'] as string,
      col: o['col'] as number,
      row: o['row'] as number,
      z,
      direction: o['direction'] as RampDirection,
    }
  })

  return {
    version: 1,
    cols: s['cols'] as number,
    rows: s['rows'] as number,
    grids,
    wallColor: s['wallColor'] as string,
    wallOpacity: s['wallOpacity'] as number,
    brushShape: s['brushShape'] as 'square' | 'circle',
    showGrid: s['showGrid'] as boolean,
    show3D,
    isoFaceColor,
    stamps,
    steps,
    ramps,
  }
}
