import { WALL, type TileState } from './constants'
import { createGrid } from './grid'
import type { Direction } from './directionalRun'
import { DEFAULT_LAYER_ID } from './layers'
import { setLayerGrid, type LayerGrids } from './layerGrids'
import type { MapLayer } from './layers'
import type { Label } from './labels'
import type { MapLight } from './lighting'
import { rampRunTiles, type RampRun } from './ramps'
import type { TileBounds } from './selection'
import { stampFootprintSize, type Stamp } from './stamps'
import { stepRunTiles, type StepRun } from './steps'

type RelativeMapItem<T extends { col: number; row: number; z: number }> =
  Omit<T, 'col' | 'row' | 'z'> & { col: number; row: number; zOffset: number }

type RelativeLabel = Omit<Label, 'col' | 'row' | 'z'> & { col: number; row: number; zOffset: number }

export interface FragmentTile {
  layerId: string
  col: number
  row: number
  zOffset: number
  state: TileState
}

/** A transient, document-local selection of map content relative to its origin. */
export interface MapFragment {
  sourceBounds: TileBounds
  sourceZ: number
  width: number
  height: number
  transformedBy: FragmentTransform
  layerIds: string[]
  terrain: FragmentTile[]
  stamps: RelativeMapItem<Stamp>[]
  steps: RelativeMapItem<StepRun>[]
  ramps: RelativeMapItem<RampRun>[]
  labels: RelativeLabel[]
  lights: RelativeMapItem<MapLight>[]
  referencedCustomImages: string[]
}

export type FragmentTransform = 'none' | 'rotate-cw' | 'reflect-horizontal'

export const MAX_FRAGMENT_TERRAIN_CELLS = 25_000

export interface ExtractMapFragmentParams {
  layers: readonly MapLayer[]
  layerGrids: LayerGrids
  stamps: readonly Stamp[]
  steps: readonly StepRun[]
  ramps: readonly RampRun[]
  labels: readonly Label[]
  lights?: readonly MapLight[]
  cols: number
  rows: number
  z: number
  zRange?: { minZ: number; maxZ: number }
  bounds: TileBounds
  layerIds: readonly string[]
}

function contains(bounds: TileBounds, col: number, row: number): boolean {
  return col >= bounds.minCol && col <= bounds.maxCol && row >= bounds.minRow && row <= bounds.maxRow
}

function containsFootprint(bounds: TileBounds, tiles: readonly { col: number; row: number }[]): boolean {
  return tiles.length > 0 && tiles.every(tile => contains(bounds, tile.col, tile.row))
}

function relativeItem<T extends { col: number; row: number; z: number }>(
  item: T,
  bounds: TileBounds,
  z: number,
): RelativeMapItem<T> {
  const { col, row, z: itemZ, ...rest } = item
  return { ...rest, col: col - bounds.minCol, row: row - bounds.minRow, zOffset: itemZ - z } as RelativeMapItem<T>
}

function relativeLabel(item: Label, bounds: TileBounds, z: number): RelativeLabel {
  const { col, row, z: itemZ, ...rest } = item
  return { ...rest, col: col - bounds.minCol, row: row - bounds.minRow, zOffset: (itemZ ?? 0) - z }
}

/**
 * Extracts one Z level from raw named-layer grids. Terrain is included for
 * every selected tile, including Wall cells, so a later placement can replace
 * destination cells consistently. Objects are selected by anchor; runs require
 * their full directional footprint to fit in the selection.
 */
