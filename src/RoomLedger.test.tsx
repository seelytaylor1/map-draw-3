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

  const openLedger = () => {
    const ledger = screen.getByRole('group', { name: 'Generated room ledger' })
    fireEvent.click(ledger.querySelector('summary')!)
  }

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
      />,
    )

    openLedger()
    expect(screen.getByRole('button', { name: /00.*general notes/i })).toBeInTheDocument()
    const resizer = screen.getByRole('separator', { name: 'Resize room ledger' })
    expect(resizer).toHaveAttribute('aria-valuenow', '430')
    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    expect(resizer).toHaveAttribute('aria-valuenow', '446')
    expect(screen.getByRole('textbox', { name: 'Room 0 name' })).toHaveValue('General notes')
    expect(screen.getByRole('textbox', { name: 'Room 0 details' })).toHaveValue('Hallway traps: all trapped hallways share one variety.')
  })

  it('separates formatted general-note blocks with blank lines', () => {
    render(
      <RoomLedger
        modules={[module]}
        mission={mission}
        labels={[{ id: 'label-module-room-1', col: 2, row: 2, text: 'Room', number: 1 }]}
        generalNotes={['Random Encounter Table:\n1. Torch extinguished', 'Hallway traps: all trapped hallways share one variety.', 'Hallway hazards: all hazardous hallways share one variety.']}
        onCommitGeneralNotes={vi.fn()}
        onCommitRoomName={vi.fn()}
        onCommitRoomDetails={vi.fn()}
      />,
    )

    openLedger()
    expect(screen.getByRole('textbox', { name: 'Room 0 details' })).toHaveValue([
      'Random Encounter Table:\n1. Torch extinguished',
      'Hallway traps: all trapped hallways share one variety.',
      'Hallway hazards: all hazardous hallways share one variety.',
    ].join('\n\n'))
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
      />,
    )

    openLedger()
    const input = screen.getByRole('textbox', { name: 'Room 0 details' })
    fireEvent.change(input, { target: { value: 'Shared hazard\nBring a lantern' } })
    fireEvent.blur(input)
    expect(onCommitGeneralNotes).toHaveBeenCalledWith(['Shared hazard', 'Bring a lantern'])
  })
})
