import { describe, expect, it } from 'vitest'
import { serialize, deserialize } from './serialization'
import { WATER } from './constants'
import { type Stamp } from './stamps'
import { type StepRun } from './steps'
import { type RampRun } from './ramps'
import { type Label } from './labels'

const GRIDS = new Map([[0, new Uint8Array([1, 0, 1, 1])]])

const BASE = {
  grids: GRIDS,
  patterns: new Map([[0, new Uint8Array([0, 0, 0, 0])]]),
  cols: 2,
  rows: 2,
  wallColor: '#ff0000',
  wallOpacity: 0.5,
  brushShape: 'circle' as const,
  showGrid: true,
  show3D: false,
  isoFaceColor: '#6a5040',
  stamps: [] as Stamp[],
  steps: [] as StepRun[],
  ramps: [] as RampRun[],
  labels: [] as Label[],
}

const STAMP: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 90, z: 0 }
const STAMP_Z1: Stamp = { id: 'xyz', type: 'door', col: 0, row: 0, rotation: 0, z: 1 }
const OBJECT_STAMP: Stamp = { id: 'def', type: 'archway', col: 3, row: 4, rotation: 0, z: 0 }

describe('serialize', () => {
  it('produces a JSON-safe object with version 1', () => {
    const save = serialize(BASE)
    expect(save.version).toBe(1)
    expect(JSON.parse(JSON.stringify(save))).toEqual(save)
  })

  it('converts grids Map to plain string-keyed object', () => {
    const save = serialize(BASE)
    expect(save.grids).toEqual({ '0': [1, 0, 1, 1] })
  })

  it('serializes multiple Z levels', () => {
    const grids = new Map([
      [0, new Uint8Array([1, 0, 1, 1])],
      [-1, new Uint8Array([0, 1, 0, 0])],
    ])
    const save = serialize({ ...BASE, grids })
    expect(save.grids['-1']).toEqual([0, 1, 0, 0])
    expect(save.grids['0']).toEqual([1, 0, 1, 1])
  })

  it('includes stamps in output', () => {
    const save = serialize({ ...BASE, stamps: [STAMP] })
    expect(save.stamps[0]).toMatchObject({ id: 'abc', type: 'door' })
  })

  it('omits z from stamp when z === 0', () => {
    const save = serialize({ ...BASE, stamps: [STAMP] })
    expect(save.stamps[0]).not.toHaveProperty('z')
  })

  it('includes z in stamp when z !== 0', () => {
    const save = serialize({ ...BASE, stamps: [STAMP_Z1] })
    expect(save.stamps[0].z).toBe(1)
  })

  it('does not include grid (old field) in output', () => {
    const save = serialize(BASE)
    expect('grid' in save).toBe(false)
  })
})