export function extractMapFragment(params: ExtractMapFragmentParams): MapFragment {
  const { bounds } = params
  if (!Number.isInteger(bounds.minCol) || !Number.isInteger(bounds.minRow)
    || !Number.isInteger(bounds.maxCol) || !Number.isInteger(bounds.maxRow)
    || bounds.minCol < 0 || bounds.minRow < 0 || bounds.maxCol >= params.cols || bounds.maxRow >= params.rows
    || bounds.maxCol < bounds.minCol || bounds.maxRow < bounds.minRow) {
    throw new RangeError('Room selection must be a non-empty rectangle inside the map.')
  }

  const layerById = new Map(params.layers.map(layer => [layer.id, layer]))
  const layerIds = [...new Set(params.layerIds)].filter(id => layerById.get(id)?.locked === false)
  const zRange = params.zRange ?? { minZ: params.z, maxZ: params.z }
  if (!Number.isSafeInteger(zRange.minZ) || !Number.isSafeInteger(zRange.maxZ) || zRange.maxZ < zRange.minZ
    || params.z < zRange.minZ || params.z > zRange.maxZ) {
    throw new RangeError('The selected Z range must use whole levels, include the active Z level, and have its minimum before its maximum.')
  }
  const width = bounds.maxCol - bounds.minCol + 1
  const height = bounds.maxRow - bounds.minRow + 1
  const levelCount = zRange.maxZ - zRange.minZ + 1
  if (!Number.isSafeInteger(levelCount) || levelCount > MAX_FRAGMENT_TERRAIN_CELLS
    || width * height * layerIds.length * levelCount > MAX_FRAGMENT_TERRAIN_CELLS) {
    throw new RangeError(`This room selection is too large to edit at once. Keep the fragment below ${MAX_FRAGMENT_TERRAIN_CELLS.toLocaleString()} layer tiles.`)
  }
  const zLevels = Array.from({ length: levelCount }, (_, index) => zRange.minZ + index)
  const isSelectedZ = (z: number) => z >= zRange.minZ && z <= zRange.maxZ
  const terrain: FragmentTile[] = []
  for (const layerId of layerIds) {
    for (const z of zLevels) {
      const grid = params.layerGrids.get(layerId)?.get(z) ?? createGrid(params.cols, params.rows)
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const index = (bounds.minRow + row) * params.cols + bounds.minCol + col
          terrain.push({
            layerId, col, row, zOffset: z - params.z,
            state: (grid[index] ?? WALL) as TileState,
          })
        }
      }
    }
  }

  const layerIsSelected = (layerId?: string) => layerIds.includes(layerId ?? 'map')
  const stamps = params.stamps
    .filter(item => {
      const anchor = stampAnchorTile(item)
      return isSelectedZ(item.z) && layerIsSelected(item.layerId) && contains(bounds, anchor.col, anchor.row)
    })
    .map(item => relativeItem(item, bounds, params.z))
  const steps = params.steps
    .filter(item => isSelectedZ(item.z) && layerIsSelected(item.layerId) && containsFootprint(bounds, stepRunTiles(item)))
    .map(item => relativeItem(item, bounds, params.z))
  const ramps = params.ramps
    .filter(item => isSelectedZ(item.z) && layerIsSelected(item.layerId) && containsFootprint(bounds, rampRunTiles(item)))
    .map(item => relativeItem(item, bounds, params.z))
  const labels = params.labels
    .filter(item => isSelectedZ(item.z ?? 0) && layerIsSelected(item.layerId) && contains(bounds, item.col, item.row))
    .map(item => relativeLabel(item, bounds, params.z))
  const lights = (params.lights ?? [])
    .filter(item => isSelectedZ(item.z) && layerIsSelected(item.layerId) && contains(bounds, item.col, item.row))
    .map(item => relativeItem(item, bounds, params.z))

  return {
    sourceBounds: { ...bounds }, sourceZ: params.z, width, height, layerIds,
    transformedBy: 'none', terrain, stamps, steps, ramps, labels, lights,
    referencedCustomImages: [...new Set(stamps.map(stamp => stamp.type).filter(type => type.startsWith('custom-image-')))],
  }
}

function transformPoint(
  col: number,
  row: number,
  width: number,
  height: number,
  transform: FragmentTransform,
): { col: number; row: number } {
  if (transform === 'rotate-cw') return { col: height - 1 - row, row: col }
  if (transform === 'reflect-horizontal') return { col: width - 1 - col, row }
  return { col, row }
}

function directionTransform(direction: Direction, transform: FragmentTransform): Direction {
  if (transform === 'rotate-cw') {
    return ({ N: 'E', E: 'S', S: 'W', W: 'N' } as const)[direction]
  }
  if (transform === 'reflect-horizontal') {
    return ({ N: 'N', E: 'W', S: 'S', W: 'E' } as const)[direction]
  }
  return direction
}

