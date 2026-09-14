import { describe, expect, it } from 'vitest'
import { generateRandomDungeon } from './randomDungeon/generator'
import { resolveStamp } from './randomDungeon/stamps'
import { serialize, deserialize } from './serialization'

describe('random dungeon application boundary', () => {
  it('round-trips generated authoritative state without ephemeral diagnostics', () => {
    const result = generateRandomDungeon({ cols: 22, rows: 17, seed: 271828 })
    const saved = serialize({
      ...result.snapshot,
      cols: 22,
      rows: 17,
      wallColor: '#000000',
      wallOpacity: 0,
      brushShape: 'square',
      showGrid: false,
      show3D: false,
      isoFaceColor: '#6a5040',
      showHatching: false,
      hatchColor: '#000000',
      showWallOutline: true,
      wallOutlineColor: '#000000',
      wallOutlineStyle: 'clean',
      waterColor: '#6baed6',
      lavaColor: '#c1440e',
      darknessColor: '#1a0a2e',
    })
    expect(saved).not.toHaveProperty('seed')
    expect(saved).not.toHaveProperty('failedAttempts')
    const loaded = deserialize(saved)
    expect(Array.from(loaded.grids.get(0)!)).toEqual(Array.from(result.snapshot.grids.get(0)!))
    expect(loaded.stamps).toEqual(result.snapshot.stamps)
    expect(loaded.labels).toEqual(result.snapshot.labels)
  })

  it('fails required semantic markers and records optional unmet requirements through adapters', () => {
    expect(resolveStamp({ semantic: 'trap', col: 2, row: 2, direction: 'N', required: true }, [])).toBeNull()
    expect(resolveStamp({ semantic: 'pillar', col: 2, row: 2, direction: 'N', required: false }, [])?.unmet).toBe(true)
    expect(resolveStamp({ semantic: 'door', col: 2, row: 2, direction: 'N', required: true }, ['DoorRevolve1way1x1'])).toMatchObject({ stamp: { type: 'DoorRevolve1way1x1' } })
    expect(resolveStamp({ semantic: 'valve', col: 2, row: 2, direction: 'N', required: true }, ['DoorRevolve1way1x1'])).toMatchObject({ stamp: { type: 'DoorRevolve1way1x1' } })
    expect(resolveStamp({ semantic: 'door', category: 'portcullis', col: 2, row: 2, direction: 'N', required: true })).toMatchObject({ stamp: { type: 'DoorPortcullis1x1' } })
  })

  it('uses the dedicated portcullis asset for generated portcullis doorways', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 152072343 })
    expect(result.stamps.find(stamp => stamp.sourceCategory === 'portcullis')).toMatchObject({ type: 'DoorPortcullis1x1' })
  })
})