describe('deserialize', () => {
  it('round-trips through JSON', () => {
    const json = JSON.stringify(serialize(BASE))
    const restored = deserialize(JSON.parse(json))
    expect(restored.grids.get(0)).toEqual(new Uint8Array([1, 0, 1, 1]))
    expect(restored.wallColor).toBe('#ff0000')
    expect(restored.wallOpacity).toBe(0.5)
    expect(restored.brushShape).toBe('circle')
    expect(restored.showGrid).toBe(true)
    expect(restored.cols).toBe(2)
    expect(restored.rows).toBe(2)
    expect(restored.stamps).toEqual([])
  })

  it('round-trips multiple Z levels', () => {
    const grids = new Map([
      [0, new Uint8Array([1, 0, 1, 1])],
      [-1, new Uint8Array([0, 1, 0, 0])],
    ])
    const json = JSON.stringify(serialize({ ...BASE, grids }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.grids.get(-1)).toEqual(new Uint8Array([0, 1, 0, 0]))
  })

  it('loads old v1 saves with flat grid key as Z=0', () => {
    const old = {
      version: 1,
      cols: 2,
      rows: 2,
      grid: [1, 0, 1, 1],
      wallColor: '#000000',
      wallOpacity: 1,
      brushShape: 'square',
      showGrid: false,
      show3D: false,
      stamps: [],
    }
    const restored = deserialize(old)
    expect(restored.grids.get(0)).toEqual(new Uint8Array([1, 0, 1, 1]))
  })

  it('round-trips stamps with z=0 (z omitted in file)', () => {
    const json = JSON.stringify(serialize({ ...BASE, stamps: [STAMP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].z).toBe(0)
  })

  it('round-trips stamps with z=1', () => {
    const json = JSON.stringify(serialize({ ...BASE, stamps: [STAMP_Z1] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].z).toBe(1)
  })

  it('defaults stamp z to 0 when field is absent (old save)', () => {
    const old = {
      version: 1,
      cols: 2,
      rows: 2,
      grid: [0, 0, 0, 0],
      wallColor: '#000000',
      wallOpacity: 1,
      brushShape: 'square',
      showGrid: false,
      show3D: false,
      stamps: [{ id: 'a', type: 'door', col: 0, row: 0, rotation: 0 }],
    }
    const restored = deserialize(old)
    expect(restored.stamps[0].z).toBe(0)
  })

  it('defaults stamps to [] for saves without stamps field', () => {
    const save = serialize(BASE)
    const { stamps: _, ...noStamps } = save
    const restored = deserialize(noStamps)
    expect(restored.stamps).toEqual([])
  })

  it('defaults show3D to false for saves without show3D field', () => {
    const save = serialize({ ...BASE, show3D: true })
    const { show3D: _, ...noShow3D } = save
    const restored = deserialize(noShow3D)
    expect(restored.show3D).toBe(false)
  })

  it('round-trips show3D: true', () => {
    const json = JSON.stringify(serialize({ ...BASE, show3D: true }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.show3D).toBe(true)
  })

  it('accepts saves that include legacy brushSize field', () => {
    const old = { ...serialize(BASE), brushSize: 3 }
    expect(() => deserialize(old)).not.toThrow()
  })

  it('throws on non-object', () => {
    expect(() => deserialize('bad')).toThrow()
    expect(() => deserialize(null)).toThrow()
    expect(() => deserialize(42)).toThrow()
  })

  it('throws on unsupported version', () => {
    const bad = { ...serialize(BASE), version: 99 }
    expect(() => deserialize(bad)).toThrow('Unsupported version')
  })

  it('throws when neither grid nor grids is present', () => {
    const { grids: _, ...noGrids } = serialize(BASE)
    expect(() => deserialize(noGrids)).toThrow('Invalid grid')
  })

  it('throws on invalid brushShape', () => {
    expect(() => deserialize({ ...serialize(BASE), brushShape: 'triangle' })).toThrow('Invalid brushShape')
  })

  it('throws on invalid cols', () => {
    expect(() => deserialize({ ...serialize(BASE), cols: 0 })).toThrow('Invalid cols')
  })

  it('throws on invalid stamp type', () => {
    const bad = { ...serialize(BASE), stamps: [{ ...STAMP, type: 'ghost' }] }
    expect(() => deserialize(bad)).toThrow('Invalid stamp type')
  })

  it('round-trips object stamp (archway)', () => {
    const json = JSON.stringify(serialize({ ...BASE, stamps: [OBJECT_STAMP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0]).toMatchObject({ type: 'archway', z: 0 })
  })

  it('throws on invalid stamp rotation', () => {
    const bad = { ...serialize(BASE), stamps: [{ ...STAMP, rotation: 45 }] }
    expect(() => deserialize(bad)).toThrow('Invalid stamp rotation')
  })
})

describe('scale field', () => {
  it('serialize omits scale when it equals 1', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, z: 0, scale: 1 }
    const save = serialize({ ...BASE, stamps: [scaledStamp] })
    expect(save.stamps[0]).not.toHaveProperty('scale')
  })

  it('serialize includes scale when not 1', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, z: 0, scale: 2.5 }
    const save = serialize({ ...BASE, stamps: [scaledStamp] })
    expect(save.stamps[0].scale).toBe(2.5)
  })

  it('deserialize defaults scale to undefined when field is missing', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0 }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })

  it('deserialize round-trips scale: 2', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, z: 0, scale: 2 }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [scaledStamp] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].scale).toBe(2)
  })

  it('deserialize ignores invalid scale (non-finite) and omits it', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: Infinity }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })

  it('deserialize ignores invalid scale (zero) and omits it', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: 0 }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })
})

