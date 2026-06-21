import { STAMP_TYPES, OBJECT_STAMP_TYPES, type Stamp, type StampType, type ObjectStampType, type Rotation } from './stamps'
import { type StepDirection, type StepRun } from './steps'
import { type RampDirection, type RampRun } from './ramps'
import { type Label } from './labels'
import { WATER_COLOR, LAVA_COLOR, DARKNESS_COLOR } from './constants'

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
  showHatching?: boolean
  hatchColor?: string
  showWallOutline?: boolean
  wallOutlineColor?: string
  wallOutlineStyle?: 'clean' | 'rough'
  waterColor?: string
  lavaColor?: string
  darknessColor?: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors?: Record<string, string>
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
  showHatching: boolean
  hatchColor: string
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  waterColor: string
  lavaColor: string
  darknessColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors: Map<number, string>
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
  showHatching: boolean
  hatchColor: string
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  waterColor: string
  lavaColor: string
  darknessColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors: Map<number, string>
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
    showHatching: params.showHatching,
    hatchColor: params.hatchColor,
    showWallOutline: params.showWallOutline,
    wallOutlineColor: params.wallOutlineColor,
    wallOutlineStyle: params.wallOutlineStyle,
    waterColor: params.waterColor,
    lavaColor: params.lavaColor,
    darknessColor: params.darknessColor,
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
    labels: params.labels,
    environmentalColors: Object.fromEntries(Array.from(params.environmentalColors.entries())),
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

  const rawLabels = Array.isArray(s['labels']) ? s['labels'] : []
  const labels: Label[] = rawLabels.map((entry: unknown): Label => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid label entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid label id')
    if (typeof o['col'] !== 'number') throw new Error('Invalid label col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid label row')
    if (typeof o['text'] !== 'string') throw new Error('Invalid label text')
    const label: Label = {
      id: o['id'] as string,
      col: o['col'] as number,
      row: o['row'] as number,
      text: o['text'] as string,
    }
    if (typeof o['number'] === 'number') label.number = o['number']
    return label
  })

  const showHatching = s['showHatching'] === true
  const hatchColor = typeof s['hatchColor'] === 'string' ? s['hatchColor'] : '#000000'
  const showWallOutline = s['showWallOutline'] === true
  const wallOutlineColor = typeof s['wallOutlineColor'] === 'string' ? s['wallOutlineColor'] : '#000000'
  const wallOutlineStyle: 'clean' | 'rough' = s['wallOutlineStyle'] === 'rough' ? 'rough' : 'clean'

  function isHexColor(v: unknown): v is string {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
  }
  const waterColor = isHexColor(s['waterColor']) ? s['waterColor'] : WATER_COLOR
  const lavaColor = isHexColor(s['lavaColor']) ? s['lavaColor'] : LAVA_COLOR
  const darknessColor = isHexColor(s['darknessColor']) ? s['darknessColor'] : DARKNESS_COLOR

  const rawEnvColors = (typeof s['environmentalColors'] === 'object' && s['environmentalColors'] !== null && !Array.isArray(s['environmentalColors']))
    ? s['environmentalColors'] as Record<string, string>
    : {}
  const environmentalColors = new Map<number, string>(
    Object.entries(rawEnvColors)
      .filter(([k, v]) => typeof v === 'string' && Number.isFinite(Number(k)))
      .map(([k, v]) => [Number.parseInt(k, 10), v])
  )

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
    showHatching,
    hatchColor,
    showWallOutline,
    wallOutlineColor,
    wallOutlineStyle,
    waterColor,
    lavaColor,
    darknessColor,
    stamps,
    steps,
    ramps,
    labels,
    environmentalColors,
  }
}