/** Applies a right-angle transform in fragment-local tile coordinates. */
export function transformMapFragment(fragment: MapFragment, transform: FragmentTransform): MapFragment {
  if (transform === 'none') return fragment
  const width = transform === 'rotate-cw' ? fragment.height : fragment.width
  const height = transform === 'rotate-cw' ? fragment.width : fragment.height
  const mapPoint = (col: number, row: number) => transformPoint(col, row, fragment.width, fragment.height, transform)

  const terrain = fragment.terrain.map(tile => ({ ...tile, ...mapPoint(tile.col, tile.row) }))
  const stamps = fragment.stamps.map(stamp => {
    // Rendering rotates/scales stamps around the center of the unscaled type
    // footprint, so transform that same center and reconstruct the stored anchor.
    const footprint = stampFootprintSize(stamp)
    const centerCol = stamp.col + footprint.cols / 2
    const centerRow = stamp.row + footprint.rows / 2
    const position = transform === 'rotate-cw'
      ? {
          col: fragment.height - centerRow - footprint.cols / 2,
          row: centerCol - footprint.rows / 2,
        }
      : transform === 'reflect-horizontal'
        ? { col: fragment.width - centerCol - footprint.cols / 2, row: stamp.row }
        : { col: stamp.col, row: stamp.row }
    const rotation = transform === 'rotate-cw'
      ? ((stamp.rotation + 90) % 360) as Stamp['rotation']
      : transform === 'reflect-horizontal'
        ? ((360 - stamp.rotation) % 360) as Stamp['rotation']
        : stamp.rotation
    const mirrored = transform === 'reflect-horizontal' ? !stamp.mirrored : stamp.mirrored
    const next = { ...stamp, ...position, rotation }
    if (mirrored) next.mirrored = true
    else delete next.mirrored
    return next
  })
  const transformRun = <T extends RelativeMapItem<StepRun> | RelativeMapItem<RampRun>>(run: T): T => ({
    ...run,
    ...mapPoint(run.col, run.row),
    direction: directionTransform(run.direction, transform),
  })
  const labels = fragment.labels.map(item => ({ ...item, ...mapPoint(item.col, item.row) }))
  const lights = fragment.lights.map(item => ({ ...item, ...mapPoint(item.col, item.row) }))

  return {
    ...fragment,
    width,
    height,
    transformedBy: transform,
    terrain,
    stamps,
    steps: fragment.steps.map(transformRun),
    ramps: fragment.ramps.map(transformRun),
    labels,
    lights,
    sourceBounds: { ...fragment.sourceBounds },
    layerIds: [...fragment.layerIds],
    referencedCustomImages: [...fragment.referencedCustomImages],
  }
}

export interface RoomMapSnapshot {
  grids: Map<number, Uint8Array>
  layerGrids: LayerGrids
  layers: MapLayer[]
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  lights?: MapLight[]
}

export type FragmentObjectKind = 'stamp' | 'step' | 'ramp' | 'label' | 'light'

interface ApplyMapFragmentBase<T extends RoomMapSnapshot> {
  snapshot: T
  fragment: MapFragment
  destination: { col: number; row: number; z?: number }
  cols: number
  rows: number
}

export type ApplyMapFragmentParams<T extends RoomMapSnapshot> = ApplyMapFragmentBase<T> & (
  | { mode: 'move' }
  | {
      mode: 'copy'
      createId: (kind: FragmentObjectKind, sourceId: string) => string
      createGroupId: (sourceGroupId: string) => string
    }
)

export interface ApplyMapFragmentResult<T extends RoomMapSnapshot> {
  snapshot: T
  error?: string
  changed: boolean
  overwrittenCellCount: number
  overwrittenObjectCount: number
  overwrittenByZ: Record<number, { cells: number; objects: number }>
}

function errorResult<T extends RoomMapSnapshot>(snapshot: T, error: string): ApplyMapFragmentResult<T> {
  return { snapshot, error, changed: false, overwrittenCellCount: 0, overwrittenObjectCount: 0, overwrittenByZ: {} }
}

