import type { Label } from './labels'
import { rampRunTiles, type RampRun } from './ramps'
import { stampFootprintSize, type Stamp } from './stamps'
import { stepRunTiles, type StepRun } from './steps'

export type MapObjectKind = 'stamp' | 'step' | 'ramp' | 'label'

export interface MapObjectSelection {
  kind: MapObjectKind
  id: string
}

export interface TileBounds {
  minCol: number
  minRow: number
  maxCol: number
  maxRow: number
}

export interface SelectMapObjectsParams {
  stamps: readonly Stamp[]
  steps: readonly StepRun[]
  ramps: readonly RampRun[]
  labels: readonly Label[]
  activeZ: number
  bounds: TileBounds
}

export type ExpandSelectionToGroupsParams = Pick<SelectMapObjectsParams, 'stamps' | 'steps' | 'ramps' | 'labels' | 'activeZ'> & {
  selection: readonly MapObjectSelection[]
}

export interface MoveSelectedMapObjectsParams {
  stamps: readonly Stamp[]
  steps: readonly StepRun[]
  ramps: readonly RampRun[]
  labels: readonly Label[]
  selection: readonly MapObjectSelection[]
  delta: { col: number; row: number }
}

export interface DuplicateSelectedMapObjectsParams extends Omit<MoveSelectedMapObjectsParams, 'delta'> {
  delta: { col: number; row: number }
  createId: (kind: MapObjectKind, sourceId: string) => string
  createGroupId?: (sourceGroupId: string) => string
}

export interface MapObjectClipboard {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
}

function intersects(bounds: TileBounds, col: number, row: number): boolean {
  return col >= bounds.minCol && col <= bounds.maxCol && row >= bounds.minRow && row <= bounds.maxRow
}

function stampIntersects(bounds: TileBounds, stamp: Stamp): boolean {
  const size = stampFootprintSize(stamp)
  for (let row = stamp.row; row < stamp.row + size.rows; row++) {
    for (let col = stamp.col; col < stamp.col + size.cols; col++) {
      if (intersects(bounds, col, row)) return true
    }
  }
  return false
}

/**
 * Returns every editable map object on the active Z Level touched by a
 * top-down tile rectangle. The UI uses these stable kind/id pairs as its
 * selection state, leaving the document model untouched until an edit occurs.
 */
export function selectMapObjects(params: SelectMapObjectsParams): MapObjectSelection[] {
  const selected: MapObjectSelection[] = []
  for (const stamp of params.stamps) {
    if (stamp.z === params.activeZ && stampIntersects(params.bounds, stamp)) selected.push({ kind: 'stamp', id: stamp.id })
  }
  for (const step of params.steps) {
    if (step.z === params.activeZ && stepRunTiles(step).some(tile => intersects(params.bounds, tile.col, tile.row))) selected.push({ kind: 'step', id: step.id })
  }
  for (const ramp of params.ramps) {
    if (ramp.z === params.activeZ && rampRunTiles(ramp).some(tile => intersects(params.bounds, tile.col, tile.row))) selected.push({ kind: 'ramp', id: ramp.id })
  }
  for (const label of params.labels) {
    if ((label.z ?? 0) === params.activeZ && intersects(params.bounds, label.col, label.row)) selected.push({ kind: 'label', id: label.id })
  }

  return expandSelectionToGroups({ ...params, selection: selected })
}

/** Adds active-level peers for each group already present in a selection. */
export function expandSelectionToGroups(params: ExpandSelectionToGroupsParams): MapObjectSelection[] {
  const selected = [...params.selection]
  const selectedKeys = new Set(selected.map(item => `${item.kind}:${item.id}`))
  const selectedGroupIds = new Set<string>()
  const collectGroupId = (kind: MapObjectKind, items: readonly { id: string; groupId?: string }[]) => {
    for (const item of items) if (selectedKeys.has(`${kind}:${item.id}`) && item.groupId) selectedGroupIds.add(item.groupId)
  }
  collectGroupId('stamp', params.stamps)
  collectGroupId('step', params.steps)
  collectGroupId('ramp', params.ramps)
  collectGroupId('label', params.labels)
  if (selectedGroupIds.size === 0) return selected

  const appendGrouped = (kind: MapObjectKind, items: readonly { id: string; z: number; groupId?: string }[]) => {
    for (const item of items) {
      const key = `${kind}:${item.id}`
      if (item.z === params.activeZ && item.groupId && selectedGroupIds.has(item.groupId) && !selectedKeys.has(key)) {
        selected.push({ kind, id: item.id })
        selectedKeys.add(key)
      }
    }
  }
  appendGrouped('stamp', params.stamps)
  appendGrouped('step', params.steps)
  appendGrouped('ramp', params.ramps)
  appendGrouped('label', params.labels.map(label => ({ ...label, z: label.z ?? 0 })))
  return selected
}

