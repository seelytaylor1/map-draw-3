import type { Label } from './labels'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'

export interface RoomLedgerEntry {
  id: string
  moduleId?: string
  number: number
  name: string
  details: string
}

export interface RoomLedgerTextInput {
  entries: readonly RoomLedgerEntry[]
  generalNotes: readonly string[]
}

function roomName(module: SpatialModule, mission: Mission, labels: readonly Label[]): string {
  const generatedLabel = labels.find(label => label.id === `label-${module.id}`)
  if (generatedLabel) return generatedLabel.text
  const missionNode = module.missionNodeId ? mission.nodes.find(node => node.id === module.missionNodeId) : undefined
  return missionNode?.label ?? (module.type === 'hub' ? 'Hub' : 'Room')
}

export function buildRoomLedgerEntries(modules: readonly SpatialModule[], mission: Mission, labels: readonly Label[]): RoomLedgerEntry[] {
  return modules
    .filter(module => module.footprint.length > 0)
    .map((module, index) => {
      const generatedLabel = labels.find(label => label.id === `label-${module.id}`)
      return {
        id: module.id,
        moduleId: module.id,
        number: generatedLabel?.number ?? index + 1,
        name: roomName(module, mission, labels),
        details: generatedLabel?.details ?? '',
      }
    })
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
}

export function formatRoomLedgerText({ entries, generalNotes }: RoomLedgerTextInput): string {
  const sections = ['ROOM LEDGER', '===========', '', 'GENERAL NOTES', '-------------', generalNotes.length > 0 ? generalNotes.join('\n\n') : '(none)']

  for (const entry of [...entries].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))) {
    sections.push('', `ROOM ${String(entry.number).padStart(2, '0')} — ${entry.name}`, '-'.repeat(Math.max(12, entry.name.length + 9)), entry.details.trim() || '(no notes)')
  }

  return `${sections.join('\n')}\n`
}
