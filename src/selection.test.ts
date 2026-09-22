import { describe, expect, it } from 'vitest'
import type { Label } from './labels'
import type { RampRun } from './ramps'
import { groupSelectedMapObjects, copySelectedMapObjects, duplicateSelectedMapObjects, moveSelectedMapObjects, pasteMapObjects, reorderSelectedMapObjects, rotateSelectedMapObjects, scaleSelectedStamps, selectMapObjects, ungroupSelectedMapObjects, type MapObjectSelection } from './selection'
import type { Stamp } from './stamps'
import type { StepRun } from './steps'

const stamp = (overrides: Partial<Stamp> = {}): Stamp => ({
  id: 'stamp', type: 'door', col: 2, row: 2, rotation: 0, z: 0, ...overrides,
})
const step = (overrides: Partial<StepRun> = {}): StepRun => ({
  id: 'step', col: 4, row: 2, z: 0, direction: 'E', ...overrides,
})
const ramp = (overrides: Partial<RampRun> = {}): RampRun => ({
  id: 'ramp', col: 6, row: 2, z: 0, direction: 'E', ...overrides,
})
const label = (overrides: Partial<Label> = {}): Label => ({
  id: 'label', col: 8, row: 2, z: 0, text: 'Vault', ...overrides,
})

describe('selectMapObjects', () => {
  it('selects each active-level object touched by a drag rectangle', () => {
    const selected = selectMapObjects({
      stamps: [stamp(), stamp({ id: 'above', z: 1 })],
      steps: [step()],
      ramps: [ramp()],
      labels: [label(), label({ id: 'below', z: -1 })],
      activeZ: 0,
      bounds: { minCol: 2, minRow: 2, maxCol: 9, maxRow: 3 },
    })

    expect(selected).toEqual<MapObjectSelection[]>([
      { kind: 'stamp', id: 'stamp' },
      { kind: 'step', id: 'step' },
      { kind: 'ramp', id: 'ramp' },
      { kind: 'label', id: 'label' },
    ])
  })

  it('selects the rest of an active-level group when any member is touched', () => {
    const selected = selectMapObjects({
      stamps: [stamp({ groupId: 'group-a' }), stamp({ id: 'far-stamp', col: 20, groupId: 'group-a' })],
      steps: [step({ groupId: 'group-a' })], ramps: [], labels: [label({ groupId: 'other-group' })],
      activeZ: 0, bounds: { minCol: 2, minRow: 2, maxCol: 2, maxRow: 2 },
    })

    expect(selected).toEqual([
      { kind: 'stamp', id: 'stamp' },
      { kind: 'stamp', id: 'far-stamp' },
      { kind: 'step', id: 'step' },
    ])
  })
})

