import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RoomLedgerEntry } from './roomLedgerData'

export interface RoomLedgerProps {
  entries: readonly RoomLedgerEntry[]
  generalNotes: readonly string[]
  onCommitGeneralNotes: (notes: string[]) => void
  onCommitRoomEntry: (entryId: string, changes: Partial<Pick<RoomLedgerEntry, 'number' | 'name' | 'details'>>) => void
  onAddEntry: (entry: RoomLedgerEntry) => void
  onRemoveEntry: (entryId: string) => void
}

function formatGeneralNotes(notes: readonly string[]): string {
  return notes.join('\n\n')
}

function newEntryId(): string {
  return `manual-room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function RoomLedger({ entries, generalNotes, onCommitGeneralNotes, onCommitRoomEntry, onAddEntry, onRemoveEntry }: RoomLedgerProps) {
  const rooms = useMemo(() => [...entries].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id)), [entries])
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.id, room.name])))
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.id, String(room.number)])))
  const [detailsDrafts, setDetailsDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.id, room.details])))
  const [generalNotesDraft, setGeneralNotesDraft] = useState(() => formatGeneralNotes(generalNotes))
  const [selectedEntryId, setSelectedEntryId] = useState<'general-notes' | string>('general-notes')
  const [panelWidth, setPanelWidth] = useState(430)
  const resizingPanelRef = useRef(false)

  useEffect(() => {
    setNameDrafts(Object.fromEntries(rooms.map(room => [room.id, room.name])))
    setNumberDrafts(Object.fromEntries(rooms.map(room => [room.id, String(room.number)])))
    setDetailsDrafts(Object.fromEntries(rooms.map(room => [room.id, room.details])))
    setSelectedEntryId(previous => previous === 'general-notes' || rooms.some(room => room.id === previous) ? previous : 'general-notes')
  }, [rooms])

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

  const selectedRoom = rooms.find(room => room.id === selectedEntryId)
  const generalNotesSelected = selectedEntryId === 'general-notes'

  const commitGeneralNotes = () => {
    const blocks = generalNotesDraft.includes('\n\n') ? generalNotesDraft.split(/\n[ \t]*\n/) : generalNotesDraft.split('\n')
    const notes = blocks.map(note => note.trim()).filter(Boolean)
    if (formatGeneralNotes(notes) !== formatGeneralNotes(generalNotes)) onCommitGeneralNotes(notes)
  }

  const addEntry = () => {
    const entry: RoomLedgerEntry = {
      id: newEntryId(),
      number: Math.max(0, ...rooms.map(room => room.number)) + 1,
      name: 'Room',
      details: '',
    }
    onAddEntry(entry)
    setSelectedEntryId(entry.id)
  }

  const resizeByKeyboard = (direction: 'wider' | 'narrower') => {
    setPanelWidth(width => Math.min(640, Math.max(320, width + (direction === 'wider' ? 16 : -16))))
  }

  return (
    <details className="room-ledger" aria-label="Room ledger" open style={{ '--room-ledger-width': `${panelWidth}px` } as CSSProperties}>
      <summary className="room-ledger-summary">
        <span className="room-ledger-summary-copy">
          <span className="room-ledger-summary-eyebrow">Room records</span>
          <strong>Room ledger</strong>
        </span>
        <span className="room-count">{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span>
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
          <button className="room-ledger-add" type="button" onClick={addEntry}>＋ Add room</button>
          <button className={`room-ledger-row${generalNotesSelected ? ' selected' : ''}`} type="button" onClick={() => setSelectedEntryId('general-notes')}>
            <span className="room-number">00</span>
            <span className="room-ledger-row-name">General notes</span>
            <span className="room-ledger-row-arrow">{generalNotesSelected ? '●' : '›'}</span>
          </button>
          {rooms.map(room => (
            <button className={`room-ledger-row${room.id === selectedEntryId ? ' selected' : ''}`} type="button" key={room.id} onClick={() => setSelectedEntryId(room.id)}>
              <span className="room-number">{String(room.number).padStart(2, '0')}</span>
              <span className="room-ledger-row-name">{nameDrafts[room.id] ?? room.name}</span>
              <span className="room-ledger-row-arrow">{room.id === selectedEntryId ? '●' : '›'}</span>
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
            <div className="room-editor-hint">Details save to the map with your room records. Use blank lines to separate note blocks.</div>
          </div>
        ) : selectedRoom && (
          <div className="room-ledger-editor">
            <div className="room-ledger-editor-kicker">ROOM {String(selectedRoom.number).padStart(2, '0')}</div>
            <label className="room-editor-field">
              <span>Number label</span>
              <input
                className="room-number-input"
                type="number"
                min={1}
                step={1}
                aria-label={`Number label for ${selectedRoom.name}`}
                value={numberDrafts[selectedRoom.id] ?? String(selectedRoom.number)}
                onChange={event => setNumberDrafts(previous => ({ ...previous, [selectedRoom.id]: event.target.value }))}
                onBlur={() => {
                  const value = Number(numberDrafts[selectedRoom.id])
                  if (!Number.isSafeInteger(value) || value < 1) {
                    setNumberDrafts(previous => ({ ...previous, [selectedRoom.id]: String(selectedRoom.number) }))
                    return
                  }
                  if (value !== selectedRoom.number) onCommitRoomEntry(selectedRoom.id, { number: value })
                }}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
              />
            </label>
            <label className="room-editor-field">
              <span>Name</span>
              <input
                className="room-name-input"
                value={nameDrafts[selectedRoom.id] ?? selectedRoom.name}
                aria-label={`Room ${selectedRoom.number} name`}
                onChange={event => setNameDrafts(previous => ({ ...previous, [selectedRoom.id]: event.target.value }))}
                onBlur={() => {
                  const value = (nameDrafts[selectedRoom.id] ?? selectedRoom.name).trim()
                  if (value && value !== selectedRoom.name) onCommitRoomEntry(selectedRoom.id, { name: value })
                  else if (!value) setNameDrafts(previous => ({ ...previous, [selectedRoom.id]: selectedRoom.name }))
                }}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
              />
            </label>
            <label className="room-editor-field room-details-field">
              <span>Details</span>
              <textarea
                className="room-details-input"
                aria-label={`Room ${selectedRoom.number} details`}
                value={detailsDrafts[selectedRoom.id] ?? selectedRoom.details}
                placeholder="Describe what happens here, what the players notice, or what this room is for…"
                onChange={event => setDetailsDrafts(previous => ({ ...previous, [selectedRoom.id]: event.target.value }))}
                onBlur={() => {
                  const value = detailsDrafts[selectedRoom.id] ?? selectedRoom.details
                  if (value !== selectedRoom.details) onCommitRoomEntry(selectedRoom.id, { details: value })
                }}
              />
            </label>
            <div className="room-ledger-editor-actions">
              <div className="room-editor-hint">Changes save to the map with your room records.</div>
              <button className="room-ledger-remove" type="button" onClick={() => {
                onRemoveEntry(selectedRoom.id)
                setSelectedEntryId('general-notes')
              }}>Remove room</button>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
