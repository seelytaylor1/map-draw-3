import { describe, expect, it } from 'vitest'
import { FLOOR, GRASS, WALL } from './constants'
import { createGrid } from './grid'
import type { LayerGrids } from './layerGrids'
import { createDefaultLayer, type MapLayer } from './layers'
import type { Label } from './labels'
import type { MapLight } from './lighting'
import type { RampRun } from './ramps'
import { type TileBounds } from './selection'
import type { Stamp } from './stamps'
import type { StepRun } from './steps'
import { applyMapFragment, extractMapFragment, MAX_FRAGMENT_TERRAIN_CELLS, transformMapFragment } from './roomEditing'
import { createHistory, push, redo, undo } from './history'

describe('extractMapFragment', () => {
  it('captures raw terrain and anchor-selected objects on unlocked layers', () => {
    const mapLayer: MapLayer = createDefaultLayer()
    const overlayLayer: MapLayer = {
      id: 'overlay', name: 'Overlay', targetZ: 0, visible: false, opacity: 60, locked: false,
    }
    const lockedLayer: MapLayer = {
      id: 'locked', name: 'Locked', targetZ: 0, visible: true, opacity: 100, locked: true,
    }
    const mapGrid = createGrid(5, 5)
    mapGrid[1 * 5 + 1] = FLOOR
    const overlayGrid = createGrid(5, 5)
    overlayGrid[2 * 5 + 2] = GRASS
    const lockedGrid = createGrid(5, 5)
    lockedGrid[1 * 5 + 1] = GRASS
    const layerGrids: LayerGrids = new Map([
      ['map', new Map([[0, mapGrid]])],
      ['overlay', new Map([[0, overlayGrid]])],
      ['locked', new Map([[0, lockedGrid]])],
    ])
    const bounds: TileBounds = { minCol: 1, minRow: 1, maxCol: 2, maxRow: 2 }
    const stamps: Stamp[] = [
      { id: 'custom', type: 'custom-image-1', col: 1, row: 1, rotation: 0, z: 0, layerId: 'overlay', aspectRatio: 2 },
      { id: 'outside', type: 'door', col: 3, row: 2, rotation: 0, z: 0, layerId: 'map' },
      { id: 'locked-stamp', type: 'door', col: 1, row: 1, rotation: 0, z: 0, layerId: 'locked' },
    ]
    const steps: StepRun[] = [
      { id: 'inside-run', col: 1, row: 1, z: 0, direction: 'E', layerId: 'map' },
      { id: 'partial-run', col: 2, row: 1, z: 0, direction: 'E', layerId: 'map' },
    ]
    const ramps: RampRun[] = [
      { id: 'inside-ramp', col: 1, row: 2, z: 0, direction: 'E', layerId: 'overlay' },
    ]
    const labels: Label[] = [
      { id: 'label', col: 2, row: 2, z: 0, layerId: 'map', text: 'A' },
      { id: 'outside-label', col: 3, row: 2, z: 0, layerId: 'map', text: 'B' },
    ]
    const lights: MapLight[] = [
      { id: 'light', name: 'Lamp', col: 1, row: 2, z: 0, layerId: 'overlay', color: '#ffffff', intensity: 1, brightRadius: 1, dimRadius: 3 },
    ]

    const fragment = extractMapFragment({
      layers: [mapLayer, overlayLayer, lockedLayer], layerGrids, stamps, steps, ramps, labels, lights,
      cols: 5, rows: 5, z: 0, bounds, layerIds: ['map', 'overlay', 'locked'],
    })

    expect(fragment.sourceBounds).toEqual(bounds)
    expect(fragment.layerIds).toEqual(['map', 'overlay'])
    expect(fragment.terrain).toHaveLength(8)
    expect(fragment.terrain).toContainEqual({ layerId: 'map', col: 0, row: 0, zOffset: 0, state: FLOOR })
    expect(fragment.terrain).toContainEqual({ layerId: 'overlay', col: 1, row: 1, zOffset: 0, state: GRASS })
    expect(fragment.stamps.map(item => item.id)).toEqual(['custom'])
    expect(fragment.referencedCustomImages).toEqual(['custom-image-1'])
    expect(fragment.steps.map(item => item.id)).toEqual(['inside-run'])
    expect(fragment.ramps.map(item => item.id)).toEqual(['inside-ramp'])
    expect(fragment.labels.map(item => item.id)).toEqual(['label'])
    expect(fragment.lights.map(item => item.id)).toEqual(['light'])
    expect(fragment.terrain.every(tile => tile.state !== WALL || tile.layerId !== 'locked')).toBe(true)
  })

  it('rotates and reflects terrain, props, labels, lights, and run directions together', () => {
    const fragment = {
      sourceBounds: { minCol: 4, minRow: 5, maxCol: 6, maxRow: 6 }, sourceZ: 0,
      width: 3, height: 2, transformedBy: 'none' as const, layerIds: ['map'],
      terrain: [
        { layerId: 'map', col: 0, row: 0, zOffset: 0, state: FLOOR },
        { layerId: 'map', col: 2, row: 1, zOffset: 0, state: GRASS },
      ],
      stamps: [{ id: 'wide', type: 'TableLong2x1', col: 0, row: 1, rotation: 0 as const, zOffset: 0, layerId: 'map' }],
      steps: [{ id: 'stairs', col: 0, row: 0, zOffset: 0, direction: 'E' as const, layerId: 'map' }],
      ramps: [],
      labels: [{ id: 'room-label', col: 2, row: 0, zOffset: 0, text: 'B', layerId: 'map' }],
      lights: [{ id: 'light', name: 'Torch', col: 1, row: 1, zOffset: 0, layerId: 'map', color: '#ffffff', intensity: 1, brightRadius: 1, dimRadius: 3 }],
      referencedCustomImages: [],
    }

    const rotated = transformMapFragment(fragment, 'rotate-cw')
    expect(rotated).toMatchObject({ width: 2, height: 3 })
    expect(rotated.terrain).toEqual([
      { layerId: 'map', col: 1, row: 0, zOffset: 0, state: FLOOR },
      { layerId: 'map', col: 0, row: 2, zOffset: 0, state: GRASS },
    ])
    expect(rotated.stamps[0]).toMatchObject({ col: -0.5, row: 0.5, rotation: 90 })
    expect(rotated.steps[0]).toMatchObject({ col: 1, row: 0, direction: 'S' })
    expect(rotated.labels[0]).toMatchObject({ col: 1, row: 2 })
    expect(rotated.lights[0]).toMatchObject({ col: 0, row: 1 })

    const mirrored = transformMapFragment(fragment, 'reflect-horizontal')
    expect(mirrored.terrain).toEqual([
      { layerId: 'map', col: 2, row: 0, zOffset: 0, state: FLOOR },
      { layerId: 'map', col: 0, row: 1, zOffset: 0, state: GRASS },
    ])
    expect(mirrored.stamps[0]).toMatchObject({ col: 1, row: 1, mirrored: true })
    expect(mirrored.steps[0]).toMatchObject({ col: 2, row: 0, direction: 'W' })
  })

  it('moves overlapping terrain from a snapshot without losing source cells', () => {
    const mapLayer = createDefaultLayer()
    const lockedLayer: MapLayer = { id: 'locked', name: 'Locked', targetZ: 0, visible: true, opacity: 100, locked: true }
    const grid = createGrid(5, 1)
    grid[0] = FLOOR
    grid[1] = GRASS
    grid[2] = FLOOR
    const lockedGrid = createGrid(5, 1)
    lockedGrid[1] = GRASS
    const snapshot = {
      activeLayerId: 'map', grids: new Map([[0, grid]]),
      layerGrids: new Map([['map', new Map([[0, grid]])], ['locked', new Map([[0, lockedGrid]])]]) as LayerGrids,
      layers: [mapLayer, lockedLayer], stamps: [], steps: [], ramps: [], labels: [], lights: [],
      roomLedgerEntries: [], generalNotes: [], environmentalColors: new Map<number, string>(),
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 5, rows: 1, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 1, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({ snapshot, fragment, destination: { col: 1, row: 0 }, mode: 'move', cols: 5, rows: 1 })

    expect(result.error).toBeUndefined()
    expect([...result.snapshot.layerGrids.get('map')!.get(0)!]).toEqual([WALL, FLOOR, GRASS, WALL, WALL])
    expect([...result.snapshot.layerGrids.get('locked')!.get(0)!]).toEqual([WALL, GRASS, WALL, WALL, WALL])
    expect(result.snapshot.grids.get(0)).toBe(result.snapshot.layerGrids.get('map')!.get(0))
    expect(result.changed).toBe(true)
  })

  it('copies content with fresh object and group IDs while leaving the source intact', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 2)
    grid[0] = FLOOR
    const stamp: Stamp = { id: 'source-stamp', type: 'door', col: 0, row: 0, rotation: 0, z: 0, layerId: 'map', groupId: 'source-group' }
    const label: Label = { id: 'source-label', col: 0, row: 0, z: 0, layerId: 'map', text: '1', groupId: 'source-group' }
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [stamp], steps: [], ramps: [], labels: [label], lights: [],
      environmentalColors: new Map<number, string>([[GRASS, '#112233']]),
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 2, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({
      snapshot, fragment, destination: { col: 2, row: 0 }, mode: 'copy', cols: 4, rows: 2,
      createId: (kind, id) => `copy-${kind}-${id}`,
      createGroupId: id => `copy-${id}`,
    })

    expect(result.error).toBeUndefined()
    expect(result.snapshot.stamps).toHaveLength(2)
    expect(result.snapshot.stamps[1]).toMatchObject({ id: 'copy-stamp-source-stamp', col: 2, row: 0, groupId: 'copy-source-group' })
    expect(result.snapshot.labels[1]).toMatchObject({ id: 'copy-label-source-label', col: 2, row: 0, groupId: 'copy-source-group' })
    expect(result.snapshot.layerGrids.get('map')!.get(0)![0]).toBe(FLOOR)
    expect(result.snapshot.layerGrids.get('map')!.get(0)![2]).toBe(FLOOR)
    expect(result.snapshot.environmentalColors).toBe(snapshot.environmentalColors)
    expect(snapshot.stamps).toEqual([stamp])
    expect(result.changed).toBe(true)
  })

  it('does not count retained source objects as overwritten in an overlapping copy preview', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(2, 1)
    grid[0] = FLOOR
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [{ id: 'door', type: 'door', col: 0, row: 0, rotation: 0 as const, z: 0, layerId: 'map' }],
      steps: [], ramps: [], labels: [{ id: 'label', col: 0, row: 0, z: 0, layerId: 'map', text: 'A' }], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 2, rows: 1, z: 0,
      bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({
      snapshot, fragment, destination: { col: 0, row: 0 }, mode: 'copy', cols: 2, rows: 1,
      createId: (kind, id) => `copy-${kind}-${id}`, createGroupId: id => `copy-${id}`,
    })

    expect(result.error).toBeUndefined()
    expect(result.overwrittenByZ).toEqual({ 0: { cells: 1, objects: 0 } })
    expect(result.snapshot.stamps).toHaveLength(2)
    expect(result.snapshot.labels).toHaveLength(2)
  })

  it('rejects an out-of-bounds destination without changing the input snapshot', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 1)
    grid[0] = FLOOR
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [], steps: [], ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 1, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 1, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({ snapshot, fragment, destination: { col: 3, row: 0 }, mode: 'move', cols: 4, rows: 1 })

    expect(result.error).toMatch(/map edge/)
    expect(result.snapshot).toBe(snapshot)
    expect(result.changed).toBe(false)
    expect([...snapshot.layerGrids.get('map')!.get(0)!]).toEqual([FLOOR, WALL, WALL, WALL])
  })

  it('rotates scaled pre-rotated stamps around their rendered type-footprint pivot', () => {
    const fragment = {
      sourceBounds: { minCol: 0, minRow: 0, maxCol: 3, maxRow: 2 }, sourceZ: 0,
      width: 4, height: 3, transformedBy: 'none' as const, layerIds: ['map'],
      terrain: [],
      stamps: [{ id: 'table', type: 'TableLong2x1', col: 1, row: 0, rotation: 90 as const, scale: 2, zOffset: 0 }],
      steps: [], ramps: [], labels: [], lights: [], referencedCustomImages: [],
    }

    const rotated = transformMapFragment(fragment, 'rotate-cw')
    const stamp = rotated.stamps[0]

    expect(stamp).toMatchObject({ col: 1.5, row: 1.5, rotation: 180, scale: 2 })
    // The rendered stamp center rotates from (2, 0.5) to (2.5, 2).
    expect(stamp.col + 1).toBe(2.5)
    expect(stamp.row + 0.5).toBe(2)
  })

  it('allows a rotated stamp whose stored anchor is negative but rendered bounds fit', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 4)
    const stamp: Stamp = { id: 'wide', type: 'TableLong2x1', col: 0, row: 1, rotation: 0, z: 0, layerId: 'map' }
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [stamp], steps: [], ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 4, z: 0,
      bounds: { minCol: 0, minRow: 0, maxCol: 2, maxRow: 1 }, layerIds: ['map'],
    })
    const rotated = transformMapFragment(fragment, 'rotate-cw')
    const result = applyMapFragment({ snapshot, fragment: rotated, destination: { col: 0, row: 0 }, mode: 'move', cols: 2, rows: 3 })

    expect(rotated.stamps[0]).toMatchObject({ col: -0.5, row: 0.5, rotation: 90 })
    expect(result.error).toBeUndefined()
    expect(result.snapshot.stamps[0]).toMatchObject({ col: -0.5, row: 0.5, rotation: 90 })

    const reselected = extractMapFragment({
      ...result.snapshot, cols: 2, rows: 3, z: 0,
      bounds: { minCol: 0, minRow: 1, maxCol: 0, maxRow: 1 }, layerIds: ['map'],
    })
    expect(reselected.stamps.map(item => item.id)).toEqual(['wide'])
    expect(reselected.stamps[0]).toMatchObject({ col: -0.5, row: -0.5 })
  })

  it('rejects a stamp footprint that crosses the map edge', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 1)
    const stamp: Stamp = { id: 'table', type: 'TableLong2x1', col: 0, row: 0, rotation: 0, scale: 1.5, z: 0, layerId: 'map' }
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [stamp], steps: [], ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 1, z: 0, bounds: { minCol: 1, minRow: 0, maxCol: 1, maxRow: 0 }, layerIds: ['map'],
    })
    expect(fragment.stamps).toHaveLength(1)

    const result = applyMapFragment({ snapshot, fragment, destination: { col: 3, row: 0 }, mode: 'move', cols: 4, rows: 1 })

    expect(result.error).toMatch(/stamp would extend beyond the map edge/)
    expect(result.snapshot).toBe(snapshot)
  })

  it('rejects a selected layer that becomes locked before commit', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 1)
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [], steps: [], ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 1, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })
    const lockedSnapshot = { ...snapshot, layers: [{ ...layer, locked: true }] }

    const result = applyMapFragment({ snapshot: lockedSnapshot, fragment, destination: { col: 2, row: 0 }, mode: 'move', cols: 4, rows: 1 })

    expect(result.error).toMatch(/layer is locked/)
    expect(result.snapshot).toBe(lockedSnapshot)
  })

  it('restores a whole-room move with one history undo and redo', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 2)
    grid[0] = FLOOR
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [{ id: 'door', type: 'door', col: 0, row: 0, rotation: 0 as const, z: 0, layerId: 'map' }],
      steps: [], ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 2, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })
    const applied = applyMapFragment({
      snapshot, fragment, destination: { col: 2, row: 1 }, mode: 'move', cols: 4, rows: 2,
    })
    const edited = push(createHistory(snapshot), applied.snapshot)

    expect(edited.past).toHaveLength(1)
    expect(undo(edited).present).toBe(snapshot)
    expect(redo(undo(edited)).present).toBe(applied.snapshot)
    expect(applied.snapshot.stamps[0]).toMatchObject({ col: 2, row: 1 })
    expect(applied.snapshot.layerGrids.get('map')!.get(0)![6]).toBe(FLOOR)
  })

  it('moves multiple sparse Z levels together using offsets from the active level', () => {
    const layer = createDefaultLayer()
    const ground = createGrid(4, 1)
    ground[0] = FLOOR
    const upper = createGrid(4, 1)
    upper[0] = GRASS
    const light: MapLight = { id: 'light', name: 'Lamp', col: 0, row: 0, z: 1, layerId: 'map', color: '#ffffff', intensity: 1, brightRadius: 1, dimRadius: 3 }
    const snapshot = {
      grids: new Map([[0, ground]]),
      layerGrids: new Map([['map', new Map([[0, ground], [2, upper]])]]) as LayerGrids,
      layers: [layer], stamps: [{ id: 'upper-door', type: 'door', col: 0, row: 0, rotation: 0 as const, z: 2, layerId: 'map' }],
      steps: [], ramps: [], labels: [{ id: 'upper-label', col: 0, row: 0, z: 2, layerId: 'map', text: 'Upper' }], lights: [light],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 1, z: 0, zRange: { minZ: 0, maxZ: 2 },
      bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })

    expect(fragment.terrain.map(tile => tile.zOffset)).toEqual([0, 1, 2])
    expect(fragment.lights[0].zOffset).toBe(1)
    expect(fragment.stamps[0].zOffset).toBe(2)
    const moved = applyMapFragment({
      snapshot, fragment, destination: { col: 2, row: 0, z: 10 }, mode: 'move', cols: 4, rows: 1,
    })

    expect(moved.error).toBeUndefined()
    expect([...moved.snapshot.layerGrids.get('map')!.get(0)!]).toEqual([WALL, WALL, WALL, WALL])
    expect(moved.snapshot.layerGrids.get('map')!.get(10)![2]).toBe(FLOOR)
    expect(moved.snapshot.layerGrids.get('map')!.get(12)![2]).toBe(GRASS)
    expect(moved.snapshot.layerGrids.get('map')!.has(11)).toBe(false)
    expect(moved.snapshot.stamps[0]).toMatchObject({ col: 2, row: 0, z: 12 })
    expect(moved.snapshot.labels[0]).toMatchObject({ col: 2, row: 0, z: 12 })
    expect(moved.snapshot.lights?.[0]).toMatchObject({ col: 2, row: 0, z: 11 })
  })

  it('reports overwritten terrain and objects separately for each destination Z level', () => {
    const layer = createDefaultLayer()
    const source = createGrid(3, 1)
    source[0] = FLOOR
    const sourceUpper = createGrid(3, 1)
    sourceUpper[0] = GRASS
    const destination = createGrid(3, 1)
    destination[2] = FLOOR
    const destinationUpper = createGrid(3, 1)
    destinationUpper[2] = GRASS
    const snapshot = {
      grids: new Map([[0, source]]),
      layerGrids: new Map([['map', new Map([[0, source], [1, sourceUpper], [10, destination], [11, destinationUpper]])]]) as LayerGrids,
      layers: [layer], stamps: [], steps: [], ramps: [],
      labels: [
        { id: 'source-label', col: 0, row: 0, z: 0, layerId: 'map', text: 'source' },
        { id: 'destination-label', col: 2, row: 0, z: 11, layerId: 'map', text: 'destination' },
      ],
      lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 3, rows: 1, z: 0, zRange: { minZ: 0, maxZ: 1 },
      bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({ snapshot, fragment, destination: { col: 2, row: 0, z: 10 }, mode: 'move', cols: 3, rows: 1 })

    expect(result.overwrittenCellCount).toBe(2)
    expect(result.overwrittenObjectCount).toBe(1)
    expect(result.overwrittenByZ).toEqual({
      10: { cells: 1, objects: 0 },
      11: { cells: 1, objects: 1 },
    })
  })

  it('requires a bounded whole-Z range that includes the active level', () => {
    const layer = createDefaultLayer()
    const layerGrids = new Map([['map', new Map()]]) as LayerGrids
    const base = {
      layers: [layer], layerGrids, stamps: [], steps: [], ramps: [], labels: [], lights: [],
      cols: 2, rows: 2, z: 0, bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    }

    expect(() => extractMapFragment({ ...base, zRange: { minZ: 1, maxZ: 2 } })).toThrow(/include the active z level/i)
    expect(() => extractMapFragment({ ...base, zRange: { minZ: 0, maxZ: MAX_FRAGMENT_TERRAIN_CELLS } })).toThrow(/too large/i)
  })

  it('rejects destination placement that would split an existing run', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(5, 1)
    grid[0] = FLOOR
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [],
      steps: [{ id: 'crossing-stairs', col: 2, row: 0, z: 0, direction: 'E' as const, layerId: 'map' }],
      ramps: [{ id: 'crossing-ramp', col: 2, row: 0, z: 0, direction: 'E' as const, layerId: 'map' }],
      labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 5, rows: 1, z: 0,
      bounds: { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({ snapshot, fragment, destination: { col: 3, row: 0 }, mode: 'move', cols: 5, rows: 1 })

    expect(result.error).toMatch(/partially overlaps the destination/i)
    expect(result.snapshot).toBe(snapshot)
    expect(result.changed).toBe(false)
    expect(result.snapshot.steps[0].id).toBe('crossing-stairs')
    expect(result.snapshot.ramps[0].id).toBe('crossing-ramp')
  })

  it('rejects a copy destination that partially overlaps a run retained at the source', () => {
    const layer = createDefaultLayer()
    const grid = createGrid(4, 1)
    const snapshot = {
      grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]) as LayerGrids,
      layers: [layer], stamps: [],
      steps: [{ id: 'source-stairs', col: 0, row: 0, z: 0, direction: 'E' as const, layerId: 'map' }],
      ramps: [], labels: [], lights: [],
    }
    const fragment = extractMapFragment({
      ...snapshot, cols: 4, rows: 1, z: 0,
      bounds: { minCol: 0, minRow: 0, maxCol: 1, maxRow: 0 }, layerIds: ['map'],
    })

    const result = applyMapFragment({
      snapshot, fragment, destination: { col: 1, row: 0 }, mode: 'copy', cols: 4, rows: 1,
      createId: (kind, id) => `copy-${kind}-${id}`, createGroupId: id => `copy-${id}`,
    })

    expect(result.error).toMatch(/partially overlaps the destination/i)
    expect(result.snapshot).toBe(snapshot)
    expect(result.changed).toBe(false)
  })
})
