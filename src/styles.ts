import { DARKNESS_COLOR, FLOOR_COLOR, LAVA_COLOR, WATER_COLOR } from './constants'

export type TexturePattern = 'none' | 'dots' | 'diagonal' | 'crosshatch'
export type TextureScope = 'map' | 'active-layer'

export interface TextureSettings {
  pattern: TexturePattern
  scale: number
  opacity: number
  color: string
  scope: TextureScope
}

export interface VisualStyle {
  wallColor: string
  wallOpacity: number
  floorColor: string
  waterColor: string
  lavaColor: string
  darknessColor: string
  isoFaceColor: string
  showGrid: boolean
  show3D: boolean
  showHatching: boolean
  hatchColor: string
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  texture: TextureSettings
}

export interface StylePreset {
  id: string
  name: string
  style: VisualStyle
}

export const DEFAULT_TEXTURE_SETTINGS: TextureSettings = {
  pattern: 'none', scale: 1, opacity: 28, color: '#5e5142', scope: 'map',
}

const base: VisualStyle = {
  wallColor: '#000000', wallOpacity: 0,
  floorColor: FLOOR_COLOR, waterColor: WATER_COLOR, lavaColor: LAVA_COLOR, darknessColor: DARKNESS_COLOR,
  isoFaceColor: '#6a5040', showGrid: false, show3D: false,
  showHatching: false, hatchColor: '#000000', showWallOutline: true,
  wallOutlineColor: '#000000', wallOutlineStyle: 'clean', texture: DEFAULT_TEXTURE_SETTINGS,
}

export const BUILT_IN_STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'classic-parchment', name: 'Classic parchment', style: base },
  { id: 'stone-keep', name: 'Stone keep', style: { ...base, wallColor: '#353330', wallOpacity: 1, floorColor: '#c5beb0', isoFaceColor: '#675e52', show3D: true, showWallOutline: true, wallOutlineColor: '#292725', texture: { ...DEFAULT_TEXTURE_SETTINGS, pattern: 'diagonal', opacity: 18 } } },
  { id: 'cavern-ink', name: 'Cavern ink', style: { ...base, wallColor: '#201a22', wallOpacity: 1, floorColor: '#d4cbbb', showHatching: true, hatchColor: '#615763', wallOutlineStyle: 'rough', texture: { ...DEFAULT_TEXTURE_SETTINGS, pattern: 'crosshatch', opacity: 20 } } },
]

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function normalizeTextureSettings(raw: unknown): TextureSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_TEXTURE_SETTINGS }
  const value = raw as Record<string, unknown>
  const pattern: TexturePattern = ['none', 'dots', 'diagonal', 'crosshatch'].includes(String(value.pattern)) ? value.pattern as TexturePattern : 'none'
  const scope: TextureScope = value.scope === 'active-layer' ? 'active-layer' : 'map'
  const scale = typeof value.scale === 'number' && Number.isFinite(value.scale) ? Math.max(0.25, Math.min(4, value.scale)) : 1
  const opacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? Math.max(0, Math.min(100, value.opacity)) : DEFAULT_TEXTURE_SETTINGS.opacity
  return { pattern, scope, scale, opacity, color: isHexColor(value.color) ? value.color : DEFAULT_TEXTURE_SETTINGS.color }
}

export function normalizeVisualStyle(raw: unknown): VisualStyle {
  if (typeof raw !== 'object' || raw === null) return { ...base, texture: { ...DEFAULT_TEXTURE_SETTINGS } }
  const value = raw as Record<string, unknown>
  const opacity = (key: string, fallback: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(0, Math.min(1, value[key] as number)) : fallback
  const color = (key: string, fallback: string) => isHexColor(value[key]) ? value[key] as string : fallback
  return {
    wallColor: color('wallColor', base.wallColor), wallOpacity: opacity('wallOpacity', base.wallOpacity),
    floorColor: color('floorColor', FLOOR_COLOR), waterColor: color('waterColor', WATER_COLOR),
    lavaColor: color('lavaColor', LAVA_COLOR), darknessColor: color('darknessColor', DARKNESS_COLOR),
    isoFaceColor: color('isoFaceColor', base.isoFaceColor), showGrid: value.showGrid === true, show3D: value.show3D === true,
    showHatching: value.showHatching === true, hatchColor: color('hatchColor', base.hatchColor),
    showWallOutline: value.showWallOutline !== false, wallOutlineColor: color('wallOutlineColor', base.wallOutlineColor),
    wallOutlineStyle: value.wallOutlineStyle === 'rough' ? 'rough' : 'clean',
    texture: normalizeTextureSettings(value.texture),
  }
}

export function normalizeCustomStylePresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  const builtIns = new Set(BUILT_IN_STYLE_PRESETS.map(preset => preset.id))
  return raw.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const value = entry as Record<string, unknown>
    if (typeof value.id !== 'string' || !value.id || ids.has(value.id) || builtIns.has(value.id) || typeof value.name !== 'string' || !value.name.trim()) return []
    ids.add(value.id)
    return [{ id: value.id, name: value.name.trim().slice(0, 48), style: normalizeVisualStyle(value.style) }]
  })
}
