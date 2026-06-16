import { describe, it, expect } from 'vitest'
import { buildStampScene } from './viewportScene'
import type { Stamp } from './stamps'

const TILE_PX = 60

function fakeImage(): HTMLImageElement {
  return { naturalWidth: 60, naturalHeight: 60 } as unknown as HTMLImageElement
}

describe('buildStampScene — top-down view of object stamps', () => {
  const objectStamp: Stamp = { id: 'a', type: 'archway', col: 1, row: 1, rotation: 0, z: 0 }

  it('is interactive (selectable/draggable) at the active Z level, same as a floor stamp', () => {
    const items = buildStampScene({
      stamps: [objectStamp],
      selectedStampId: null,
      stampImages: new Map([['archway', fakeImage()]]),
      activeZ: 0,
      tilePx: TILE_PX,
      showIso: false,
    })

    expect(items).toHaveLength(1)
    expect(items[0].interactive).toBe(true)
    expect(items[0].variant.kind).toBe('topdown')
    if (items[0].variant.kind === 'topdown') {
      expect(items[0].variant.draggable).toBe(true)
      expect(items[0].variant.listening).toBe(true)
    }
  })

  it('renders at full opacity at the active Z level, not the old reduced-opacity ghost', () => {
    const floorStamp: Stamp = { id: 'b', type: 'door', col: 2, row: 1, rotation: 0, z: 0 }
    const items = buildStampScene({
      stamps: [objectStamp, floorStamp],
      selectedStampId: null,
      stampImages: new Map([['archway', fakeImage()], ['door', fakeImage()]]),
      activeZ: 0,
      tilePx: TILE_PX,
      showIso: false,
    })

    const objectItem = items.find(i => i.id === 'a')!
    const floorItem = items.find(i => i.id === 'b')!
    expect(objectItem.variant.kind).toBe('topdown')
    expect(floorItem.variant.kind).toBe('topdown')
    if (objectItem.variant.kind === 'topdown' && floorItem.variant.kind === 'topdown') {
      expect(objectItem.variant.opacity).toBe(floorItem.variant.opacity)
    }
  })

  it('can be selected, producing a selectionRect', () => {
    const items = buildStampScene({
      stamps: [objectStamp],
      selectedStampId: 'a',
      stampImages: new Map([['archway', fakeImage()]]),
      activeZ: 0,
      tilePx: TILE_PX,
      showIso: false,
    })

    expect(items[0].selected).toBe(true)
    expect(items[0].selectionRect).not.toBeNull()
  })
})
