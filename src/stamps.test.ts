import { describe, expect, it } from 'vitest'
import { addStamp, isFloorStamp, isObjectStamp, moveStamp, removeStamp, rotateStamp, stampSize, type Stamp } from './stamps'

const stamp = (overrides: Partial<Stamp> = {}): Stamp => ({
  id: 'a',
  type: 'door',
  col: 2,
  row: 3,
  rotation: 0,
  ...overrides,
})

describe('stampSize', () => {
  it('returns 1×1 for door, trap, star, bars', () => {
    for (const type of ['door', 'trap', 'star', 'bars'] as const) {
      expect(stampSize(type)).toEqual({ cols: 1, rows: 1 })
    }
  })

  it('returns 2×1 for stairs', () => {
    expect(stampSize('stairs')).toEqual({ cols: 2, rows: 1 })
  })

  it('returns 1×1 for archway', () => {
    expect(stampSize('archway')).toEqual({ cols: 1, rows: 1 })
  })
})

describe('addStamp', () => {
  it('appends stamp to list', () => {
    const s = stamp()
    const result = addStamp([], s)
    expect(result).toEqual([s])
  })

  it('does not mutate the original array', () => {
    const list = [stamp({ id: 'a' })]
    addStamp(list, stamp({ id: 'b' }))
    expect(list).toHaveLength(1)
  })
})

describe('removeStamp', () => {
  it('removes stamp by id', () => {
    const list = [stamp({ id: 'a' }), stamp({ id: 'b' })]
    expect(removeStamp(list, 'a')).toEqual([stamp({ id: 'b' })])
  })

  it('is a no-op for unknown id', () => {
    const list = [stamp({ id: 'a' })]
    expect(removeStamp(list, 'z')).toEqual(list)
  })

  it('does not mutate the original array', () => {
    const list = [stamp({ id: 'a' })]
    removeStamp(list, 'a')
    expect(list).toHaveLength(1)
  })
})

describe('rotateStamp', () => {
  it('rotates 0 → 90', () => {
    const list = [stamp({ id: 'a', rotation: 0 })]
    expect(rotateStamp(list, 'a')[0].rotation).toBe(90)
  })

  it('rotates 90 → 180', () => {
    const list = [stamp({ id: 'a', rotation: 90 })]
    expect(rotateStamp(list, 'a')[0].rotation).toBe(180)
  })

  it('rotates 270 → 0', () => {
    const list = [stamp({ id: 'a', rotation: 270 })]
    expect(rotateStamp(list, 'a')[0].rotation).toBe(0)
  })

  it('leaves other stamps unchanged', () => {
    const list = [stamp({ id: 'a', rotation: 0 }), stamp({ id: 'b', rotation: 0 })]
    const result = rotateStamp(list, 'a')
    expect(result[1].rotation).toBe(0)
  })

  it('is a no-op for unknown id', () => {
    const list = [stamp({ id: 'a', rotation: 0 })]
    expect(rotateStamp(list, 'z')).toEqual(list)
  })
})

describe('moveStamp', () => {
  it('moves stamp to new col and row', () => {
    const list = [stamp({ id: 'a', col: 2, row: 3 })]
    const result = moveStamp(list, 'a', 5, 7)
    expect(result[0]).toMatchObject({ col: 5, row: 7 })
  })

  it('leaves other stamps unchanged', () => {
    const list = [stamp({ id: 'a', col: 2, row: 3 }), stamp({ id: 'b', col: 0, row: 0 })]
    const result = moveStamp(list, 'a', 5, 7)
    expect(result[1]).toMatchObject({ col: 0, row: 0 })
  })

  it('is a no-op for unknown id', () => {
    const list = [stamp({ id: 'a', col: 2, row: 3 })]
    expect(moveStamp(list, 'z', 5, 7)).toEqual(list)
  })

  it('does not mutate the original array', () => {
    const list = [stamp({ id: 'a', col: 2, row: 3 })]
    moveStamp(list, 'a', 5, 7)
    expect(list[0].col).toBe(2)
  })
})

describe('isObjectStamp', () => {
  it('returns true for archway', () => {
    expect(isObjectStamp(stamp({ type: 'archway' } as any))).toBe(true)
  })

  it('returns false for floor stamp types', () => {
    expect(isObjectStamp(stamp({ type: 'door' }))).toBe(false)
  })
})

describe('isFloorStamp', () => {
  it('returns true for floor stamp types', () => {
    expect(isFloorStamp(stamp({ type: 'door' }))).toBe(true)
  })

  it('returns false for archway', () => {
    expect(isFloorStamp(stamp({ type: 'archway' } as any))).toBe(false)
  })
})
