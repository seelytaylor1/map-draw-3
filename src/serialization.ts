import { STAMP_TYPES, OBJECT_STAMP_TYPES, type CustomImageAsset, type Stamp, type StampType, type ObjectStampType, type Rotation } from './stamps'
import { type StepDirection, type StepRun } from './steps'
import { type RampDirection, type RampRun } from './ramps'
import { type Label } from './labels'
import { normalizeLayers, type MapLayer } from './layers'
import { createLayerGrids, type LayerGrids } from './layerGrids'
import { FLOOR_COLOR, WATER_COLOR, LAVA_COLOR, DARKNESS_COLOR, normalizeTilesPerInch, TILES_PER_INCH } from './constants'
import { normalizeCustomStylePresets, normalizeTextureSettings, type StylePreset, type TextureSettings } from './styles'
import { DEFAULT_LIGHTING_SETTINGS, normalizeLightingSettings, normalizeLights, type LightingSettings, type MapLight } from './lighting'

const STEP_DIRECTIONS: StepDirection[] = ['N', 'E', 'S', 'W']
const RAMP_DIRECTIONS: RampDirection[] = ['N', 'E', 'S', 'W']

export interface MapSave {
  version: 1
  cols: number
  rows: number
  tilesPerInch?: number
  grids: Record<string, number[]>
  layerGrids: Record<string, Record<string, number[]>>
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  playerView: boolean
  show3D: boolean
  isoFaceColor?: string
  showHatching?: boolean
  hatchColor?: string
  showWallOutline?: boolean
  wallOutlineColor?: string
  wallOutlineStyle?: 'clean' | 'rough'
  floorColor?: string
  waterColor?: string
  lavaColor?: string
  darknessColor?: string
  stamps: Stamp[]
  customImages?: CustomImageAsset[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  layers: MapLayer[]
  activeLayerId?: string
  environmentalColors?: Record<string, string>
  textureSettings?: TextureSettings
  customStylePresets?: StylePreset[]
  lights?: MapLight[]
  lightingSettings?: LightingSettings
}

export interface DeserializedMap {
  version: 1
  cols: number
  rows: number
  tilesPerInch: number
  grids: Map<number, Uint8Array>
  layerGrids: LayerGrids
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  playerView: boolean
  show3D: boolean
  isoFaceColor: string
  showHatching: boolean
  hatchColor: string
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  floorColor: string
  waterColor: string
  lavaColor: string
  darknessColor: string
  stamps: Stamp[]
  customImages: CustomImageAsset[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  layers: MapLayer[]
  activeLayerId: string
  environmentalColors: Map<number, string>
  textureSettings: TextureSettings
  customStylePresets: StylePreset[]
  lights: MapLight[]
  lightingSettings: LightingSettings
}

export function serialize(params: {
  grids: Map<number, Uint8Array>
  layerGrids?: LayerGrids
  cols: number
  rows: number
  tilesPerInch?: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  playerView?: boolean
  show3D: boolean
  isoFaceColor: string
  showHatching: boolean
  hatchColor: string
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  floorColor?: string
  waterColor: string
  lavaColor: string
  darknessColor: string
  stamps: Stamp[]
  customImages?: CustomImageAsset[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  layers?: MapLayer[]
  activeLayerId?: string
  environmentalColors: Map<number, string>
  textureSettings?: TextureSettings
  customStylePresets?: StylePreset[]
  lights?: MapLight[]
  lightingSettings?: LightingSettings
}): MapSave {
  const grids: Record<string, number[]> = {}
  for (const [z, grid] of params.grids) {
    grids[String(z)] = Array.from(grid)
  }
  const layerGrids = Object.fromEntries(Array.from(createLayerGrids(params.layerGrids, params.grids), ([layerId, levelGrids]) => [
    layerId,
    Object.fromEntries(Array.from(levelGrids, ([z, grid]) => [String(z), Array.from(grid)])),
  ]))
  const layers = normalizeLayers(params.layers)
  return {
    version: 1,
    cols: params.cols,
    rows: params.rows,
    tilesPerInch: normalizeTilesPerInch(params.tilesPerInch ?? TILES_PER_INCH),
    grids,
    layerGrids,
    wallColor: params.wallColor,
    wallOpacity: params.wallOpacity,
    brushShape: params.brushShape,
    showGrid: params.showGrid,
    playerView: params.playerView === true,
    show3D: params.show3D,
    isoFaceColor: params.isoFaceColor,
    showHatching: params.showHatching,
    hatchColor: params.hatchColor,
    showWallOutline: params.showWallOutline,
    wallOutlineColor: params.wallOutlineColor,
    wallOutlineStyle: params.wallOutlineStyle,
    floorColor: params.floorColor ?? FLOOR_COLOR,
    waterColor: params.waterColor,
    lavaColor: params.lavaColor,
    darknessColor: params.darknessColor,
    stamps: params.stamps.map(s => {
      const { scale, mirrored, color, z, ...rest } = s
      const out: Partial<Stamp> = { ...rest }
      if (z !== 0) out.z = z
      if (scale !== undefined && scale !== 1) out.scale = scale
      if (mirrored) out.mirrored = mirrored
      if (color !== undefined) out.color = color
      return out as Stamp
    }),
    customImages: params.customImages ?? [],
    steps: params.steps.map(s => {
      const out = { ...s }
      if (out.ascending === false) delete out.ascending
      return out
    }),
    ramps: params.ramps.map(r => {
      const out = { ...r }
      if (out.ascending === false) delete out.ascending
      return out
    }),
    labels: params.labels,
    layers,
    activeLayerId: layers.some(layer => layer.id === params.activeLayerId) ? params.activeLayerId : layers[0].id,
    environmentalColors: Object.fromEntries(Array.from(params.environmentalColors.entries())),
    textureSettings: normalizeTextureSettings(params.textureSettings),
    customStylePresets: normalizeCustomStylePresets(params.customStylePresets),
    lights: normalizeLights(params.lights),
    lightingSettings: normalizeLightingSettings(params.lightingSettings),
  }
}

export function deserialize(raw: unknown): DeserializedMap {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid save: not an object')
  const s = raw as Record<string, unknown>
  if (s['version'] !== 1) throw new Error(`Unsupported version: ${s['version']}`)
  if (typeof s['cols'] !== 'number' || s['cols'] < 1) throw new Error('Invalid cols')
  if (typeof s['rows'] !== 'number' || s['rows'] < 1) throw new Error('Invalid rows')
  const tilesPerInch = normalizeTilesPerInch(
    typeof s['tilesPerInch'] === 'number' && Number.isFinite(s['tilesPerInch'])
      ? s['tilesPerInch']
      : TILES_PER_INCH,
  )
  if (typeof s['wallColor'] !== 'string') throw new Error('Invalid wallColor')
  if (typeof s['wallOpacity'] !== 'number') throw new Error('Invalid wallOpacity')
  if (s['brushShape'] !== 'square' && s['brushShape'] !== 'circle') throw new Error('Invalid brushShape')
  if (typeof s['showGrid'] !== 'boolean') throw new Error('Invalid showGrid')
  const playerView = s['playerView'] === true
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

  const decodedLayerGrids: LayerGrids = new Map()
  if (typeof s['layerGrids'] === 'object' && s['layerGrids'] !== null && !Array.isArray(s['layerGrids'])) {
    for (const [layerId, rawLevels] of Object.entries(s['layerGrids'] as Record<string, unknown>)) {
      if (typeof rawLevels !== 'object' || rawLevels === null || Array.isArray(rawLevels)) continue
      const levels = new Map<number, Uint8Array>()
      for (const [rawZ, rawGrid] of Object.entries(rawLevels as Record<string, unknown>)) {
        const z = Number.parseInt(rawZ, 10)
        if (Number.isFinite(z) && Array.isArray(rawGrid)) levels.set(z, new Uint8Array(rawGrid as number[]))
      }
      if (levels.size > 0) decodedLayerGrids.set(layerId, levels)
    }
  }
  const layerGrids = createLayerGrids(decodedLayerGrids, grids)

  const customImages: CustomImageAsset[] = []
  if (Array.isArray(s['customImages'])) {
    const seenTypes = new Set<string>()
    for (const entry of s['customImages']) {
      if (typeof entry !== 'object' || entry === null) continue
      const asset = entry as Record<string, unknown>
      if (typeof asset['type'] !== 'string' || !asset['type'].startsWith('custom-image-') || seenTypes.has(asset['type'])) continue
      if (typeof asset['name'] !== 'string' || typeof asset['dataUrl'] !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(asset['dataUrl'])) continue
      if (typeof asset['aspectRatio'] !== 'number' || !Number.isFinite(asset['aspectRatio']) || asset['aspectRatio'] <= 0) continue
      seenTypes.add(asset['type'])
      customImages.push({ type: asset['type'], name: asset['name'], dataUrl: asset['dataUrl'], aspectRatio: asset['aspectRatio'] })
    }
  }
  const customImageTypes = new Set(customImages.map(asset => asset.type))
  const rawStamps = Array.isArray(s['stamps']) ? s['stamps'] : []
  const stamps: Stamp[] = rawStamps.map((entry: unknown): Stamp => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid stamp entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid stamp id')
    const allTypes = [...STAMP_TYPES, ...OBJECT_STAMP_TYPES]
    const type = typeof o['type'] === 'string' ? o['type'] : ''
    const isCustomImage = type.startsWith('custom-image-') && customImageTypes.has(type)
    if (!allTypes.includes(type as StampType | ObjectStampType) && !isCustomImage) throw new Error('Invalid stamp type or missing custom image data')
    if (typeof o['col'] !== 'number') throw new Error('Invalid stamp col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid stamp row')
    if (![0, 90, 180, 270].includes(o['rotation'] as number)) throw new Error('Invalid stamp rotation')
    const rawScale = o['scale']
    const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
      ? rawScale
      : undefined
    const color = isHexColor(o['color']) ? o['color'] : undefined
    const z = typeof o['z'] === 'number' && Number.isFinite(o['z']) ? o['z'] : 0

    const stamp: Stamp = {
      id: o['id'] as string,
      type: type as StampType | ObjectStampType,
      col: o['col'] as number,
      row: o['row'] as number,
      rotation: o['rotation'] as Rotation,
      z,
    }
    if (scale !== undefined && scale !== 1) stamp.scale = scale
    if (o['mirrored'] === true) stamp.mirrored = true
    if (color !== undefined) stamp.color = color
    if (typeof o['groupId'] === 'string') stamp.groupId = o['groupId']
    if (typeof o['layerId'] === 'string') stamp.layerId = o['layerId']
    if (isCustomImage) {
      const asset = customImages.find(candidate => candidate.type === type)!
      stamp.assetName = asset.name
      stamp.aspectRatio = asset.aspectRatio
    }
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
    const ascending = o['ascending'] === true ? true : undefined
    const step: StepRun = {
      id: o['id'] as string,
      col: o['col'] as number,
      row: o['row'] as number,
      z,
      direction: o['direction'] as StepDirection,
    }
    if (ascending !== undefined) step.ascending = ascending
    if (typeof o['groupId'] === 'string') step.groupId = o['groupId']
    if (typeof o['layerId'] === 'string') step.layerId = o['layerId']
    return step
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
    const ascending = o['ascending'] === true ? true : undefined
    const ramp: RampRun = {
      id: o['id'] as string,
      col: o['col'] as number,
      row: o['row'] as number,
      z,
      direction: o['direction'] as RampDirection,
    }
    if (ascending !== undefined) ramp.ascending = ascending
    if (typeof o['groupId'] === 'string') ramp.groupId = o['groupId']
    if (typeof o['layerId'] === 'string') ramp.layerId = o['layerId']
    return ramp
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
    if (typeof o['z'] === 'number') label.z = o['z'] as number
    if (typeof o['number'] === 'number') label.number = o['number']
    if (o['numberOnly'] === true) label.numberOnly = true
    if (isHexColor(o['color'])) label.color = o['color']
    if (typeof o['details'] === 'string') label.details = o['details']
    if (typeof o['groupId'] === 'string') label.groupId = o['groupId']
    if (typeof o['layerId'] === 'string') label.layerId = o['layerId']
    return label
  })
  const layers = normalizeLayers(s['layers'])
  const activeLayerId = typeof s['activeLayerId'] === 'string' && layers.some(layer => layer.id === s['activeLayerId'])
    ? s['activeLayerId']
    : layers[0].id

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
  const floorColor = isHexColor(s['floorColor']) ? s['floorColor'] : FLOOR_COLOR

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
    tilesPerInch,
    grids,
    layerGrids,
    wallColor: s['wallColor'] as string,
    wallOpacity: s['wallOpacity'] as number,
    brushShape: s['brushShape'] as 'square' | 'circle',
    showGrid: s['showGrid'] as boolean,
    playerView,
    show3D,
    isoFaceColor,
    showHatching,
    hatchColor,
    showWallOutline,
    wallOutlineColor,
    wallOutlineStyle,
    floorColor,
    waterColor,
    lavaColor,
    darknessColor,
    stamps,
    customImages,
    steps,
    ramps,
    labels,
    layers,
    activeLayerId,
    environmentalColors,
    textureSettings: normalizeTextureSettings(s['textureSettings']),
    customStylePresets: normalizeCustomStylePresets(s['customStylePresets']),
    lights: normalizeLights(s['lights']),
    lightingSettings: normalizeLightingSettings(s['lightingSettings'] ?? DEFAULT_LIGHTING_SETTINGS),
  }
}
