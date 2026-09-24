// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomLedger } from './RoomLedger'

describe('room ledger', () => {
  afterEach(cleanup)

  it('shows general notes alongside room records', () => {
    render(
      <RoomLedger
        entries={[]}
        generalNotes={['Hallway traps: all trapped hallways share one variety.']}
        onCommitGeneralNotes={vi.fn()}
        onCommitRoomEntry={vi.fn()}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Room ledger' })).toHaveAttribute('open')
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
        entries={[]}
        generalNotes={['Random Encounter Table:\n1. Torch extinguished', 'Hallway traps: all trapped hallways share one variety.', 'Hallway hazards: all hazardous hallways share one variety.']}
        onCommitGeneralNotes={vi.fn()}
        onCommitRoomEntry={vi.fn()}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
      />,
    )

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
        entries={[]}
        generalNotes={['Existing note']}
        onCommitGeneralNotes={onCommitGeneralNotes}
        onCommitRoomEntry={vi.fn()}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Room 0 details' })
    fireEvent.change(input, { target: { value: 'Shared hazard\nBring a lantern' } })
    fireEvent.blur(input)
    expect(onCommitGeneralNotes).toHaveBeenCalledWith(['Shared hazard', 'Bring a lantern'])
  })
})
