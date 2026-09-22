import { isoFloorPointsAtZ } from './iso'
import { Z_STEP_HEIGHT } from './constants'

export interface MapLight {
  id: string
  name: string
  col: number
  row: number
  z: number
  layerId?: string
  color: string
  intensity: number
  brightRadius: number
  dimRadius: number
}

export interface LightingSettings {
  enabled: boolean
  ambientColor: string
  darkness: number
}

export interface LightingCanvas {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

export const DEFAULT_LIGHTING_SETTINGS: LightingSettings = { enabled: false, ambientColor: '#151526', darkness: 0.72 }

export function normalizeLightingSettings(raw: unknown): LightingSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_LIGHTING_SETTINGS }
  const value = raw as Record<string, unknown>
  return {
    enabled: value.enabled === true,
    ambientColor: typeof value.ambientColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.ambientColor) ? value.ambientColor : DEFAULT_LIGHTING_SETTINGS.ambientColor,
    darkness: typeof value.darkness === 'number' && Number.isFinite(value.darkness) ? Math.max(0, Math.min(1, value.darkness)) : DEFAULT_LIGHTING_SETTINGS.darkness,
  }
}

export function normalizeLights(raw: unknown): MapLight[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const value = entry as Record<string, unknown>
    if (typeof value.id !== 'string' || typeof value.col !== 'number' || typeof value.row !== 'number') return []
    const bright = typeof value.brightRadius === 'number' && Number.isFinite(value.brightRadius) ? Math.max(0, Math.min(40, value.brightRadius)) : 3
    const dim = typeof value.dimRadius === 'number' && Number.isFinite(value.dimRadius) ? Math.max(bright, Math.min(60, value.dimRadius)) : Math.max(bright, 6)
    const light: MapLight = {
      id: value.id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 48) : 'Light',
      col: value.col, row: value.row,
      z: typeof value.z === 'number' && Number.isFinite(value.z) ? value.z : 0,
      color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#ffcb70',
      intensity: typeof value.intensity === 'number' && Number.isFinite(value.intensity) ? Math.max(0, Math.min(1, value.intensity)) : 1,
      brightRadius: bright,
      dimRadius: dim,
    }
    if (typeof value.layerId === 'string') light.layerId = value.layerId
    return [light]
  })
}

function colorChannels(color: string): [number, number, number] {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'
  return [1, 3, 5].map(index => Number.parseInt(safe.slice(index, index + 2), 16)) as [number, number, number]
}

function lineBlocked(grid: Uint8Array, cols: number, fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
  let x = fromCol, y = fromRow
  const dx = Math.abs(toCol - fromCol), sx = fromCol < toCol ? 1 : -1
  const dy = -Math.abs(toRow - fromRow), sy = fromRow < toRow ? 1 : -1
  let error = dx + dy
  while (x !== toCol || y !== toRow) {
    const twice = 2 * error
    if (twice >= dy) { error += dy; x += sx }
    if (twice <= dx) { error += dx; y += sy }
    if (x === toCol && y === toRow) break
    if (grid[y * cols + x] === 0) return true
  }
  return false
}

function lightAt(grid: Uint8Array, cols: number, col: number, row: number, z: number, lights: readonly MapLight[]) {
  let remaining = 1
  let weight = 0
  let red = 0, green = 0, blue = 0
  for (const light of lights) {
    if (light.z !== z || light.intensity <= 0) continue
    const distance = Math.hypot(col + 0.5 - (light.col + 0.5), row + 0.5 - (light.row + 0.5))
    if (distance > light.dimRadius) continue
    const fromCol = Math.max(0, Math.min(cols - 1, Math.floor(light.col)))
    const fromRow = Math.max(0, Math.min(Math.floor(grid.length / cols) - 1, Math.floor(light.row)))
    if (lineBlocked(grid, cols, fromCol, fromRow, col, row)) continue
    const falloff = distance <= light.brightRadius || light.dimRadius <= light.brightRadius
      ? 1
      : Math.max(0, 1 - (distance - light.brightRadius) / (light.dimRadius - light.brightRadius))
    const energy = falloff * light.intensity
    if (energy <= 0) continue
    remaining *= 1 - energy
    const channels = colorChannels(light.color)
    red += channels[0] * energy; green += channels[1] * energy; blue += channels[2] * energy
    weight += energy
  }
  const illumination = 1 - remaining
  const color = weight > 0
    ? `rgb(${Math.round(red / weight)},${Math.round(green / weight)},${Math.round(blue / weight)})`
    : ''
  return { illumination, color }
}

export function createLightingCanvas(
  grid: Uint8Array,
  cols: number,
  rows: number,
  lights: readonly MapLight[],
  settings: LightingSettings,
  tileSize: number,
  isometric: boolean,
  z = 0,
): LightingCanvas | null {
  if (!settings.enabled || settings.darkness <= 0 && lights.length === 0) return null
  const offsetX = isometric ? rows * tileSize : 0
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(isometric ? (cols + rows) * tileSize : cols * tileSize))
  canvas.height = Math.max(1, Math.ceil(isometric ? (cols + rows) * tileSize / 2 : rows * tileSize))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (isometric) ctx.translate(offsetX, z * Z_STEP_HEIGHT)
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const { illumination, color } = lightAt(grid, cols, col, row, z, lights)
    const darkness = settings.darkness * (1 - illumination)
    const lightTint = illumination * 0.38
    if (darkness <= 0.001 && lightTint <= 0.001) continue
    let left: number, top: number, width: number, height: number
    ctx.save()
    if (isometric) {
      const points = isoFloorPointsAtZ(col, row, tileSize * 2, tileSize, z)
      ctx.beginPath(); ctx.moveTo(points[0], points[1])
      for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1])
      ctx.closePath(); ctx.clip()
      left = Math.min(points[0], points[2], points[4], points[6])
      top = Math.min(points[1], points[3], points[5], points[7])
      width = Math.max(points[0], points[2], points[4], points[6]) - left
      height = Math.max(points[1], points[3], points[5], points[7]) - top
    } else {
      left = col * tileSize; top = row * tileSize; width = height = tileSize
    }
    if (darkness > 0.001) {
      ctx.globalAlpha = darkness
      ctx.fillStyle = settings.ambientColor
      if (isometric) ctx.fillRect(left, top, width, height)
      else ctx.fillRect(left, top, width, height)
    }
    if (lightTint > 0.001 && color) {
      ctx.globalAlpha = lightTint
      ctx.fillStyle = color
      ctx.fillRect(left, top, width, height)
    }
    ctx.restore()
  }
  return { canvas, x: -offsetX, y: -z * Z_STEP_HEIGHT }
}
