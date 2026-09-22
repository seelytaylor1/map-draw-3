import { createGrid, resizeGrid } from './grid'
import type { MapLayer } from './layers'
import { getTileColor, WALL, type TileState } from './constants'

export type LayerGrids = Map<string, Map<number, Uint8Array>>

/** Migrates the former Level Stack into the default named layer. */
export function createLayerGrids(raw: LayerGrids | undefined, legacyGrids: Map<number, Uint8Array>): LayerGrids {
  if (raw && raw.size > 0) return new Map([...raw].map(([layerId, grids]) => [layerId, new Map(grids)]))
  return new Map([['map', new Map(legacyGrids)]])
}

export function getLayerGrid(layerGrids: LayerGrids, layer: MapLayer, z: number, cols: number, rows: number): Uint8Array {
  return layerGrids.get(layer.id)?.get(z) ?? createGrid(cols, rows)
}

export function setLayerGrid(layerGrids: LayerGrids, layerId: string, z: number, grid: Uint8Array): LayerGrids {
  const next = new Map(layerGrids)
  const layer = new Map(next.get(layerId))
  layer.set(z, grid)
  next.set(layerId, layer)
  return next
}

/** Composites visible same-Z tile layers in draw order. Wall means no upper-layer paint. */
export function composeLayerGrid(layers: readonly MapLayer[], layerGrids: LayerGrids, z: number, cols: number, rows: number): Uint8Array {
  const output = createGrid(cols, rows)
  for (const layer of layers) {
    if (!layer.visible) continue
    const grid = layerGrids.get(layer.id)?.get(z)
    if (!grid) continue
    for (let index = 0; index < output.length; index++) {
      if (grid[index] !== WALL) output[index] = grid[index]
    }
  }
  return output
}

function parseColor(hex: string): [number, number, number] {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex : '#000000'
  return [1, 3, 5].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number]
}

function overlayColor(bottom: [number, number, number], bottomAlpha: number, top: [number, number, number], topAlpha: number): { color: [number, number, number]; alpha: number } {
  const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
  if (alpha <= 0) return { color: [0, 0, 0], alpha: 0 }
  return {
    color: bottom.map((channel, index) => Math.round((top[index] * topAlpha + channel * bottomAlpha * (1 - topAlpha)) / alpha)) as [number, number, number],
    alpha,
  }
}

/** Per-cell source-over color compositing for same-Z tile layers. */
export function composeLayerTileColors(
  layers: readonly MapLayer[], layerGrids: LayerGrids, z: number, cols: number, rows: number,
  wallColor: string, wallOpacity: number, environmentalColors: Map<TileState, string>,
): Map<number, string> {
  const result = new Map<number, string>()
  const wall = parseColor(wallColor)
  for (let index = 0; index < cols * rows; index++) {
    let color = wall
    let alpha = Math.min(1, Math.max(0, wallOpacity))
    for (const layer of layers) {
      if (!layer.visible) continue
      const state = layerGrids.get(layer.id)?.get(z)?.[index]
      if (state === undefined || state === WALL) continue
      const cellColor = getTileColor(state as TileState, environmentalColors)
      if (cellColor === 'transparent') continue
      const composed = overlayColor(color, alpha, parseColor(cellColor), layer.opacity / 100)
      color = composed.color
      alpha = composed.alpha
    }
    result.set(index, `rgba(${color[0]},${color[1]},${color[2]},${Number(alpha.toFixed(4))})`)
  }
  return result
}

export function resizeLayerGrids(layerGrids: LayerGrids, oldCols: number, oldRows: number, newCols: number, newRows: number): LayerGrids {
  return new Map(Array.from(layerGrids, ([layerId, grids]) => [
    layerId,
    new Map(Array.from(grids, ([z, grid]) => [z, resizeGrid(grid, oldCols, oldRows, newCols, newRows)])),
  ]))
}