/** Moves every selected object by the same tile offset without mutating inputs. */
export function moveSelectedMapObjects(params: MoveSelectedMapObjectsParams): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const move = <T extends { id: string; col: number; row: number }>(kind: MapObjectKind, items: readonly T[]): T[] =>
    items.map(item => selected.has(`${kind}:${item.id}`)
      ? { ...item, col: item.col + params.delta.col, row: item.row + params.delta.row }
      : item)

  return {
    stamps: move('stamp', params.stamps),
    steps: move('step', params.steps),
    ramps: move('ramp', params.ramps),
    labels: move('label', params.labels),
  }
}

export function rotateSelectedMapObjects(params: Pick<MoveSelectedMapObjectsParams, 'stamps' | 'steps' | 'ramps' | 'selection'>): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const directions = ['N', 'E', 'S', 'W'] as const
  const rotateDirection = <T extends typeof directions[number]>(direction: T): T => directions[(directions.indexOf(direction) + 1) % directions.length] as T

  return {
    stamps: params.stamps.map(stamp => selected.has(`stamp:${stamp.id}`)
      ? { ...stamp, rotation: ((stamp.rotation + 90) % 360) as Stamp['rotation'] }
      : stamp),
    steps: params.steps.map(step => selected.has(`step:${step.id}`)
      ? { ...step, direction: rotateDirection(step.direction) }
      : step),
    ramps: params.ramps.map(ramp => selected.has(`ramp:${ramp.id}`)
      ? { ...ramp, direction: rotateDirection(ramp.direction) }
      : ramp),
  }
}

export function scaleSelectedStamps(params: Pick<MoveSelectedMapObjectsParams, 'stamps' | 'selection'> & { scale: number }): Stamp[] {
  const selectedStampIds = new Set(params.selection.filter(item => item.kind === 'stamp').map(item => item.id))
  return params.stamps.map(stamp => selectedStampIds.has(stamp.id) ? { ...stamp, scale: params.scale } : stamp)
}

/**
 * Clones the chosen objects with a deterministic tile offset. The returned
 * selection refers to the clones so a caller can keep editing the duplicate.
 */
export function duplicateSelectedMapObjects(params: DuplicateSelectedMapObjectsParams): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  selection: MapObjectSelection[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const copy = <T extends { id: string; col: number; row: number; groupId?: string }>(kind: MapObjectKind, items: readonly T[]): T[] => {
    const clones = items
      .filter(item => selected.has(`${kind}:${item.id}`))
      .map(item => ({ ...item, id: params.createId(kind, item.id), groupId: item.groupId && params.createGroupId ? params.createGroupId(item.groupId) : item.groupId, col: item.col + params.delta.col, row: item.row + params.delta.row }))
    return [...items, ...clones]
  }
  const selection = params.selection.map(item => ({ ...item, id: params.createId(item.kind, item.id) }))
  return {
    stamps: copy('stamp', params.stamps),
    steps: copy('step', params.steps),
    ramps: copy('ramp', params.ramps),
    labels: copy('label', params.labels),
    selection,
  }
}

export function copySelectedMapObjects(params: Pick<MoveSelectedMapObjectsParams, 'stamps' | 'steps' | 'ramps' | 'labels' | 'selection'>): MapObjectClipboard {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const copy = <T extends { id: string }>(kind: MapObjectKind, items: readonly T[]): T[] =>
    items.filter(item => selected.has(`${kind}:${item.id}`)).map(item => ({ ...item }))
  return {
    stamps: copy('stamp', params.stamps),
    steps: copy('step', params.steps),
    ramps: copy('ramp', params.ramps),
    labels: copy('label', params.labels),
  }
}

