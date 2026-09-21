// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomLedger } from './RoomLedger'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'

const module: SpatialModule = {
  id: 'module-room-1',
  type: 'room',
  missionNodeId: 'room-1',
  origin: { col: 2, row: 2 },
  width: 3,
  height: 3,
  footprint: [{ col: 2, row: 2 }],
  ports: [],
}

const mission: Mission = {
  id: 'mission-test',
  seed: 1,
  style: 'spine-shortcuts',
  patterns: [],
  nodes: [{ id: 'room-1', kind: 'task', label: 'Room', patternId: 'progression' }],
  edges: [],
  keys: [],
  locks: [],
  cycles: [],
  goalNodeId: 'room-1',
  diagnostics: [],
}

describe('room ledger', () => {
  afterEach(cleanup)

  it('shows generated general notes alongside room records', () => {
    render(
      <RoomLedger
        modules={[module]}
        mission={mission}
        labels={[{ id: 'label-module-room-1', col: 2, row: 2, text: 'Room', number: 1 }]}
        generalNotes={['Hallway traps: all trapped hallways share one variety.']}
        onCommitGeneralNotes={vi.fn()}
        onCommitRoomName={vi.fn()}
        onCommitRoomDetails={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /00.*general notes/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Room 0 name' })).toHaveValue('General notes')
    expect(screen.getByRole('textbox', { name: 'Room 0 details' })).toHaveValue('Hallway traps: all trapped hallways share one variety.')
  })

  it('commits editable general notes one line at a time', () => {
    const onCommitGeneralNotes = vi.fn()
    render(
      <RoomLedger
        modules={[module]}
        mission={mission}
        labels={[{ id: 'label-module-room-1', col: 2, row: 2, text: 'Room', number: 1 }]}
        generalNotes={['Existing note']}
        onCommitGeneralNotes={onCommitGeneralNotes}
        onCommitRoomName={vi.fn()}
        onCommitRoomDetails={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Room 0 details' })
    fireEvent.change(input, { target: { value: 'Shared hazard\nBring a lantern' } })
    fireEvent.blur(input)
    expect(onCommitGeneralNotes).toHaveBeenCalledWith(['Shared hazard', 'Bring a lantern'])
  })
})
