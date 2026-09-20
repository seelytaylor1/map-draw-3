import { describe, it, expect } from 'vitest'
import { buildLabelScene, buildTileScene, buildStampScene } from './viewportScene'
import { createGrid, paintTiles } from './grid'
import { FLOOR, WALL, WATER, LAVA, DARKNESS, WATER_COLOR } from './constants'
import type { Stamp } from './stamps'

const TILE_PX = 60

function fakeImage(): HTMLImageElement {
  return { naturalWidth: 60, naturalHeight: 60 } as unknown as HTMLImageElement
}

describe('buildStampScene — top-down view of object stamps', () => {
  const objectStamp: Stamp = { id: 'a', type: 'g1002', col: 1, row: 1, rotation: 0, z: 0 }

  it('is interactive (selectable/draggable) at the active Z level, same as a floor stamp', () => {
    const items = buildStampScene({
      stamps: [objectStamp],
      selectedStampId: null,
      stampImages: new Map([['g1002', fakeImage()]]),
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
      stampImages: new Map([['g1002', fakeImage()], ['door', fakeImage()]]),
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
      stampImages: new Map([['g1002', fakeImage()]]),
      activeZ: 0,
      tilePx: TILE_PX,
      showIso: false,
    })

    expect(items[0].selected).toBe(true)
    expect(items[0].selectionRect).not.toBeNull()
  })

  it('keeps a stamp color override attached to that stamp in top-down and iso views', () => {
    const coloredFloorStamp: Stamp = { id: 'color-floor', type: 'door', col: 0, row: 0, rotation: 0, z: 0, color: '#e04b61' }
    const coloredObjectStamp: Stamp = { id: 'color-object', type: 'g1002', col: 0, row: 0, rotation: 0, z: 0, color: '#4b83e0' }
    const images = new Map([['door', fakeImage()], ['g1002', fakeImage()]])

    const topDown = buildStampScene({ stamps: [coloredFloorStamp, coloredObjectStamp], selectedStampId: null, stampImages: images, activeZ: 0, tilePx: TILE_PX, showIso: false })
    const iso = buildStampScene({ stamps: [coloredFloorStamp, coloredObjectStamp], selectedStampId: null, stampImages: images, activeZ: 0, tilePx: TILE_PX, showIso: true })

    expect(topDown.find(item => item.id === 'color-floor')?.variant.color).toBe('#e04b61')
    expect(topDown.find(item => item.id === 'color-object')?.variant.color).toBe('#4b83e0')
    expect(iso.find(item => item.id === 'color-floor')?.variant.color).toBe('#e04b61')
    expect(iso.find(item => item.id === 'color-object')?.variant.color).toBe('#4b83e0')
  })
})

describe('buildLabelScene', () => {
  it('keeps label text visible after adding a number prefix', () => {
    const items = buildLabelScene([
      { id: 'label-1', col: 1, row: 2, text: 'Throne Room', number: 3 },
    ], null, TILE_PX)

    expect(items[0].text).toBe('3 Throne Room')
  })

  it('keeps a label color in the scene for rendering', () => {
    const items = buildLabelScene([
      { id: 'key-cycle', col: 1, row: 2, text: 'Key loop-1', color: '#d52b35' },
    ], null, TILE_PX)

    expect(items[0].color).toBe('#d52b35')
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
    environmentalColors: new Map(),
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

describe('buildTileScene — active blank levels', () => {
  it('renders the selected level even before its first tile is painted', () => {
    const { levels } = buildTileScene(tileSceneParams({
      activeZ: 1,
      grids: new Map([[0, createGrid(3, 3)]]),
    }))

    expect(levels.map(level => level.z)).toEqual([0, 1])
    expect(levels[1].opacity).toBe(1)
    expect(levels[1].grid).toEqual(createGrid(3, 3))
  })
})

describe('buildTileScene — run wall openings', () => {
  it('breaks the wall outline where an exterior run enters the room', () => {
    const grid = paintTiles(createGrid(7, 7), 7, [
      { col: 3, row: 2 }, { col: 4, row: 2 },
      { col: 3, row: 3 }, { col: 4, row: 3 },
    ], FLOOR)
    const ramps = [{ id: 'outside-entry', col: 2, row: 3, z: 0, direction: 'E' as const }]
    const { levels } = buildTileScene(tileSceneParams({
      grids: new Map([[0, grid]]),
      ramps,
      showWallOutline: true,
    }))

    const outline = levels[0].outline!
    const wallLineAcrossEntry = outline.segments.some(({ points }) =>
      points[0] === 60 && points[1] === 60 && points[2] === 60 && points[3] === 80,
    )

    expect(wallLineAcrossEntry).toBe(false)
    expect(levels[0].grid[3 * 7 + 2]).toBe(WALL)
  })
})
