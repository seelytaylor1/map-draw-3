import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ICON_TYPES, STAMP_TYPES, OBJECT_STAMP_TYPES, STAMP_ASSET_MAP, OBJECT_ASSET_MAP, type StampType, type ObjectStampType } from './stamps'

export type Mode = 'paint' | 'rough' | 'steps' | 'ramps' | StampType | ObjectStampType

const PAGE_SIZE = 24

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
  const isFloorMode = (STAMP_TYPES as string[]).includes(mode)
  const isObjectMode = (OBJECT_STAMP_TYPES as string[]).includes(mode)
  const isStampMode = isFloorMode || isObjectMode
  const [category, setCategory] = useState<'icons' | 'objects'>(() => isObjectMode ? 'objects' : 'icons')
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    if (isObjectMode) setCategory('objects')
    if (isFloorMode) setCategory('icons')
  }, [isFloorMode, isObjectMode])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [category, query])

  const assets = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const source = category === 'icons'
      ? DEFAULT_ICON_TYPES.map(type => ({ type, label: ICON_LABELS[type], src: STAMP_ASSET_MAP[type] }))
      : OBJECT_STAMP_TYPES.map(type => ({ type, label: ISO_OBJECT_LABELS[type], src: OBJECT_ASSET_MAP[type] }))
    return normalized
      ? source.filter(asset => asset.label.toLowerCase().includes(normalized) || asset.type.toLowerCase().includes(normalized))
      : source
  }, [category, query])

  const selectedLabel = isFloorMode
    ? ICON_LABELS[mode as StampType] ?? toLabel(mode)
    : isObjectMode ? ISO_OBJECT_LABELS[mode as ObjectStampType] : null

  return (
    <div className="asset-browser">
      <div className="asset-category-tabs" role="tablist" aria-label="Asset category">
        <button role="tab" aria-selected={category === 'icons'} className={category === 'icons' ? 'active' : ''} onClick={() => setCategory('icons')}>
          Map icons <span>{DEFAULT_ICON_TYPES.length}</span>
        </button>
        <button role="tab" aria-selected={category === 'objects'} className={category === 'objects' ? 'active' : ''} onClick={() => setCategory('objects')}>
          Objects <span>{OBJECT_STAMP_TYPES.length}</span>
        </button>
      </div>

      <label className="asset-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') setQuery('') }}
          placeholder={`Search ${category === 'icons' ? 'map icons' : 'objects'}…`}
          aria-label={`Search ${category === 'icons' ? 'map icons' : 'objects'}`}
        />
        {query && <button aria-label="Clear asset search" onClick={() => setQuery('')}>×</button>}
      </label>

      <div className="asset-results-meta">
        <span>{assets.length} {assets.length === 1 ? 'result' : 'results'}</span>
        {selectedLabel && <span className="asset-selection">Selected: {selectedLabel}</span>}
      </div>

      {assets.length > 0 ? (
        <div className="asset-grid">
          {assets.slice(0, visibleCount).map(asset => (
            <button
              key={asset.type}
              title={asset.label}
              aria-label={asset.label}
              className={`stamp-btn${mode === asset.type ? ' active' : ''}`}
              onClick={() => onModeChange(mode === asset.type ? 'paint' : asset.type)}
            >
              <img src={asset.src} alt="" />
              <span>{asset.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="asset-empty">No assets match “{query}”.</div>
      )}

      {assets.length > visibleCount && (
        <button className="asset-more" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, assets.length - visibleCount)} more
        </button>
      )}

      {isStampMode && selectedLabel && (
        <div className="hint">Click the map to place {selectedLabel}. Click the selected asset again to return to painting.</div>
      )}
    </div>
  )
}
