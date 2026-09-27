import { describe, expect, it } from 'vitest'
import type { D6Random } from './random'
import type { DangerEntry, Mission } from './missionTypes'
import type { MonsterRecord } from './monsterCatalog'
import { prepareRoomEncounters, resolveRoomEncounters } from './roomEncounter'

function scriptedRandom(d6: number[] = [], d10: number[] = []): D6Random {
  let d6Index = 0
  let d10Index = 0
  return {
    seed: 1,
    nextD6: () => d6[d6Index++] ?? 1,
    nextD10: () => d10[d10Index++] ?? 1,
  }
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test', seed: 1, style: 'spine-shortcuts', patterns: [], nodes: [], edges: [], keys: [], locks: [],
    cycles: [], goalNodeId: 'goal', diagnostics: [], ...overrides,
  }
}

const manualTable: MonsterRecord[] = [
  { name: 'Goblin', flavor: 'Scrappy raiders.', level: 1 },
  { name: 'Orc', flavor: 'Brutal fighters.', level: 2 },
  { name: 'Ogre', flavor: 'A lumbering brute.', level: 3 },
  { name: 'Wight', flavor: 'An undead hunter.', level: 4 },
  { name: 'Troll', flavor: 'A regenerating giant.', level: 5 },
]

describe('Room Encounter', () => {
  it('prepares room rolls and preserves a manually authored table', () => {
    const random = scriptedRandom([], [6, 10])
    const prepared = prepareRoomEncounters(
      { seed: 11, playerLevel: 10, monsterEncounterTable: manualTable },
      mission(),
      [
        { id: 'room-a', missionNodeId: 'a', realized: true },
        { id: 'room-b', missionNodeId: 'b', realized: true },
        { id: 'room-c', missionNodeId: 'c', realized: false },
      ],
      random,
    )

    expect(prepared.monsterEncounterTable).toEqual(manualTable)
    expect(prepared.rooms.map(room => room.encounters)).toEqual([['monster'], ['hazard'], []])
    expect(prepared.rooms[2]?.encounters).toEqual([])
  })

  it('resolves Mission empty-room and danger-entry overrides into room details', () => {
    const dangerEntries: DangerEntry[] = [{ nodeId: 'danger', count: 2, kinds: ['trap', 'hazard'] }]
    const missionWithDirectives = mission({ cycles: [{
      id: 'cycle', routeA: [], routeB: [], roles: { anchorNode: 'a', routeANode: 'b', routeBNode: 'c', objectiveNode: 'goal' },
      challenge: 'alternate-paths', routeEdgeIds: [], nonTrivial: true, dangerEntries, emptyRoomIds: ['empty'],
    }] })
    const request = { seed: 5, playerLevel: 1, monsterEncounterTable: manualTable }
    const prepared = prepareRoomEncounters(request, missionWithDirectives, [
      { id: 'room-empty', missionNodeId: 'empty', realized: true },
      { id: 'room-danger', missionNodeId: 'danger', realized: true },
    ], scriptedRandom([], [6, 1]))

    const resolved = resolveRoomEncounters(request, missionWithDirectives, prepared, scriptedRandom([6, 1, 1, 1, 1, 1]))

    expect(resolved.rooms.map(room => room.encounters)).toEqual([[], ['trap', 'hazard']])
    expect(resolved.rooms[0]?.generatedDetails).toEqual(['Empty room.'])
    expect(resolved.rooms[1]?.trapDetails).toHaveLength(1)
    expect(resolved.rooms[1]?.hazardDetails).toHaveLength(1)
    expect(resolved.rooms[1]?.generatedDetails[0]).toContain('Trap:')
    expect(resolved.rooms[1]?.generatedDetails[1]).toContain('Hazard:')
  })

  it('assigns a required monster from the manual table without replacing authored entries', () => {
    const request = { seed: 17, playerLevel: 10, monsterEncounterTable: [manualTable[0]!] }
    const missionWithMonster = mission({ cycles: [{
      id: 'cycle', routeA: ['start', 'danger', 'goal'], routeB: [], roles: { anchorNode: 'start', routeANode: 'danger', routeBNode: 'goal', objectiveNode: 'goal' },
      challenge: 'dangerous-route', routeEdgeIds: [], nonTrivial: true,
      dangerEntries: [{ nodeId: 'danger', count: 1, kinds: ['monster'] }], emptyRoomIds: [],
    }] })
    const prepared = prepareRoomEncounters(request, missionWithMonster, [
      { id: 'module-start', missionNodeId: 'start', realized: true },
      { id: 'module-danger', missionNodeId: 'danger', realized: true },
      { id: 'module-goal', missionNodeId: 'goal', realized: true },
    ], scriptedRandom([], [1, 1, 1]))

    const resolved = resolveRoomEncounters(request, missionWithMonster, prepared, scriptedRandom([1]))

    expect(prepared.monsterEncounterTable).toEqual([manualTable[0]])
    expect(resolved.rooms[1]?.encounters).toEqual(['monster'])
    expect(resolved.rooms[1]?.monsterDetails[0]?.name).not.toBe(manualTable[0]?.name)
    expect(resolved.rooms[1]?.monsterEncounterGroups[0]?.monsterLevel).toBeGreaterThanOrEqual(10)
    expect(resolved.rooms[1]?.monsterEncounterGroups[0]?.count).toBe(2)
    expect(resolved.monsterLevelsUsed).toBe(resolved.rooms[1]?.monsterEncounterGroups[0]?.levelTotal)
  })
})
