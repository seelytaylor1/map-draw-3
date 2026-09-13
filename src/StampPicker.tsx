import { DEFAULT_ICON_TYPES, STAMP_TYPES, OBJECT_STAMP_TYPES, STAMP_ASSET_MAP, OBJECT_ASSET_MAP, type StampType, type ObjectStampType } from './stamps'

export type Mode = 'paint' | 'rough' | 'steps' | 'ramps' | StampType | ObjectStampType

const toLabel = (type: string): string => type
  .replace(/(\d+)x(\d+)(?:_\d+)?$/, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/([A-Za-z])(\d)/g, '$1 $2')
  .replace(/(\d)([A-Za-z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .split(' ')
  .map(part => part === 'door' ? 'Door' : part === 'arch' ? 'Arch' : part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

const ICON_LABELS: Record<StampType, string> = Object.fromEntries(
  STAMP_TYPES.map(type => [type, toLabel(type)]),
) as Record<StampType, string>

const ISO_OBJECT_LABELS: Record<ObjectStampType, string> = Object.fromEntries(
  OBJECT_STAMP_TYPES.map(type => [type, toLabel(type)]),
) as Record<ObjectStampType, string>

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
      <div className="label-dim" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Icons</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {DEFAULT_ICON_TYPES.map(type => (
          <button
            key={type}
            title={ICON_LABELS[type]}
            className={`stamp-btn${mode === type ? ' active' : ''}`}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
          >
            <img src={STAMP_ASSET_MAP[type]} alt={ICON_LABELS[type]} />
          </button>
        ))}
      </div>

      <div className="label-dim" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Iso Objects</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {OBJECT_STAMP_TYPES.map(type => (
          <button
            key={type}
            title={ISO_OBJECT_LABELS[type]}
            className={`stamp-btn${mode === type ? ' active' : ''}`}
            onClick={() => onModeChange(mode === type ? 'paint' : type)}
          >
            <img src={OBJECT_ASSET_MAP[type]} alt={ISO_OBJECT_LABELS[type]} />
          </button>
        ))}
      </div>

      {isStampMode && (
        <div className="hint">
          Placing: {isFloorMode ? ICON_LABELS[mode as StampType] ?? toLabel(mode) : isObjectMode ? ISO_OBJECT_LABELS[mode as ObjectStampType] : ''} — click map to place
        </div>
      )}
    </>
  )
}
