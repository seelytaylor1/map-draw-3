import { useEffect, useMemo, useState } from 'react'
import type { Label } from './labels'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'

export interface RoomLedgerProps {
  modules: readonly SpatialModule[]
  mission: Mission
  labels: readonly Label[]
  generalNotes: readonly string[]
  onCommitGeneralNotes: (notes: string[]) => void
  onCommitRoomName: (moduleId: string, text: string) => void
  onCommitRoomDetails: (moduleId: string, details: string) => void
  onClose: () => void
}

interface RoomEntry {
  module: SpatialModule
  number: number
  name: string
  details: string
}

function roomName(module: SpatialModule, mission: Mission, labels: readonly Label[]): string {
  const generatedLabel = labels.find(label => label.id === `label-${module.id}`)
  if (generatedLabel) return generatedLabel.text
  const missionNode = module.missionNodeId ? mission.nodes.find(node => node.id === module.missionNodeId) : undefined
  return missionNode?.label ?? (module.type === 'hub' ? 'Hub' : 'Room')
}

function buildRooms(modules: readonly SpatialModule[], mission: Mission, labels: readonly Label[]): RoomEntry[] {
  return modules
    .filter(module => module.footprint.length > 0)
    .map((module, index) => {
      const generatedLabel = labels.find(label => label.id === `label-${module.id}`)
      return {
        module,
        number: generatedLabel?.number ?? index + 1,
        name: roomName(module, mission, labels),
        details: generatedLabel?.details ?? '',
      }
    })
    .sort((a, b) => a.number - b.number)
}

function RoomNameInput({ room, value, onChange, onCommit }: {
  room: RoomEntry
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

function WindowHeader({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <header className="room-window-header">
      <div>
        <div className="room-window-eyebrow">Room records</div>
        <h2>Room ledger</h2>
      </div>
      <div className="room-window-header-actions">
        <span className="room-count">{count} rooms</span>
        <button className="room-window-close" type="button" onClick={onClose} aria-label="Close room ledger">×</button>
      </div>
    </header>
  )
}

export function RoomLedger({ modules, mission, labels, generalNotes, onCommitGeneralNotes, onCommitRoomName, onCommitRoomDetails, onClose }: RoomLedgerProps) {
  const rooms = useMemo(() => buildRooms(modules, mission, labels), [labels, mission, modules])
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.module.id, room.name])))
  const [detailsDrafts, setDetailsDrafts] = useState<Record<string, string>>(() => Object.fromEntries(rooms.map(room => [room.module.id, room.details])))
  const [generalNotesDraft, setGeneralNotesDraft] = useState(() => generalNotes.join('\n'))
  const [selectedEntryId, setSelectedEntryId] = useState<'general-notes' | string>('general-notes')

  useEffect(() => {
    setDrafts(Object.fromEntries(rooms.map(room => [room.module.id, room.name])))
    setDetailsDrafts(Object.fromEntries(rooms.map(room => [room.module.id, room.details])))
    setSelectedEntryId(previous => previous === 'general-notes' || rooms.some(room => room.module.id === previous) ? previous : 'general-notes')
  }, [rooms.length, rooms.map(room => room.module.id).join('|')])

  useEffect(() => { setGeneralNotesDraft(generalNotes.join('\n')) }, [generalNotes])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const selectedRoom = rooms.find(room => room.module.id === selectedEntryId) ?? rooms[0]
  const generalNotesSelected = selectedEntryId === 'general-notes'
  if (!selectedRoom && !generalNotesSelected) return null

  const updateDraft = (room: RoomEntry, value: string) => {
    setDrafts(previous => ({ ...previous, [room.module.id]: value }))
  }

  const commit = (room: RoomEntry) => {
    const value = (drafts[room.module.id] ?? room.name).trim()
    if (value && value !== room.name) onCommitRoomName(room.module.id, value)
    if (!value) setDrafts(previous => ({ ...previous, [room.module.id]: room.name }))
  }

  const updateDetails = (room: RoomEntry, value: string) => {
    setDetailsDrafts(previous => ({ ...previous, [room.module.id]: value }))
  }

  const commitDetails = (room: RoomEntry) => {
    const value = detailsDrafts[room.module.id] ?? room.details
    if (value !== room.details) onCommitRoomDetails(room.module.id, value)
  }

  const commitGeneralNotes = () => {
    const notes = generalNotesDraft.split('\n').map(note => note.trim()).filter(Boolean)
    if (notes.join('\n') !== generalNotes.join('\n')) onCommitGeneralNotes(notes)
  }

  return (
    <div className="room-ledger-overlay" role="complementary" aria-label="Generated room ledger">
      <div className="room-ledger-backdrop" aria-hidden="true" />
      <div className="room-window room-ledger-panel">
        <WindowHeader count={rooms.length} onClose={onClose} />
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
            <div className="room-editor-hint">Details save to the room record when you leave the field. One note per line.</div>
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
    </div>
  )
}
