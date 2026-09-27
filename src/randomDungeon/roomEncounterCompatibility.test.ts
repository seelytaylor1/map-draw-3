import { describe, expect, it } from 'vitest'
import { generateMissionDungeon, type GenerationRequest } from './missionFirst'
import type { MonsterRecord } from './monsterCatalog'

const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  style: 'spine-shortcuts',
  seed: 42,
  cols: 88,
  rows: 68,
  tilesPerInch: 8,
  orientation: 'landscape',
  complexity: 'compact',
  loopCount: 0,
  loopPreference: 'varied',
  ...overrides,
})

const manualMonsterTable: MonsterRecord[] = [
  { name: 'Goblin', flavor: 'Scrappy raiders.', level: 1 },
  { name: 'Orc', flavor: 'Brutal fighters.', level: 2 },
  { name: 'Ogre', flavor: 'A lumbering brute.', level: 3 },
  { name: 'Wight', flavor: 'An undead hunter.', level: 4 },
  { name: 'Troll', flavor: 'A regenerating giant.', level: 5 },
]

const compatibilityCases: Array<{ name: string; request: GenerationRequest }> = [
  { name: 'ambient room encounters', request: request({ seed: 42 }) },
  {
    name: 'manual table with a high-level danger contract',
    request: request({
      seed: 73,
      complexity: 'standard',
      loopCount: 1,
      loopPreference: 'dangerous-route',
      loopChallenges: ['dangerous-route'],
      playerLevel: 10,
      monsterEncounterTable: manualMonsterTable,
    }),
  },
]

function canonicalize(value: unknown): unknown {
  if (value instanceof Uint8Array) return Array.from(value)
  if (value instanceof Map) return Array.from(value.entries(), ([key, entry]) => [key, canonicalize(entry)])
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]))
  }
  return value
}

async function fingerprint(value: unknown): Promise<string> {
  const source = new TextEncoder().encode(JSON.stringify(canonicalize(value)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

describe('Room Encounter seed compatibility', () => {
  it('preserves complete generated results for representative seeded requests', async () => {
    const fingerprints: string[] = []

    for (const fixture of compatibilityCases) {
      const result = generateMissionDungeon(fixture.request)
      expect(result.ok, fixture.name).toBe(true)
      fingerprints.push(await fingerprint(result))
    }

    expect(fingerprints).toEqual([
      'd38a72395d36cd196364a64ca41330918b56ef4de6e39d1f0ee2617005932fb1',
      '1221e0be46352018ab9e9329591465f6a2e1362dc7c1b1327e215d9a12f91c74',
    ])
  })
})
