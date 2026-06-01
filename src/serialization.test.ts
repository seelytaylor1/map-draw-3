import { describe, expect, it } from 'vitest'
import { serialize, deserialize } from './serialization'
import { type Stamp } from './stamps'

const BASE = {
  grid: new Uint8Array([1, 0, 1, 1]),
  cols: 2,
  rows: 2,
  wallColor: '#ff0000',
  wallOpacity: 0.5,
  brushShape: 'circle' as const,
  showGrid: true,
  show3D: false,
  stamps: [] as Stamp[],
}

const STAMP: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 90 }

describe('serialize', () => {
  it('produces a JSON-safe object', () => {
    const save = serialize(BASE)
    expect(save.version).toBe(1)
    expect(save.grid).toEqual([1, 0, 1, 1])
    expect(JSON.parse(JSON.stringify(save))).toEqual(save)
  })

  it('converts Uint8Array to plain array', () => {
    const save = serialize(BASE)
    expect(Array.isArray(save.grid)).toBe(true)
  })

  it('includes stamps in output', () => {
    const save = serialize({ ...BASE, stamps: [STAMP] })
    expect(save.stamps).toEqual([STAMP])
  })

  it('does not include brushSize in output', () => {
    const save = serialize(BASE)
    expect('brushSize' in save).toBe(false)
  })
})

describe('deserialize', () => {
  it('round-trips through JSON', () => {
    const json = JSON.stringify(serialize(BASE))
    const restored = deserialize(JSON.parse(json))
    expect(restored.grid).toEqual([1, 0, 1, 1])
    expect(restored.wallColor).toBe('#ff0000')
    expect(restored.wallOpacity).toBe(0.5)
    expect(restored.brushShape).toBe('circle')
    expect(restored.showGrid).toBe(true)
    expect(restored.cols).toBe(2)
    expect(restored.rows).toBe(2)
    expect(restored.stamps).toEqual([])
  })

  it('round-trips stamps', () => {
    const json = JSON.stringify(serialize({ ...BASE, stamps: [STAMP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps).toEqual([STAMP])
  })

  it('defaults stamps to [] for old v1 saves without stamps field', () => {
    const old = JSON.stringify({ ...serialize(BASE), stamps: undefined })
    const restored = deserialize(JSON.parse(old))
    expect(restored.stamps).toEqual([])
  })

  it('defaults show3D to false for old saves without show3D field', () => {
    const { show3D: _, ...rest } = serialize({ ...BASE, show3D: true })
    const restored = deserialize(rest)
    expect(restored.show3D).toBe(false)
  })

  it('round-trips show3D: true', () => {
    const json = JSON.stringify(serialize({ ...BASE, show3D: true }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.show3D).toBe(true)
  })

  it('accepts old saves that include brushSize field', () => {
    const old = { ...serialize(BASE), brushSize: 3 }
    expect(() => deserialize(old)).not.toThrow()
  })

  it('throws on non-object', () => {
    expect(() => deserialize('bad')).toThrow()
    expect(() => deserialize(null)).toThrow()
    expect(() => deserialize(42)).toThrow()
  })

  it('throws on unsupported version', () => {
    const bad = { ...serialize(BASE), version: 2 as unknown as 1 }
    expect(() => deserialize(bad)).toThrow('Unsupported version')
  })

  it('throws on missing grid', () => {
    const { grid: _, ...rest } = serialize(BASE)
    expect(() => deserialize(rest)).toThrow('Invalid grid')
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

  it('throws on invalid stamp rotation', () => {
    const bad = { ...serialize(BASE), stamps: [{ ...STAMP, rotation: 45 }] }
    expect(() => deserialize(bad)).toThrow('Invalid stamp rotation')
  })
})
