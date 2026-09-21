import { describe, expect, it } from 'vitest'
import { createHazardRecord, formatHazardRecord } from './hazardGenerator'
import type { D6Random } from './random'

function sequenceRandom(values: number[]): D6Random {
  return {
    seed: 1,
    nextD6: () => values.shift() ?? 1,
    nextD10: () => values.shift() ?? 1,
  }
}

describe('hazard generator', () => {
  it('covers every supplied D66 hazard slot', () => {
    const rolls = ['11', '12', '13', '14', '15', '16', '21', '22', '23', '24', '25', '26', '31', '32', '33', '34', '35', '36', '41', '42', '43', '44', '45', '46', '51', '52', '53', '54', '55', '56', '61', '62', '63', '64', '65', '66']

    for (const roll of rolls) {
      const record = createHazardRecord(sequenceRandom([Number(roll[0]), Number(roll[1]), 1]))
      expect(record.roll).toBe(roll)
      expect(record.name).toBeTruthy()
      expect(record.description).toBeTruthy()
      expect(formatHazardRecord(record)).toMatch(/^Hazard: /)
    }
  })

  it('rolls the nested Exploding Barrels contents', () => {
    const record = createHazardRecord(sequenceRandom([5, 2, 1]))

    expect(record).toMatchObject({ roll: '52', name: 'Exploding Barrels: Blackpowder' })
    expect(record.description).toContain('Roll DEX or take 3d6 damage.')
  })
})
