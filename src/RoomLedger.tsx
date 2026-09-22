import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Label } from './labels'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'
import { buildRoomLedgerEntries, type RoomLedgerEntry } from './roomLedgerData'

export interface RoomLedgerProps {
  modules: readonly SpatialModule[]
  mission: Mission
  labels: readonly Label[]
  generalNotes: readonly string[]
  onCommitGeneralNotes: (notes: string[]) => void
  onCommitRoomName: (moduleId: string, text: string) => void
  onCommitRoomDetails: (moduleId: string, details: string) => void
}

function formatGeneralNotes(notes: readonly string[]): string {
  return notes.join('\n\n')
}

function RoomNameInput({ room, value, onChange, onCommit }: {
  room: RoomLedgerEntry
  value: string
  onChange: (value: string) => void
  onCommit: () => void
}) {
  return (
    <input
      className="room-name-input"
      value={value}
      aria-label={`Room ${room.number} name`}
      onChange={event => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function RoomLedger({ modules, mission, labels, generalNotes, onCommitGeneralNotes, onCommitRoomName, onCommitRoomDetails }: RoomLedgerProps) {
  const rooms = useMemo(() => buildRoomLedgerEntries(modules, mission, labels), [labels, mission, modules])
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.module.id, room.name])))
  const [detailsDrafts, setDetailsDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.module.id, room.details])))
  const [generalNotesDraft, setGeneralNotesDraft] = useState(() => formatGeneralNotes(generalNotes))
  const [selectedEntryId, setSelectedEntryId] = useState<'general-notes' | string>('general-notes')
  const [panelWidth, setPanelWidth] = useState(430)
  const resizingPanelRef = useRef(false)

  useEffect(() => {
    setDrafts(Object.fromEntries(rooms.map(room => [room.module.id, room.name])))
    setDetailsDrafts(Object.fromEntries(rooms.map(room => [room.module.id, room.details])))
    setSelectedEntryId(previous => previous === 'general-notes' || rooms.some(room => room.module.id === previous) ? previous : 'general-notes')
  }, [rooms.length, rooms.map(room => room.module.id).join('|')])

  useEffect(() => { setGeneralNotesDraft(formatGeneralNotes(generalNotes)) }, [generalNotes])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizingPanelRef.current) return
      setPanelWidth(Math.min(640, Math.max(320, window.innerWidth - event.clientX - 12)))
    }
    const stopResize = () => {
      resizingPanelRef.current = false
      document.body.classList.remove('resizing-panel')
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      document.body.classList.remove('resizing-panel')
    }
  }, [])

  const selectedRoom = rooms.find(room => room.module.id === selectedEntryId) ?? rooms[0]
  const generalNotesSelected = selectedEntryId === 'general-notes'
  if (!selectedRoom && !generalNotesSelected) return null

  const updateDraft = (room: RoomLedgerEntry, value: string) => {
    setDrafts(previous => ({ ...previous, [room.module.id]: value }))
  }

  const commit = (room: RoomLedgerEntry) => {
    const value = (drafts[room.module.id] ?? room.name).trim()
    if (value && value !== room.name) onCommitRoomName(room.module.id, value)
    if (!value) setDrafts(previous => ({ ...previous, [room.module.id]: room.name }))
  }

  const updateDetails = (room: RoomLedgerEntry, value: string) => {
    setDetailsDrafts(previous => ({ ...previous, [room.module.id]: value }))
  }

  const commitDetails = (room: RoomLedgerEntry) => {
    const value = detailsDrafts[room.module.id] ?? room.details
    if (value !== room.details) onCommitRoomDetails(room.module.id, value)
  }

  const commitGeneralNotes = () => {
    const blocks = generalNotesDraft.includes('\n\n') ? generalNotesDraft.split(/\n[ \t]*\n/) : generalNotesDraft.split('\n')
    const notes = blocks.map(note => note.trim()).filter(Boolean)
    if (formatGeneralNotes(notes) !== formatGeneralNotes(generalNotes)) onCommitGeneralNotes(notes)
  }

  const resizeByKeyboard = (direction: 'wider' | 'narrower') => {
    setPanelWidth(width => Math.min(640, Math.max(320, width + (direction === 'wider' ? 16 : -16))))
  }

  return (
    <details className="room-ledger" aria-label="Generated room ledger" style={{ '--room-ledger-width': `${panelWidth}px` } as CSSProperties}>
      <summary className="room-ledger-summary">
        <span className="room-ledger-summary-copy">
          <span className="room-ledger-summary-eyebrow">Room records</span>
          <strong>Room ledger</strong>
        </span>
        <span className="room-count">{rooms.length} rooms</span>
      </summary>
      <div
        className="room-ledger-resizer"
        role="separator"
        aria-label="Resize room ledger"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={640}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={event => {
          event.preventDefault()
          resizingPanelRef.current = true
          document.body.classList.add('resizing-panel')
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            resizeByKeyboard('wider')
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            resizeByKeyboard('narrower')
          }
        }}
      />
      <div className="room-window room-ledger-panel" role="region" aria-label="Room ledger editor">
        <div className="room-ledger-list">
          <button className={`room-ledger-row${generalNotesSelected ? ' selected' : ''}`} type="button" onClick={() => setSelectedEntryId('general-notes')}>
            <span className="room-number">00</span>
            <span className="room-ledger-row-name">General notes</span>
            <span className="room-ledger-row-arrow">{generalNotesSelected ? '●' : '›'}</span>
          </button>
          {rooms.map(room => (
            <button className={`room-ledger-row${room.module.id === selectedEntryId ? ' selected' : ''}`} type="button" key={room.module.id} onClick={() => setSelectedEntryId(room.module.id)}>
              <span className="room-number">{String(room.number).padStart(2, '0')}</span>
              <span className="room-ledger-row-name">{drafts[room.module.id] ?? room.name}</span>
              <span className="room-ledger-row-arrow">{room.module.id === selectedEntryId ? '●' : '›'}</span>
            </button>
          ))}
        </div>
        {generalNotesSelected ? (
          <div className="room-ledger-editor">
            <div className="room-ledger-editor-kicker">ROOM 00 / GENERAL NOTES</div>
            <label className="room-editor-field">
              <span>Name</span>
              <input className="room-name-input" value="General notes" aria-label="Room 0 name" readOnly />
            </label>
            <label className="room-editor-field room-details-field">
              <span>Details</span>
            <textarea
              className="room-details-input"
              aria-label="Room 0 details"
              value={generalNotesDraft}
              placeholder="Describe what happens here, what the players notice, or what this room is for…"
              onChange={event => setGeneralNotesDraft(event.target.value)}
              onBlur={commitGeneralNotes}
            />
            </label>
            <div className="room-editor-hint">Details save to the room record when you leave the field. Use blank lines to separate formatted note blocks.</div>
          </div>
        ) : selectedRoom && (
          <div className="room-ledger-editor">
            <div className="room-ledger-editor-kicker">ROOM {String(selectedRoom.number).padStart(2, '0')} / ENCOUNTER</div>
            <label className="room-editor-field">
              <span>Name</span>
              <RoomNameInput room={selectedRoom} value={drafts[selectedRoom.module.id] ?? selectedRoom.name} onChange={value => updateDraft(selectedRoom, value)} onCommit={() => commit(selectedRoom)} />
            </label>
            <label className="room-editor-field room-details-field">
              <span>Details</span>
              <textarea
                className="room-details-input"
                aria-label={`Room ${selectedRoom.number} details`}
                value={detailsDrafts[selectedRoom.module.id] ?? selectedRoom.details}
                placeholder="Describe what happens here, what the players notice, or what this room is for…"
                onChange={event => updateDetails(selectedRoom, event.target.value)}
                onBlur={() => commitDetails(selectedRoom)}
              />
            </label>
            <div className="room-editor-hint">Details save to the room record when you leave the field.</div>
          </div>
        )}
      </div>
    </details>
  )
}