describe('Water tile round-trip', () => {
  it('preserves WATER tile value through serialize/deserialize', () => {
    const waterGrids = new Map([[0, new Uint8Array([WATER, 1, 0, 1])]])
    const save = serialize({ ...BASE, grids: waterGrids })
    expect(save.grids['0'][0]).toBe(WATER)
    const restored = deserialize(JSON.parse(JSON.stringify(save)))
    expect(restored.grids.get(0)![0]).toBe(WATER)
  })
})

describe('stamp mirrored field', () => {
  it('serialize strips mirrored when false', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, z: 0, mirrored: false }
    const save = serialize({ ...BASE, stamps: [s] })
    expect(save.stamps[0]).not.toHaveProperty('mirrored')
  })

  it('serialize preserves mirrored: true', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, z: 0, mirrored: true }
    const save = serialize({ ...BASE, stamps: [s] })
    expect(save.stamps[0].mirrored).toBe(true)
  })

  it('deserialize round-trips mirrored: true', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, z: 0, mirrored: true }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [s] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].mirrored).toBe(true)
  })

  it('deserialize treats missing mirrored as undefined', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, z: 0 }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [s] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].mirrored).toBeUndefined()
  })
})

describe('steps round-trip', () => {
  const STEP: StepRun = { id: 's1', col: 5, row: 6, z: -1, direction: 'W' }

  it('serialize includes steps in output', () => {
    const save = serialize({ ...BASE, steps: [STEP] })
    expect(save.steps).toEqual([STEP])
  })

  it('round-trips steps through JSON', () => {
    const json = JSON.stringify(serialize({ ...BASE, steps: [STEP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.steps).toEqual([STEP])
  })

  it('defaults steps to [] for saves without steps field (old save)', () => {
    const save = serialize(BASE)
    const { steps: _, ...noSteps } = save
    const restored = deserialize(noSteps)
    expect(restored.steps).toEqual([])
  })

  it('throws on invalid step direction', () => {
    const bad = { ...serialize(BASE), steps: [{ ...STEP, direction: 'Q' }] }
    expect(() => deserialize(bad)).toThrow('Invalid step direction')
  })

  it('throws on missing step id', () => {
    const { id: _, ...noId } = STEP
    const bad = { ...serialize(BASE), steps: [noId] }
    expect(() => deserialize(bad)).toThrow('Invalid step id')
  })

  it('defaults step z to 0 when absent', () => {
    const bad = { ...serialize(BASE), steps: [{ id: 's', col: 1, row: 1, direction: 'N' }] }
    const restored = deserialize(bad)
    expect(restored.steps[0].z).toBe(0)
  })
})

describe('ramps round-trip', () => {
  const RAMP: RampRun = { id: 'r1', col: 5, row: 6, z: -1, direction: 'W' }

  it('serialize includes ramps in output', () => {
    const save = serialize({ ...BASE, ramps: [RAMP] })
    expect(save.ramps).toEqual([RAMP])
  })

  it('round-trips ramps through JSON', () => {
    const json = JSON.stringify(serialize({ ...BASE, ramps: [RAMP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.ramps).toEqual([RAMP])
  })

  it('defaults ramps to [] for saves without ramps field (old save)', () => {
    const save = serialize(BASE)
    const { ramps: _, ...noRamps } = save
    const restored = deserialize(noRamps)
    expect(restored.ramps).toEqual([])
  })

  it('throws on invalid ramp direction', () => {
    const bad = { ...serialize(BASE), ramps: [{ ...RAMP, direction: 'Q' }] }
    expect(() => deserialize(bad)).toThrow('Invalid ramp direction')
  })

  it('throws on missing ramp id', () => {
    const { id: _, ...noId } = RAMP
    const bad = { ...serialize(BASE), ramps: [noId] }
    expect(() => deserialize(bad)).toThrow('Invalid ramp id')
  })

  it('defaults ramp z to 0 when absent', () => {
    const bad = { ...serialize(BASE), ramps: [{ id: 'r', col: 1, row: 1, direction: 'N' }] }
    const restored = deserialize(bad)
    expect(restored.ramps[0].z).toBe(0)
  })
})
