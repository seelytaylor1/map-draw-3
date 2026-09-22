import type { Label } from './labels'
import type { Mission, SpatialModule } from './randomDungeon/missionTypes'

export interface RoomLedgerEntry {
  module: SpatialModule
  number: number
  name: string
  details: string
}

export interface RoomLedgerTextInput {
  modules: readonly SpatialModule[]
  mission: Mission
  labels: readonly Label[]
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
        module,
        number: generatedLabel?.number ?? index + 1,
        name: roomName(module, mission, labels),
        details: generatedLabel?.details ?? '',
      }
    })
    .sort((a, b) => a.number - b.number)
}

export function formatRoomLedgerText({ modules, mission, labels, generalNotes }: RoomLedgerTextInput): string {
  const rooms = buildRoomLedgerEntries(modules, mission, labels)
  const sections = ['ROOM LEDGER', '===========', '', 'GENERAL NOTES', '-------------', generalNotes.length > 0 ? generalNotes.join('\n\n') : '(none)']

  for (const room of rooms) {
    sections.push('', `ROOM ${String(room.number).padStart(2, '0')} — ${room.name}`, '-'.repeat(Math.max(12, room.name.length + 9)), room.details.trim() || '(no notes)')
  }

  return `${sections.join('\n')}\n`
}
