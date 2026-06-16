import { STAMP_TYPES, OBJECT_STAMP_TYPES, type StampType, type ObjectStampType } from './stamps'
import doorUrl from './stamps/door.svg?url'
import secretDoorUrl from './stamps/secret-door.svg?url'
import trapUrl from './stamps/trap.svg?url'
import starUrl from './stamps/star.svg?url'
import barsUrl from './stamps/bars.svg?url'
import isoArchwayUrl from './iso-objects/archway.svg?url'
import isoBigpillarUrl from './iso-objects/bigpillar.svg?url'
import isoIronDoorUrl from './iso-objects/iron-door.svg?url'
import isoPassagewayArchUrl from './iso-objects/passageway-arch.svg?url'
import isoPillarUrl from './iso-objects/pillar.svg?url'
import isoPortculisUrl from './iso-objects/portculis.svg?url'
import isoRampUrl from './iso-objects/ramp.svg?url'
import isoWellUrl from './iso-objects/well.svg?url'
import isoWoodDoorUrl from './iso-objects/wood-door.svg?url'
import isoWoodDoubledoorUrl from './iso-objects/wood-doubledoor.svg?url'

export type Mode = 'paint' | 'rough' | 'steps' | 'ramps' | StampType | ObjectStampType

const FLOOR_STAMP_URLS: Record<StampType, string> = {
  door: doorUrl,
  'secret-door': secretDoorUrl,
  trap: trapUrl,
  star: starUrl,
  bars: barsUrl,
}

export const FLOOR_STAMP_LABELS: Record<StampType, string> = {
  door: 'Door',
  'secret-door': 'Secret Door',
  trap: 'Trap',
  star: 'Star',
  bars: 'Bars',
}

const OBJECT_STAMP_URLS: Record<ObjectStampType, string> = {
  archway: isoArchwayUrl,
  bigpillar: isoBigpillarUrl,
  'iron-door': isoIronDoorUrl,
  'passageway-arch': isoPassagewayArchUrl,
  pillar: isoPillarUrl,
  portculis: isoPortculisUrl,
  ramp: isoRampUrl,
  well: isoWellUrl,
  'wood-door': isoWoodDoorUrl,
  'wood-doubledoor': isoWoodDoubledoorUrl,
}

export const OBJECT_STAMP_LABELS: Record<ObjectStampType, string> = {
  archway: 'Archway',
  bigpillar: 'Big Pillar',
  'iron-door': 'Iron Door',
  'passageway-arch': 'Passageway Arch',
  pillar: 'Pillar',
  portculis: 'Portculis',
  ramp: 'Ramp',
  well: 'Well',
  'wood-door': 'Wood Door',
  'wood-doubledoor': 'Wood Double Door',
}

interface Props {
  mode: Mode
  onModeChange: (mode: Mode) => void
}

export function StampPicker({ mode, onModeChange }: Props) {
  const isStampMode = mode !== 'paint' && mode !== 'rough' && mode !== 'steps'
  const isFloorMode = isStampMode && (STAMP_TYPES as string[]).includes(mode)
  const isObjectMode = isStampMode && (OBJECT_STAMP_TYPES as string[]).includes(mode)

  return (
    <>
      <div className="label-dim" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Floors</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {STAMP_TYPES.map(type => (
          <button
            key={type}
            title={FLOOR_STAMP_LABELS[type]}
            className={`stamp-btn${mode === type ? ' active' : ''}`}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
          >
            <img src={FLOOR_STAMP_URLS[type]} alt={FLOOR_STAMP_LABELS[type]} />
          </button>
        ))}
      </div>

      <div className="label-dim" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Objects</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {OBJECT_STAMP_TYPES.map(type => (
          <button
            key={type}
            title={OBJECT_STAMP_LABELS[type]}
            className={`stamp-btn${mode === type ? ' active' : ''}`}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
          >
            <img src={OBJECT_STAMP_URLS[type]} alt={OBJECT_STAMP_LABELS[type]} />
          </button>
        ))}
      </div>

      {isStampMode && (
        <div className="hint">
          Placing: {isFloorMode ? FLOOR_STAMP_LABELS[mode as StampType] : isObjectMode ? OBJECT_STAMP_LABELS[mode as ObjectStampType] : ''} — click map to place
        </div>
      )}
    </>
  )
}
