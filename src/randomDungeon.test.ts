import { describe, expect, it } from 'vitest'
import { FLOOR, WATER } from './constants'
import { generateRandomDungeon } from './randomDungeon/generator'
import { createD6Random } from './randomDungeon/random'
import { conditionLabelText, clockwiseAdjacentPositions } from './randomDungeon/labels'
import { PlacementLedger } from './randomDungeon/placement'

describe('random dungeon generation', () => {
  it('uses an inclusive deterministic D6 stream', () => {
    const a = createD6Random(123); const b = createD6Random(123)
    const left = Array.from({ length: 40 }, () => a.nextD6()); const right = Array.from({ length: 40 }, () => b.nextD6())
    expect(left).toEqual(right); expect(left.every(value => value >= 1 && value <= 6)).toBe(true)
  })

  it('replays every result record and map byte-for-byte', () => {
    const a = generateRandomDungeon({ cols: 22, rows: 17, seed: 0xdecafbad })
    const b = generateRandomDungeon({ cols: 22, rows: 17, seed: 0xdecafbad })
    expect(Array.from(a.snapshot.grids.get(0)!)).toEqual(Array.from(b.snapshot.grids.get(0)!))
    expect({ ...a, snapshot: undefined, map: undefined }).toEqual({ ...b, snapshot: undefined, map: undefined })
    expect(a.summary).toEqual(b.summary)
  })

  it('keeps generated state to Z=0 and treats flooded tiles as traversable', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 42, 99, 123456]) {
      const result = generateRandomDungeon({ cols: 22, rows: 17, seed })
      expect([...result.snapshot.grids.keys()]).toEqual([0])
      expect(result.snapshot.steps).toEqual([]); expect(result.snapshot.ramps).toEqual([])
      const grid = result.snapshot.grids.get(0)!
      expect(Array.from(grid).every(tile => tile === 0 || tile === FLOOR || tile === WATER)).toBe(true)
    }
  })

  it('rejects border and diagonal-buffer contact transactionally', () => {
    const ledger = new PlacementLedger(8, 8)
    expect(ledger.commit([{ col: 1, row: 1 }])).toMatchObject({ points: [{ col: 1, row: 1 }] })
    const before = ledger.grid
    expect(ledger.commit([{ col: 2, row: 2 }])).toMatchObject({ reason: 'lost-buffer' })
    expect(Array.from(ledger.grid)).toEqual(Array.from(before))
    expect(ledger.commit([{ col: 0, row: 3 }])).toMatchObject({ reason: 'out-of-bounds' })
  })

  it('exposes canonical labels and clockwise placement order', () => {
    expect(conditionLabelText('locked + trapped')).toBe('Locked + Trapped')
    expect(clockwiseAdjacentPositions({ col: 4, row: 4 }, 'N')).toEqual([{ col: 4, row: 3 }, { col: 5, row: 4 }, { col: 4, row: 5 }, { col: 3, row: 4 }])
  })
})