function tileRectContains(bounds: TileBounds, tile: { col: number; row: number }): boolean {
  return contains(bounds, tile.col, tile.row)
}

function targetBoundsAt(destination: { col: number; row: number }, width: number, height: number): TileBounds {
  return {
    minCol: destination.col, minRow: destination.row,
    maxCol: destination.col + width - 1, maxRow: destination.row + height - 1,
  }
}

function mapItemLayerId(item: { layerId?: string }): string {
  return item.layerId ?? DEFAULT_LAYER_ID
}

export function stampAnchorTile(stamp: Pick<Stamp, 'col' | 'row' | 'type' | 'aspectRatio'>): { col: number; row: number } {
  const footprint = stampFootprintSize(stamp)
  return {
    col: Math.floor(stamp.col + footprint.cols / 2),
    row: Math.floor(stamp.row + footprint.rows / 2),
  }
}

function stampFitsMap(stamp: RelativeMapItem<Stamp>, col: number, row: number, cols: number, rows: number): boolean {
  const footprint = stampFootprintSize(stamp)
  const scale = stamp.scale ?? 1
  const width = (stamp.rotation === 90 || stamp.rotation === 270 ? footprint.rows : footprint.cols) * scale
  const height = (stamp.rotation === 90 || stamp.rotation === 270 ? footprint.cols : footprint.rows) * scale
  const centerCol = col + footprint.cols / 2
  const centerRow = row + footprint.rows / 2
  const left = centerCol - width / 2
  const top = centerRow - height / 2
  return left >= 0 && top >= 0 && left + width <= cols && top + height <= rows
}

