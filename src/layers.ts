export interface MapLayer {
  id: string
  name: string
  targetZ: number
  visible: boolean
  opacity: number
  locked: boolean
}

export const DEFAULT_LAYER_ID = 'map'

export function createDefaultLayer(): MapLayer {
  return { id: DEFAULT_LAYER_ID, name: 'Map', targetZ: 0, visible: true, opacity: 100, locked: false }
}

/** Returns safe named-layer state, including the visual-equivalent legacy migration. */
export function normalizeLayers(raw: unknown): MapLayer[] {
  if (!Array.isArray(raw)) return [createDefaultLayer()]
  const layers: MapLayer[] = []
  const ids = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const value = entry as Record<string, unknown>
    if (typeof value.id !== 'string' || value.id.length === 0 || ids.has(value.id)) continue
    if (typeof value.name !== 'string' || value.name.trim().length === 0) continue
    if (typeof value.targetZ !== 'number' || !Number.isFinite(value.targetZ)) continue
    ids.add(value.id)
    layers.push({
      id: value.id,
      name: value.name.trim(),
      targetZ: value.targetZ,
      visible: value.visible !== false,
      opacity: typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? Math.min(100, Math.max(0, value.opacity)) : 100,
      locked: value.locked === true,
    })
  }
  return layers.length > 0 ? layers : [createDefaultLayer()]
}

export function moveLayer(layers: readonly MapLayer[], id: string, direction: 'forward' | 'back'): MapLayer[] {
  const index = layers.findIndex(layer => layer.id === id)
  const target = direction === 'forward' ? index + 1 : index - 1
  if (index < 0 || target < 0 || target >= layers.length) return [...layers]
  const result = [...layers]
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

export function removeLayer(layers: readonly MapLayer[], id: string): MapLayer[] {
  return layers.length > 1 ? layers.filter(layer => layer.id !== id) : [...layers]
}
