import { STAMP_TYPES, OBJECT_STAMP_TYPES, type StampType, type ObjectStampType } from './stamps'
import doorUrl from './stamps/door.svg?url'
import trapUrl from './stamps/trap.svg?url'
import starUrl from './stamps/star.svg?url'
import barsUrl from './stamps/bars.svg?url'
import archwayUrl from './stamps/archway.svg?url'

export type Mode = 'paint' | 'rough' | 'steps' | StampType | ObjectStampType

const FLOOR_STAMP_URLS: Record<StampType, string> = {
  door: doorUrl,
  trap: trapUrl,
  star: starUrl,
  bars: barsUrl,
}

export const FLOOR_STAMP_LABELS: Record<StampType, string> = {
  door: 'Door',
  trap: 'Trap',
  star: 'Star',
  bars: 'Bars',
}

const OBJECT_STAMP_URLS: Record<ObjectStampType, string> = {
  archway: archwayUrl,
}

export const OBJECT_STAMP_LABELS: Record<ObjectStampType, string> = {
  archway: 'Archway',
}

interface Props {
  mode: Mode
  showIso: boolean
  onModeChange: (mode: Mode) => void
}

export function StampPicker({ mode, showIso, onModeChange }: Props) {
  const isStampMode = mode !== 'paint' && mode !== 'rough' && mode !== 'steps'
  const isFloorMode = isStampMode && (STAMP_TYPES as string[]).includes(mode)
  const isObjectMode = isStampMode && (OBJECT_STAMP_TYPES as string[]).includes(mode)

  return (
    <>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Floors</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {STAMP_TYPES.map(type => (
          <button
            key={type}
            title={FLOOR_STAMP_LABELS[type]}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
            style={{
              width: 32, height: 32, padding: 2, cursor: 'pointer',
              background: mode === type ? '#555' : 'transparent',
              border: mode === type ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img src={FLOOR_STAMP_URLS[type]} alt={FLOOR_STAMP_LABELS[type]} style={{ width: 20, height: 20, imageRendering: 'crisp-edges' }} />
          </button>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Objects</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {OBJECT_STAMP_TYPES.map(type => (
          <button
            key={type}
            title={OBJECT_STAMP_LABELS[type]}
            disabled={!showIso}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
            style={{
              width: 32, height: 32, padding: 2, cursor: showIso ? 'pointer' : 'not-allowed',
              background: mode === type ? '#555' : 'transparent',
              border: mode === type ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              opacity: showIso ? 1 : 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img src={OBJECT_STAMP_URLS[type]} alt={OBJECT_STAMP_LABELS[type]} style={{ width: 20, height: 20, imageRendering: 'crisp-edges' }} />
          </button>
        ))}
      </div>

      {isStampMode && (
        <div style={{ fontSize: 11, color: '#aaa' }}>
          Placing: {isFloorMode ? FLOOR_STAMP_LABELS[mode as StampType] : isObjectMode ? OBJECT_STAMP_LABELS[mode as ObjectStampType] : ''} — click map to place
        </div>
      )}
    </>
  )
}
