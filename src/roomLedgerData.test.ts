import { describe, expect, it } from 'vitest'
import { buildRoomLedgerEntries, formatRoomLedgerText } from './roomLedgerData'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'

const mission: Mission = {
  id: 'mission', seed: 1, style: 'spine-shortcuts', patterns: [],
  nodes: [{ id: 'node-1', kind: 'task', label: 'Hall', patternId: 'progression' }],
  edges: [], keys: [], locks: [], cycles: [], goalNodeId: 'node-1', diagnostics: [],
}

const modules: SpatialModule[] = [{
  id: 'room-1', type: 'room', missionNodeId: 'node-1', origin: { col: 1, row: 1 }, width: 3, height: 3,
  footprint: [{ col: 1, row: 1 }], ports: [],
}]

describe('room ledger export text', () => {
  it('uses the same numbered room names and editable details as the ledger', () => {
    const labels = [{ id: 'label-room-1', col: 1, row: 1, text: 'Library', number: 4, details: 'A dusty archive.' }]
    expect(buildRoomLedgerEntries(modules, mission, labels)).toMatchObject([{ number: 4, name: 'Library', details: 'A dusty archive.' }])
  })

  it('includes general notes and room records in plain text', () => {
    const text = formatRoomLedgerText({
      modules, mission,
      labels: [{ id: 'label-room-1', col: 1, row: 1, text: 'Library', number: 1, details: 'A dusty archive.' }],
      generalNotes: ['Bring a lantern.', 'The east door is trapped.'],
    })

    expect(text).toContain('GENERAL NOTES')
    expect(text).toContain('Bring a lantern.\n\nThe east door is trapped.')
    expect(text).toContain('ROOM 01 — Library')
    expect(text).toContain('A dusty archive.')
  })
})