describe('moveSelectedMapObjects', () => {
  it('moves a mixed selection without changing unselected map objects', () => {
    const result = moveSelectedMapObjects({
      stamps: [stamp(), stamp({ id: 'unselected', col: 20 })],
      steps: [step()], ramps: [ramp()], labels: [label()],
      selection: [
        { kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' },
        { kind: 'ramp', id: 'ramp' }, { kind: 'label', id: 'label' },
      ],
      delta: { col: 2, row: -1 },
    })

    expect(result.stamps).toMatchObject([{ id: 'stamp', col: 4, row: 1 }, { id: 'unselected', col: 20, row: 2 }])
    expect(result.steps).toMatchObject([{ id: 'step', col: 6, row: 1 }])
    expect(result.ramps).toMatchObject([{ id: 'ramp', col: 8, row: 1 }])
    expect(result.labels).toMatchObject([{ id: 'label', col: 10, row: 1 }])
  })
})

describe('selection transforms', () => {
  const selection: MapObjectSelection[] = [
    { kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' }, { kind: 'ramp', id: 'ramp' },
  ]

  it('rotates every selected rotatable object and leaves labels alone', () => {
    const result = rotateSelectedMapObjects({
      stamps: [stamp(), stamp({ id: 'other' })], steps: [step({ direction: 'N' })], ramps: [ramp({ direction: 'W' })],
      selection,
    })

    expect(result.stamps).toMatchObject([{ id: 'stamp', rotation: 90 }, { id: 'other', rotation: 0 }])
    expect(result.steps).toMatchObject([{ id: 'step', direction: 'E' }])
    expect(result.ramps).toMatchObject([{ id: 'ramp', direction: 'N' }])
  })

  it('scales selected stamps without changing unsupported selection types', () => {
    const result = scaleSelectedStamps({
      stamps: [stamp(), stamp({ id: 'other' })], selection, scale: 1.5,
    })

    expect(result).toMatchObject([{ id: 'stamp', scale: 1.5 }, { id: 'other' }])
    expect(result[1].scale).toBeUndefined()
  })
})

describe('duplicateSelectedMapObjects', () => {
  it('duplicates a mixed selection with fresh IDs and a predictable offset', () => {
    const result = duplicateSelectedMapObjects({
      stamps: [stamp()], steps: [step()], ramps: [ramp()], labels: [label()],
      selection: [
        { kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' },
        { kind: 'ramp', id: 'ramp' }, { kind: 'label', id: 'label' },
      ],
      delta: { col: 1, row: 1 },
      createId: (kind, id) => `${kind}-copy-of-${id}`,
    })

    expect(result.stamps).toMatchObject([{ id: 'stamp' }, { id: 'stamp-copy-of-stamp', col: 3, row: 3, z: 0, rotation: 0 }])
    expect(result.steps).toMatchObject([{ id: 'step' }, { id: 'step-copy-of-step', col: 5, row: 3, direction: 'E' }])
    expect(result.ramps).toMatchObject([{ id: 'ramp' }, { id: 'ramp-copy-of-ramp', col: 7, row: 3, direction: 'E' }])
    expect(result.labels).toMatchObject([{ id: 'label' }, { id: 'label-copy-of-label', col: 9, row: 3, text: 'Vault' }])
  })

  it('gives duplicated group members one fresh group ID', () => {
    const result = duplicateSelectedMapObjects({
      stamps: [stamp({ groupId: 'source-group' })], steps: [step({ groupId: 'source-group' })], ramps: [], labels: [],
      selection: [{ kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' }],
      delta: { col: 1, row: 1 }, createId: (kind, id) => `${kind}-${id}-copy`, createGroupId: id => `${id}-copy`,
    })

    expect(result.stamps[1].groupId).toBe('source-group-copy')
    expect(result.steps[1].groupId).toBe('source-group-copy')
    expect(result.stamps[0].groupId).toBe('source-group')
  })
})

describe('map object clipboard', () => {
  it('copies selected objects and pastes independent clones with their properties intact', () => {
    const clipboard = copySelectedMapObjects({
      stamps: [stamp({ scale: 1.5 })], steps: [step({ ascending: true })], ramps: [ramp()], labels: [label({ color: '#112233' })],
      selection: [{ kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' }, { kind: 'label', id: 'label' }],
    })
    const pasted = pasteMapObjects({
      clipboard, delta: { col: 3, row: 0 }, createId: (kind, id) => `pasted-${kind}-${id}`,
    })

    expect(pasted.stamps).toMatchObject([{ id: 'pasted-stamp-stamp', col: 5, row: 2, scale: 1.5 }])
    expect(pasted.steps).toMatchObject([{ id: 'pasted-step-step', col: 7, row: 2, ascending: true }])
    expect(pasted.ramps).toEqual([])
    expect(pasted.labels).toMatchObject([{ id: 'pasted-label-label', col: 11, row: 2, color: '#112233' }])
    expect(pasted.selection).toEqual([
      { kind: 'stamp', id: 'pasted-stamp-stamp' },
      { kind: 'step', id: 'pasted-step-step' },
      { kind: 'label', id: 'pasted-label-label' },
    ])
  })

  it('creates a fresh shared group when pasting grouped objects', () => {
    const pasted = pasteMapObjects({
      clipboard: { stamps: [stamp({ groupId: 'source-group' })], steps: [step({ groupId: 'source-group' })], ramps: [], labels: [] },
      delta: { col: 1, row: 1 }, createId: (kind, id) => `${kind}-${id}-pasted`, createGroupId: id => `${id}-pasted`,
    })

    expect(pasted.stamps[0].groupId).toBe('source-group-pasted')
    expect(pasted.steps[0].groupId).toBe('source-group-pasted')
  })
})

describe('groups', () => {
  const selection: MapObjectSelection[] = [{ kind: 'stamp', id: 'stamp' }, { kind: 'step', id: 'step' }, { kind: 'label', id: 'label' }]

  it('assigns one group ID to all selected supported objects', () => {
    const grouped = groupSelectedMapObjects({ stamps: [stamp()], steps: [step()], ramps: [ramp()], labels: [label()], selection, groupId: 'group-a' })

    expect(grouped.stamps[0].groupId).toBe('group-a')
    expect(grouped.steps[0].groupId).toBe('group-a')
    expect(grouped.labels[0].groupId).toBe('group-a')
    expect(grouped.ramps[0].groupId).toBeUndefined()
  })

  it('ungroups only the selected members', () => {
    const ungrouped = ungroupSelectedMapObjects({
      stamps: [stamp({ groupId: 'group-a' })], steps: [step({ groupId: 'group-a' })], ramps: [ramp({ groupId: 'group-a' })], labels: [label({ groupId: 'group-a' })],
      selection,
    })

    expect(ungrouped.stamps[0].groupId).toBeUndefined()
    expect(ungrouped.steps[0].groupId).toBeUndefined()
    expect(ungrouped.labels[0].groupId).toBeUndefined()
    expect(ungrouped.ramps[0].groupId).toBe('group-a')
  })
})

describe('draw order', () => {
  it('moves selected objects forward or backward within their own object type', () => {
    const selection: MapObjectSelection[] = [{ kind: 'stamp', id: 'middle' }, { kind: 'label', id: 'second-label' }]
    const params = {
      stamps: [stamp({ id: 'back' }), stamp({ id: 'middle' }), stamp({ id: 'front' })],
      steps: [step()], ramps: [ramp()],
      labels: [label({ id: 'first-label' }), label({ id: 'second-label' })], selection,
    }

    const forward = reorderSelectedMapObjects({ ...params, direction: 'forward' })
    expect(forward.stamps.map(item => item.id)).toEqual(['back', 'front', 'middle'])
    expect(forward.labels.map(item => item.id)).toEqual(['first-label', 'second-label'])

    const backward = reorderSelectedMapObjects({ ...params, direction: 'backward' })
    expect(backward.stamps.map(item => item.id)).toEqual(['middle', 'back', 'front'])
    expect(backward.labels.map(item => item.id)).toEqual(['second-label', 'first-label'])
  })

  it('brings a selection to the front or sends it to the back while preserving internal order', () => {
    const params = {
      stamps: [stamp({ id: 'one' }), stamp({ id: 'two' }), stamp({ id: 'three' }), stamp({ id: 'four' })],
      steps: [], ramps: [], labels: [],
      selection: [{ kind: 'stamp' as const, id: 'two' }, { kind: 'stamp' as const, id: 'four' }],
    }

    expect(reorderSelectedMapObjects({ ...params, direction: 'front' }).stamps.map(item => item.id)).toEqual(['one', 'three', 'two', 'four'])
    expect(reorderSelectedMapObjects({ ...params, direction: 'back' }).stamps.map(item => item.id)).toEqual(['two', 'four', 'one', 'three'])
  })
})
