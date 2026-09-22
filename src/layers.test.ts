import { describe, expect, it } from 'vitest'
import { createDefaultLayer, moveLayer, normalizeLayers, removeLayer } from './layers'

describe('named layers', () => {
  it('migrates a legacy map to one visible, unlocked Map layer on ground level', () => {
    expect(normalizeLayers(undefined)).toEqual([createDefaultLayer()])
  })

  it('normalizes persisted layer state without making hidden or locked layers editable', () => {
    expect(normalizeLayers([
      { id: 'gm-notes', name: 'GM notes', targetZ: 2, visible: false, opacity: 35, locked: true },
    ])).toEqual([
      { id: 'gm-notes', name: 'GM notes', targetZ: 2, visible: false, opacity: 35, locked: true },
    ])
  })

  it('reorders layers and never removes the last remaining layer', () => {
    const layers = [createDefaultLayer(), { id: 'notes', name: 'Notes', targetZ: 0, visible: true, opacity: 100, locked: false }]
    expect(moveLayer(layers, 'notes', 'back').map(layer => layer.id)).toEqual(['notes', 'map'])
    expect(removeLayer(layers, 'map').map(layer => layer.id)).toEqual(['notes'])
    expect(removeLayer([createDefaultLayer()], 'map')).toEqual([createDefaultLayer()])
  })
})
