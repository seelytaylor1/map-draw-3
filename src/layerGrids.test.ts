import { describe, expect, it } from 'vitest'
import { createDefaultLayer } from './layers'
import { composeLayerGrid, createLayerGrids, getLayerGrid, resizeLayerGrids } from './layerGrids'

describe('layer tile grids', () => {
  it('migrates legacy level grids into the default Map layer without changing tile data', () => {
    const legacy = new Map([[0, new Uint8Array([1, 0, 1, 1])], [1, new Uint8Array([0, 1, 0, 0])]])
    const layerGrids = createLayerGrids(undefined, legacy)

    expect(layerGrids.get('map')).toEqual(legacy)
  })

  it('gives an added layer an independent default grid on demand', () => {
    const layer = { ...createDefaultLayer(), id: 'notes' }
    const grids = createLayerGrids(undefined, new Map())

    expect(getLayerGrid(grids, layer, 0, 2, 2)).toEqual(new Uint8Array([0, 0, 0, 0]))
    expect(getLayerGrid(grids, layer, 0, 2, 2)).not.toBe(getLayerGrid(grids, layer, 0, 2, 2))
  })

  it('composites visible layers in draw order without letting an empty upper grid erase lower content', () => {
    const layers = [
      createDefaultLayer(),
      { id: 'notes', name: 'Notes', targetZ: 0, visible: true, opacity: 100, locked: false },
    ]
    const layerGrids = new Map([
      ['map', new Map([[0, new Uint8Array([1, 1, 0, 0])]])],
      ['notes', new Map([[0, new Uint8Array([0, 2, 1, 0])]])],
    ])

    expect(composeLayerGrid(layers, layerGrids, 0, 2, 2)).toEqual(new Uint8Array([1, 2, 1, 0]))
  })

  it('resizes every layer grid without merging layer content', () => {
    const resized = resizeLayerGrids(new Map([
      ['map', new Map([[0, new Uint8Array([1, 0, 0, 0])]])],
      ['notes', new Map([[0, new Uint8Array([0, 2, 0, 0])]])],
    ]), 2, 2, 3, 2)

    expect(resized.get('map')?.get(0)).toEqual(new Uint8Array([1, 0, 0, 0, 0, 0]))
    expect(resized.get('notes')?.get(0)).toEqual(new Uint8Array([0, 2, 0, 0, 0, 0]))
  })
})