export function pasteMapObjects(params: {
  clipboard: MapObjectClipboard
  delta: { col: number; row: number }
  createId: (kind: MapObjectKind, sourceId: string) => string
  createGroupId?: (sourceGroupId: string) => string
}): MapObjectClipboard & { selection: MapObjectSelection[] } {
  const paste = <T extends { id: string; col: number; row: number; groupId?: string }>(kind: MapObjectKind, items: readonly T[]): T[] =>
    items.map(item => ({ ...item, id: params.createId(kind, item.id), groupId: item.groupId && params.createGroupId ? params.createGroupId(item.groupId) : item.groupId, col: item.col + params.delta.col, row: item.row + params.delta.row }))
  const stamps = paste('stamp', params.clipboard.stamps)
  const steps = paste('step', params.clipboard.steps)
  const ramps = paste('ramp', params.clipboard.ramps)
  const labels = paste('label', params.clipboard.labels)
  return {
    stamps, steps, ramps, labels,
    selection: [
      ...stamps.map(item => ({ kind: 'stamp' as const, id: item.id })),
      ...steps.map(item => ({ kind: 'step' as const, id: item.id })),
      ...ramps.map(item => ({ kind: 'ramp' as const, id: item.id })),
      ...labels.map(item => ({ kind: 'label' as const, id: item.id })),
    ],
  }
}

type GroupableMaps = Pick<MoveSelectedMapObjectsParams, 'stamps' | 'steps' | 'ramps' | 'labels' | 'selection'>

export function groupSelectedMapObjects(params: GroupableMaps & { groupId: string }): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const group = <T extends { id: string }>(kind: MapObjectKind, items: readonly T[]): T[] =>
    items.map(item => selected.has(`${kind}:${item.id}`) ? { ...item, groupId: params.groupId } : item)
  return { stamps: group('stamp', params.stamps), steps: group('step', params.steps), ramps: group('ramp', params.ramps), labels: group('label', params.labels) }
}

export function ungroupSelectedMapObjects(params: GroupableMaps): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const ungroup = <T extends { id: string; groupId?: string }>(kind: MapObjectKind, items: readonly T[]): T[] =>
    items.map(item => {
      if (!selected.has(`${kind}:${item.id}`)) return item
      const { groupId: _, ...ungrouped } = item
      return ungrouped as T
    })
  return { stamps: ungroup('stamp', params.stamps), steps: ungroup('step', params.steps), ramps: ungroup('ramp', params.ramps), labels: ungroup('label', params.labels) }
}

/**
 * Reorders selected objects within their own type's render sequence. Object
 * type layers remain fixed: structures are below stamps, and labels are above
 * them, so this never silently changes cross-type layering.
 */
export function reorderSelectedMapObjects(params: GroupableMaps & { direction: 'forward' | 'backward' | 'front' | 'back' }): {
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
} {
  const selected = new Set(params.selection.map(item => `${item.kind}:${item.id}`))
  const reorder = <T extends { id: string }>(kind: MapObjectKind, source: readonly T[]): T[] => {
    const isSelected = (item: T) => selected.has(`${kind}:${item.id}`)
    if (params.direction === 'front') return [...source.filter(item => !isSelected(item)), ...source.filter(isSelected)]
    if (params.direction === 'back') return [...source.filter(isSelected), ...source.filter(item => !isSelected(item))]

    const items = [...source]
    if (params.direction === 'forward') {
      for (let index = items.length - 2; index >= 0; index--) {
        if (isSelected(items[index]) && !isSelected(items[index + 1])) [items[index], items[index + 1]] = [items[index + 1], items[index]]
      }
    } else {
      for (let index = 1; index < items.length; index++) {
        if (isSelected(items[index]) && !isSelected(items[index - 1])) [items[index - 1], items[index]] = [items[index], items[index - 1]]
      }
    }
    return items
  }
  return {
    stamps: reorder('stamp', params.stamps),
    steps: reorder('step', params.steps),
    ramps: reorder('ramp', params.ramps),
    labels: reorder('label', params.labels),
  }
}
