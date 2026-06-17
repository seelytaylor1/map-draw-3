import { describe, it, expect } from 'vitest'
import { buildTileScene, buildStampScene } from './viewportScene'
import { createGrid, paintTiles } from './grid'
import { FLOOR, WATER, LAVA, DARKNESS, WATER_COLOR } from './constants'
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

function tileSceneParams(overrides = {}) {
  return {
    grids: new Map([[0, createGrid(3, 3)]]),
    steps: [],
    ramps: [],
    cols: 3,
    rows: 3,
    activeZ: 0,
    tilePx: 20,
    facePx: 8,
    show3D: false,
    showGrid: false,
    showHatching: false,
    showWallOutline: false,
    wallOutlineColor: '#000000',
    wallOutlineStyle: 'clean' as const,
    wallColor: '#000000',
    wallOpacity: 0,
    selectedStepId: null,
    selectedRampId: null,
    waterColor: WATER_COLOR,
    lavaColor: '#c1440e',
    darknessColor: '#1a0a2e',
    ...overrides,
  }
}

describe('buildTileScene — fluid tile fill colors', () => {
  it('water tile uses waterColor param', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 1, row: 1 }], WATER)
    const grids = new Map([[0, grid]])
    const { levels } = buildTileScene(tileSceneParams({ grids, waterColor: '#aabbcc' }))
    const tile = levels[0].tiles.find(t => t.rect.x === 20 && t.rect.y === 20)
    expect(tile?.fill).toBe('#aabbcc')
  })

  it('lava tile uses lavaColor param', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 0, row: 0 }], LAVA)
    const grids = new Map([[0, grid]])
    const { levels } = buildTileScene(tileSceneParams({ grids, lavaColor: '#ff3300' }))
    const tile = levels[0].tiles.find(t => t.rect.x === 0 && t.rect.y === 0)
    expect(tile?.fill).toBe('#ff3300')
  })

  it('darkness tile uses darknessColor param', () => {
    const grid = paintTiles(createGrid(3, 3), 3, [{ col: 2, row: 1 }], DARKNESS)
    const grids = new Map([[0, grid]])
    const { levels } = buildTileScene(tileSceneParams({ grids, darknessColor: '#220033' }))
    const tile = levels[0].tiles.find(t => t.rect.x === 40 && t.rect.y === 20)
    expect(tile?.fill).toBe('#220033')
  })
})