function sameArray<T>(left: readonly T[], right: readonly T[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Validates and atomically applies a transformed fragment. Every selected
 * layer is replaced independently from its raw grid; composed render grids are
 * derived by the app. On any invalid layer or out-of-map footprint, the input
 * snapshot is returned unchanged with a reason.
 */
export function applyMapFragment<T extends RoomMapSnapshot>(params: ApplyMapFragmentParams<T>): ApplyMapFragmentResult<T> {
  const { snapshot, fragment, destination, cols, rows } = params
  const destinationZ = destination.z ?? fragment.sourceZ
  if (!Number.isInteger(destination.col) || !Number.isInteger(destination.row) || !Number.isInteger(destinationZ)) {
    return errorResult(snapshot, 'The destination must use whole tile and Z coordinates.')
  }
  if (fragment.layerIds.length === 0) return errorResult(snapshot, 'Select at least one unlocked layer.')
  const layerById = new Map(snapshot.layers.map(layer => [layer.id, layer]))
  for (const layerId of fragment.layerIds) {
    const layer = layerById.get(layerId)
    if (!layer) return errorResult(snapshot, 'A selected layer no longer exists.')
    if (layer.locked) return errorResult(snapshot, `The ${layer.name} layer is locked.`)
  }

  const targetBounds = targetBoundsAt(destination, fragment.width, fragment.height)
  if (targetBounds.minCol < 0 || targetBounds.minRow < 0 || targetBounds.maxCol >= cols || targetBounds.maxRow >= rows) {
    return errorResult(snapshot, 'The room would extend beyond the map edge.')
  }
  const allowedLayers = new Set(fragment.layerIds)
  const terrainOffsets = [...new Set(fragment.terrain.map(tile => tile.zOffset))]
  if (terrainOffsets.length === 0) return errorResult(snapshot, 'The room has no selected terrain layers.')
  for (const tile of fragment.terrain) {
    if (!allowedLayers.has(tile.layerId) || !Number.isInteger(tile.col) || !Number.isInteger(tile.row)
      || tile.col < 0 || tile.row < 0 || tile.col >= fragment.width || tile.row >= fragment.height
      || !Number.isInteger(tile.zOffset)) {
      return errorResult(snapshot, 'The room fragment contains an invalid terrain tile.')
    }
  }
  const itemLayerIsValid = (item: { layerId?: string }) => allowedLayers.has(mapItemLayerId(item))
  for (const item of [...fragment.stamps, ...fragment.steps, ...fragment.ramps, ...fragment.labels, ...fragment.lights]) {
    if (!itemLayerIsValid(item) || !Number.isInteger(item.zOffset)) {
      return errorResult(snapshot, 'The room fragment contains content on an unavailable layer or Z level.')
    }
  }
  const zOffsets = new Set(terrainOffsets)
  for (const item of [...fragment.stamps, ...fragment.steps, ...fragment.ramps, ...fragment.labels, ...fragment.lights]) zOffsets.add(item.zOffset)
  const targetZs = new Set([...zOffsets].map(offset => destinationZ + offset))
  const overwrittenByZ: Record<number, { cells: number; objects: number }> = Object.fromEntries(
    [...targetZs].map(z => [z, { cells: 0, objects: 0 }]),
  )
  const fragmentStepIds = new Set(fragment.steps.map(item => item.id))
  const fragmentRampIds = new Set(fragment.ramps.map(item => item.id))
  for (const stamp of fragment.stamps) {
    const col = destination.col + stamp.col
    const row = destination.row + stamp.row
    if (!stampFitsMap(stamp, col, row, cols, rows)) return errorResult(snapshot, 'A stamp would extend beyond the map edge.')
  }
  for (const run of fragment.steps) {
    const { zOffset, ...item } = run
    const absoluteRun: StepRun = { ...item, col: destination.col + run.col, row: destination.row + run.row, z: destinationZ + zOffset }
    const footprint = stepRunTiles(absoluteRun)
    if (footprint.some(tile => tile.col < 0 || tile.row < 0 || tile.col >= cols || tile.row >= rows)) {
      return errorResult(snapshot, 'A stair or ramp would extend beyond the map edge.')
    }
  }
  for (const run of fragment.ramps) {
    const { zOffset, ...item } = run
    const absoluteRun: RampRun = { ...item, col: destination.col + run.col, row: destination.row + run.row, z: destinationZ + zOffset }
    const footprint = rampRunTiles(absoluteRun)
    if (footprint.some(tile => tile.col < 0 || tile.row < 0 || tile.col >= cols || tile.row >= rows)) {
      return errorResult(snapshot, 'A stair or ramp would extend beyond the map edge.')
    }
  }
  for (const item of [...fragment.labels, ...fragment.lights]) {
    const col = destination.col + item.col
    const row = destination.row + item.row
    if (col < 0 || row < 0 || col >= cols || row >= rows) return errorResult(snapshot, 'A map marker would extend beyond the map edge.')
  }

  const partiallyOverlappingRun = <T extends StepRun | RampRun>(
    run: T,
    footprint: (run: T) => { col: number; row: number }[],
    fragmentRunIds: Set<string>,
  ): boolean => {
    if (!targetZs.has(run.z) || !allowedLayers.has(mapItemLayerId(run))
      || (params.mode === 'move' && fragmentRunIds.has(run.id))) return false
    const tiles = footprint(run)
    const overlaps = tiles.some(tile => tileRectContains(targetBounds, tile))
    return overlaps && !containsFootprint(targetBounds, tiles)
  }
  if (snapshot.steps.some(run => partiallyOverlappingRun(run, stepRunTiles, fragmentStepIds))
    || snapshot.ramps.some(run => partiallyOverlappingRun(run, rampRunTiles, fragmentRampIds))) {
    return errorResult(snapshot, 'A stair or ramp partially overlaps the destination. Move the room so the complete run fits inside or outside it.')
  }

  if (params.mode === 'move' && fragment.transformedBy === 'none'
    && destination.col === fragment.sourceBounds.minCol && destination.row === fragment.sourceBounds.minRow
    && destinationZ === fragment.sourceZ) {
    return { snapshot, changed: false, overwrittenCellCount: 0, overwrittenObjectCount: 0, overwrittenByZ }
  }

  const sourceObjectIds = {
    stamps: new Set(fragment.stamps.map(item => item.id)),
    steps: new Set(fragment.steps.map(item => item.id)),
    ramps: new Set(fragment.ramps.map(item => item.id)),
    labels: new Set(fragment.labels.map(item => item.id)),
    lights: new Set(fragment.lights.map(item => item.id)),
  }
  const sourceLayers = new Map(snapshot.layerGrids)
  const mutableGrids = new Map<string, Map<number, Uint8Array>>()
  const originalGrids = new Map<string, Map<number, Uint8Array | undefined>>()
  const writableGrid = (layerId: string, z: number): Uint8Array => {
    let layer = mutableGrids.get(layerId)
    if (!layer) {
      layer = new Map(sourceLayers.get(layerId))
      mutableGrids.set(layerId, layer)
      originalGrids.set(layerId, new Map())
    }
    let grid = layer.get(z)
    if (!originalGrids.get(layerId)!.has(z)) originalGrids.get(layerId)!.set(z, sourceLayers.get(layerId)?.get(z))
    if (!grid) grid = createGrid(cols, rows)
    else if (grid === sourceLayers.get(layerId)?.get(z)) grid = grid.slice()
    layer.set(z, grid)
    return grid
  }

  if (params.mode === 'move') {
    for (const layerId of fragment.layerIds) for (const zOffset of zOffsets) {
      const grid = writableGrid(layerId, fragment.sourceZ + zOffset)
      for (let row = fragment.sourceBounds.minRow; row <= fragment.sourceBounds.maxRow; row++) {
        for (let col = fragment.sourceBounds.minCol; col <= fragment.sourceBounds.maxCol; col++) grid[row * cols + col] = WALL
      }
    }
  }

  let overwrittenCellCount = 0
  for (const layerId of fragment.layerIds) for (const zOffset of zOffsets) {
    const z = destinationZ + zOffset
    const existing = sourceLayers.get(layerId)?.get(z)
    for (let row = targetBounds.minRow; row <= targetBounds.maxRow; row++) {
      for (let col = targetBounds.minCol; col <= targetBounds.maxCol; col++) {
        if (existing?.[row * cols + col] !== undefined && existing[row * cols + col] !== WALL) {
          overwrittenCellCount++
          overwrittenByZ[z].cells++
        }
      }
    }
    const grid = writableGrid(layerId, z)
    for (let row = targetBounds.minRow; row <= targetBounds.maxRow; row++) {
      for (let col = targetBounds.minCol; col <= targetBounds.maxCol; col++) grid[row * cols + col] = WALL
    }
  }
  for (const tile of fragment.terrain) {
    writableGrid(tile.layerId, destinationZ + tile.zOffset)[(destination.row + tile.row) * cols + destination.col + tile.col] = tile.state
  }

  const sourceRemove = params.mode === 'move'
  const skipSourceOnCopy = params.mode === 'copy'
  const overwrittenObjectIds = new Set<string>()
  const overwrittenObjectsByZ = new Map<number, Set<string>>()
  const shouldRemoveObject = <T extends { id: string; col: number; row: number; layerId?: string }>(
    item: T,
    kind: keyof typeof sourceObjectIds,
    z: number,
    inDestination: boolean,
  ) => {
    if (sourceRemove && sourceObjectIds[kind].has(item.id)) return true
    if (!inDestination || !targetZs.has(z) || !allowedLayers.has(mapItemLayerId(item))) return false
    if (skipSourceOnCopy && sourceObjectIds[kind].has(item.id)) return false
    const objectKey = `${kind}:${item.id}`
    overwrittenObjectIds.add(objectKey)
    const zObjects = overwrittenObjectsByZ.get(z) ?? new Set<string>()
    zObjects.add(objectKey)
    overwrittenObjectsByZ.set(z, zObjects)
    return true
  }

  const stampsToKeep = snapshot.stamps.filter(item => !shouldRemoveObject(
    item, 'stamps', item.z, tileRectContains(targetBounds, stampAnchorTile(item)),
  ))
  const stepsToKeep = snapshot.steps.filter(item => !shouldRemoveObject(
    item, 'steps', item.z, containsFootprint(targetBounds, stepRunTiles(item)),
  ))
  const rampsToKeep = snapshot.ramps.filter(item => !shouldRemoveObject(
    item, 'ramps', item.z, containsFootprint(targetBounds, rampRunTiles(item)),
  ))
  const labelsToKeep = snapshot.labels.filter(item => !shouldRemoveObject(
    item, 'labels', item.z ?? 0, tileRectContains(targetBounds, item),
  ))
  const currentLights = snapshot.lights ?? []
  const lightsToKeep = currentLights.filter(item => !shouldRemoveObject(
    item, 'lights', item.z, tileRectContains(targetBounds, item),
  ))
  const overwrittenObjectCount = overwrittenObjectIds.size
  for (const [z, objects] of overwrittenObjectsByZ) overwrittenByZ[z].objects = objects.size

  const idMap = new Map<string, string>()
  const groupMap = new Map<string, string>()
  const createObjectId = (kind: FragmentObjectKind, id: string) => {
    if (params.mode === 'move') return id
    const key = `${kind}:${id}`
    const existing = idMap.get(key)
    if (existing) return existing
    const created = params.createId(kind, id)
    idMap.set(key, created)
    return created
  }
  const createGroup = (groupId?: string) => {
    if (!groupId || params.mode === 'move') return groupId
    const existing = groupMap.get(groupId)
    if (existing) return existing
    const created = params.createGroupId(groupId)
    groupMap.set(groupId, created)
    return created
  }
  const positionItem = <T extends { id: string; col: number; row: number; zOffset: number; layerId?: string; groupId?: string }>(
    kind: FragmentObjectKind,
    item: T,
  ) => {
    const { zOffset, ...rest } = item
    return {
      ...rest,
      id: createObjectId(kind, item.id),
      ...(item.groupId ? { groupId: createGroup(item.groupId) } : {}),
      col: destination.col + item.col,
      row: destination.row + item.row,
      z: destinationZ + zOffset,
    }
  }
  const nextStamps = [...stampsToKeep, ...fragment.stamps.map(item => positionItem('stamp', item) as Stamp)]
  const nextSteps = [...stepsToKeep, ...fragment.steps.map(item => positionItem('step', item) as StepRun)]
  const nextRamps = [...rampsToKeep, ...fragment.ramps.map(item => positionItem('ramp', item) as RampRun)]
  const nextLabels = [...labelsToKeep, ...fragment.labels.map(item => positionItem('label', item) as Label)]
  const nextLights = [...lightsToKeep, ...fragment.lights.map(item => positionItem('light', item) as MapLight)]

  let layerGrids = snapshot.layerGrids
  for (const [layerId, grids] of mutableGrids) {
    for (const [z, grid] of grids) {
      const existed = originalGrids.get(layerId)?.get(z) !== undefined
      if (!existed && !grid.some(state => state !== WALL)) continue
      layerGrids = setLayerGrid(layerGrids, layerId, z, grid)
    }
  }
  let legacyGrids = snapshot.grids
  if (fragment.layerIds.includes(DEFAULT_LAYER_ID)) {
    legacyGrids = new Map(snapshot.grids)
    for (const [z, grid] of mutableGrids.get(DEFAULT_LAYER_ID) ?? []) {
      if (layerGrids.get(DEFAULT_LAYER_ID)?.has(z)) legacyGrids.set(z, grid)
    }
  }
  const gridsChanged = [...mutableGrids].some(([layerId, grids]) => [...grids].some(([z, grid]) => {
    const original = originalGrids.get(layerId)?.get(z) ?? createGrid(cols, rows)
    return !sameArray(Array.from(grid), Array.from(original))
  }))
  const changed = gridsChanged || !sameArray(nextStamps, snapshot.stamps) || !sameArray(nextSteps, snapshot.steps)
    || !sameArray(nextRamps, snapshot.ramps) || !sameArray(nextLabels, snapshot.labels) || !sameArray(nextLights, currentLights)
  if (!changed) return { snapshot, changed: false, overwrittenCellCount, overwrittenObjectCount, overwrittenByZ }

  const nextSnapshot = {
    ...snapshot,
    grids: legacyGrids,
    layerGrids,
    stamps: nextStamps,
    steps: nextSteps,
    ramps: nextRamps,
    labels: nextLabels,
    lights: nextLights,
  } as T
  return { snapshot: nextSnapshot, changed: true, overwrittenCellCount, overwrittenObjectCount, overwrittenByZ }
}
