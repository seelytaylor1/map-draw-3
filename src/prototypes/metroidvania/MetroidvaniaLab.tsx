import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ABILITY_META,
  buildLayout,
  connectedIds,
  edgePath,
  initialPlayState,
  roomById,
  travelOptions,
  travelTo,
  VARIANT_META,
  type Edge,
  type Layout,
  type PlayState,
  type Room,
  type RoomKind,
  type Variant,
} from './metroidvania'
import './metroidvania.css'

const VARIANTS: Variant[] = ['spine', 'orbit', 'cavern']

function parseVariant(value: string | null): Variant {
  if (value === '2' || value === 'orbit') return 'orbit'
  if (value === '3' || value === 'cavern') return 'cavern'
  return 'spine'
}

function readInitialVariant() {
  return parseVariant(new URLSearchParams(window.location.search).get('variant'))
}

function writeVariant(variant: Variant) {
  const url = new URL(window.location.href)
  url.searchParams.set('prototype', 'metroidvania')
  url.searchParams.set('variant', VARIANT_META[variant].index)
  window.history.replaceState({}, '', url)
}

function newSeed() {
  return Math.floor(100000 + Math.random() * 899999)
}

function kindLabel(kind: RoomKind) {
  if (kind === 'ability') return 'ABILITY ROOM'
  if (kind === 'lock') return 'LOCK / KEY CHECK'
  if (kind === 'goal') return 'GOAL ROOM'
  if (kind === 'boss') return 'FALSE GOAL'
  if (kind === 'secret') return 'SECRET POCKET'
  if (kind === 'start') return 'STARTING ROOM'
  return 'TRAVERSAL ROOM'
}

function edgeClass(relation: Edge, layout: Layout, selectedId: string | null, hoveredId: string | null, revealed: Set<string>, trace: boolean) {
  const connected = selectedId && (relation.from === selectedId || relation.to === selectedId)
  const hovered = hoveredId && (relation.from === hoveredId || relation.to === hoveredId)
  const hidden = layout.variant === 'cavern' && (!revealed.has(relation.from) || !revealed.has(relation.to))
  return [
    `edge-${relation.kind}`,
    connected || hovered ? 'edge-focus' : '',
    trace && relation.kind !== 'path' ? 'edge-trace' : '',
    hidden ? 'edge-hidden' : '',
  ].filter(Boolean).join(' ')
}

function blobPath(room: Room) {
  const x = room.x
  const y = room.y
  const w = room.w
  const h = room.h
  return `M ${x + 2} ${y + h * 0.32} Q ${x + w * 0.1} ${y - 1} ${x + w * 0.42} ${y + 1} T ${x + w - 1} ${y + h * 0.24} Q ${x + w + 1} ${y + h * 0.5} ${x + w - 2} ${y + h * 0.77} Q ${x + w * 0.7} ${y + h + 1} ${x + w * 0.38} ${y + h - 1} T ${x + 1} ${y + h * 0.72} Q ${x - 1} ${y + h * 0.5} ${x + 2} ${y + h * 0.32} Z`
}

type MapSurfaceProps = {
  layout: Layout
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  revealed: Set<string>
  trace: boolean
  currentId?: string
  visitedIds?: Set<string>
}

function MapSurface({ layout, selectedId, hoveredId, onSelect, onHover, revealed, trace, currentId, visitedIds }: MapSurfaceProps) {
  const viewBox = layout.variant === 'orbit' ? '0 0 132 98' : layout.variant === 'cavern' ? '0 0 180 80' : '0 0 138 56'
  const focusIds = connectedIds(layout, hoveredId ?? selectedId)

  return (
    <svg className="mv-map" viewBox={viewBox} role="img" aria-label={`${layout.name} generated dungeon map`}>
      <defs>
        <pattern id={`map-grid-${layout.variant}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M 4 0 L 0 0 0 4" fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="0.18" />
        </pattern>
        <filter id="room-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect className="map-backdrop" x="0" y="0" width="180" height="98" />
      <rect className="map-grid" x="0" y="0" width="180" height="98" fill={`url(#map-grid-${layout.variant})`} />
      <g className="map-edges">
        {layout.edges.map(relation => {
          const from = roomById(layout, relation.from)!
          const to = roomById(layout, relation.to)!
          const dimmed = Boolean((hoveredId ?? selectedId) && !focusIds.has(relation.from) && !focusIds.has(relation.to))
          return (
            <g key={relation.id} className={dimmed ? 'edge-dimmed' : ''}>
              <path className={edgeClass(relation, layout, selectedId, hoveredId, revealed, trace)} d={edgePath(layout, relation)} />
              {relation.gate && (
                <g className="gate-marker" transform={`translate(${(from.x + to.x + from.w / 2 + to.w / 2) / 2} ${(from.y + to.y + from.h / 2 + to.h / 2) / 2})`}>
                  <circle r="2.2" />
                  <text y="0.8" textAnchor="middle">{ABILITY_META[relation.gate].short.slice(0, 1)}</text>
                </g>
              )}
            </g>
          )
        })}
      </g>
      <g className="map-rooms">
        {layout.rooms.map(roomItem => {
          const isHidden = layout.variant === 'cavern' && !revealed.has(roomItem.id)
          const isSelected = roomItem.id === selectedId
          const isHovered = roomItem.id === hoveredId
          const isCurrent = roomItem.id === currentId
          const isVisited = visitedIds?.has(roomItem.id)
          const roomClass = [
            `room-${roomItem.kind}`,
            isSelected ? 'room-selected' : '',
            isHovered ? 'room-hovered' : '',
            isCurrent ? 'room-current' : '',
            isVisited ? 'room-visited' : '',
            isHidden ? 'room-unexplored' : '',
          ].filter(Boolean).join(' ')
          const centerX = roomItem.x + roomItem.w / 2
          const centerY = roomItem.y + roomItem.h / 2
          return (
            <g
              key={roomItem.id}
              className={`map-room ${roomClass}`}
              onClick={() => !isHidden && onSelect(roomItem.id)}
              onMouseEnter={() => onHover(roomItem.id)}
              onMouseLeave={() => onHover(null)}
              tabIndex={isHidden ? -1 : 0}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(roomItem.id) }}
              role="button"
              aria-label={`${roomItem.label}, ${kindLabel(roomItem.kind)}`}
            >
              {layout.variant === 'cavern' ? <path className="room-shape" d={blobPath(roomItem)} /> : <rect className="room-shape" x={roomItem.x} y={roomItem.y} width={roomItem.w} height={roomItem.h} rx={layout.variant === 'orbit' ? 3 : 0.8} />}
              {isHidden && <path className="unexplored-mark" d={`M ${roomItem.x + 2} ${centerY} L ${roomItem.x + roomItem.w - 2} ${centerY} M ${centerX} ${roomItem.y + 2} L ${centerX} ${roomItem.y + roomItem.h - 2}`} />}
              {!isHidden && <>
                <text className="room-zone" x={centerX} y={roomItem.y + 2.8} textAnchor="middle">{roomItem.zone}</text>
                <text className="room-label" x={centerX} y={centerY + 1.1} textAnchor="middle">{roomItem.label}</text>
                {roomItem.ability && <circle className="ability-dot" cx={roomItem.x + roomItem.w - 2.5} cy={roomItem.y + 2.5} r="1.7" filter={isSelected ? 'url(#room-glow)' : undefined} />}
                {roomItem.gate && <text className="room-gate" x={centerX} y={roomItem.y + roomItem.h - 1.4} textAnchor="middle">{ABILITY_META[roomItem.gate].short}</text>}
                {roomItem.kind === 'goal' && <path className="goal-mark" d={`M ${centerX - 2.2} ${centerY + 2.5} L ${centerX} ${centerY - 2.4} L ${centerX + 2.2} ${centerY + 2.5} Z`} />}
                {isCurrent && <circle className="current-marker" cx={centerX} cy={roomItem.y - 2.2} r="1.55" />}
              </>}
            </g>
          )
        })}
      </g>
      <g className="map-compass" transform="translate(7 7)">
        <circle r="3.2" />
        <path d="M 0 -2.4 L 1.2 1.8 L 0 1.1 L -1.2 1.8 Z" />
        <text x="0" y="-4.6" textAnchor="middle">N</text>
      </g>
    </svg>
  )
}

function Metric({ value, label, tone = '' }: { value: string | number; label: string; tone?: string }) {
  return <div className={`mv-metric ${tone}`}><span className="mv-metric-value">{value}</span><span className="mv-metric-label">{label}</span></div>
}

function StateDot({ state }: { state: 'done' | 'next' | 'locked' }) {
  return <span className={`state-dot state-${state}`} aria-hidden="true">{state === 'done' ? '✓' : state === 'next' ? '•' : '·'}</span>
}

function RouteList({ layout, selectedRoom }: { layout: Layout; selectedRoom: Room }) {
  const selectedStep = selectedRoom.kind === 'start'
    ? 0
    : selectedRoom.kind === 'goal'
      ? layout.steps.length - 1
      : selectedRoom.kind === 'ability'
        ? Math.min(layout.steps.length - 1, layout.order.indexOf(selectedRoom.ability!) + 1)
        : Math.min(layout.steps.length - 1, Math.max(1, layout.rooms.findIndex(roomItem => roomItem.id === selectedRoom.id)))
  return (
    <div className="route-list">
      {layout.steps.map((step, index) => {
        const state = index < selectedStep ? 'done' : index === selectedStep ? 'next' : 'locked'
        return <div className="route-row" key={step}><StateDot state={state} /><span>{step}</span><span className="route-index">0{index + 1}</span></div>
      })}
    </div>
  )
}

function PlaySlice({ layout, state, onStart, onTravel, onReset }: { layout: Layout; state: PlayState | null; onStart: () => void; onTravel: (id: string) => void; onReset: () => void }) {
  if (!state) {
    return <div className="slice-panel slice-ready"><div className="slice-heading"><span>VERTICAL SLICE</span><span className="slice-status">READY</span></div><p>Play the Critical Spine route as a player: leave the Sluice, earn three abilities, use both backtrack loops, and reach the Heart.</p><button type="button" className="mv-button secondary" onClick={onStart}>Begin exploration<span>→</span></button></div>
  }
  const current = roomById(layout, state.currentRoomId)!
  const options = travelOptions(layout, state)
  return <div className={`slice-panel slice-live ${state.complete ? 'slice-complete' : ''}`}>
    <div className="slice-heading"><span>VERTICAL SLICE / LIVE</span><span className="slice-status">{state.complete ? 'COMPLETE' : `MOVE ${String(state.moves).padStart(2, '0')}`}</span></div>
    <div className="slice-current"><span className="eyebrow">CURRENT ROOM</span><strong>{current.label}</strong><span>{current.zone}</span></div>
    <div className="slice-metrics"><Metric value={state.moves} label="moves" /><Metric value={state.shortcuts} label="loops used" tone={state.shortcuts >= 2 ? 'metric-pass' : ''} /><Metric value={`${state.abilities.length}/3`} label="keys" tone={state.abilities.length === 3 ? 'metric-pass' : ''} /></div>
    {!state.complete && <div className="slice-connections"><div className="block-heading"><span>Direct connections</span><span className="block-meta">choose next room</span></div>{options.map(option => <button type="button" key={option.room.id} className={`travel-option ${option.unlocked ? '' : 'travel-locked'}`} onClick={() => onTravel(option.room.id)}><span className="travel-arrow">{option.unlocked ? '→' : '×'}</span><span className="travel-name">{option.room.label}<small>{option.relation.kind === 'shortcut' ? 'SHORTCUT' : option.relation.kind === 'secret' ? 'SECRET' : option.relation.gate ? `LOCK · ${option.relation.gate.toUpperCase()}` : 'OPEN PASSAGE'}</small></span><span className="travel-chevron">↗</span></button>)}</div>}
    {state.complete && <div className={`slice-result ${state.shortcuts >= 2 ? 'result-pass' : ''}`}>{state.shortcuts >= 2 ? 'LOOP TEST PASS · both shortcuts exercised' : 'GOAL REACHED · replay and try both shortcuts'}</div>}
    <div className="slice-log"><div className="block-heading"><span>Run log</span><span className="block-meta">last {state.log.length}</span></div>{state.log.slice().reverse().map((entry, index) => <div className={`log-entry ${index === 0 ? 'log-latest' : ''}`} key={`${entry}-${index}`}><span>{entry.split(' · ')[0]}</span><strong>{entry.split(' · ').slice(1).join(' · ')}</strong></div>)}</div>
    <button type="button" className="slice-reset" onClick={onReset}>{state.complete ? 'Play again from the Sluice' : 'Reset exploration'}</button>
  </div>
}

function Inspector({ layout, selectedRoom, playtestRan, onPlaytest, onReveal, sliceState, onStartSlice, onTravel, onResetSlice }: { layout: Layout; selectedRoom: Room; playtestRan: boolean; onPlaytest: () => void; onReveal: () => void; sliceState: PlayState | null; onStartSlice: () => void; onTravel: (id: string) => void; onResetSlice: () => void }) {
  const gates = layout.edges.filter(relation => relation.gate)
  const currentAbility = selectedRoom.ability
  const available = sliceState ? sliceState.abilities : playtestRan ? layout.order : currentAbility ? layout.order.slice(0, layout.order.indexOf(currentAbility) + 1) : []
  return (
    <aside className="mv-inspector">
      <div className="inspector-heading">
        <div><span className="eyebrow">SELECTED CHAMBER</span><h2>{selectedRoom.label}</h2></div>
        <span className={`room-kind room-kind-${selectedRoom.kind}`}>{kindLabel(selectedRoom.kind)}</span>
      </div>
      <p className="inspector-detail">{selectedRoom.detail}</p>

      <div className="room-facts">
        <div><span>Zone</span><strong>{selectedRoom.zone}</strong></div>
        <div><span>Role</span><strong>{selectedRoom.ability ? `${selectedRoom.ability} reward` : selectedRoom.gate ? `${selectedRoom.gate} gate` : 'Traversal'}</strong></div>
      </div>

      <div className="inspector-block">
        <div className="block-heading"><span>Progression route</span><span className="block-meta">{layout.order.length} abilities</span></div>
        <RouteList layout={layout} selectedRoom={selectedRoom} />
      </div>

      <div className="inspector-block">
        <div className="block-heading"><span>Gate inventory</span><span className="block-meta">{available.length}/{layout.order.length}</span></div>
        <div className="ability-list">
          {layout.order.map(ability => <div className={`ability-row ${available.includes(ability) ? 'ability-found' : ''}`} key={ability}><span className="ability-swatch" style={{ background: ABILITY_META[ability].color }} /><span>{ability}</span><span className="ability-status">{available.includes(ability) ? 'FOUND' : 'UNSEEN'}</span></div>)}
        </div>
      </div>

      <div className="inspector-actions">
        <button type="button" className="mv-button primary" onClick={onPlaytest}>{playtestRan ? 'Replay playtest' : 'Run playtest'}<span>↗</span></button>
        {layout.variant === 'cavern' && <button type="button" className="mv-button secondary" onClick={onReveal}>Reveal next pocket<span>+</span></button>}
      </div>

      <div className={`validation ${playtestRan ? 'validation-live' : ''}`}>
        <div className="validation-header"><span>Generator verdict</span><span className="validation-pulse" /></div>
        <div className="validation-line"><span className="check">{layout.metrics.reachable ? '✓' : '!'}</span><span>Goal reachable from start</span><strong>{layout.metrics.reachable ? 'PASS' : 'CHECK'}</strong></div>
        <div className="validation-line"><span className="check">{layout.metrics.loops >= 2 ? '✓' : '!'}</span><span>Backtrack loops survive</span><strong>{layout.metrics.loops}</strong></div>
        <div className="validation-line"><span className="check">{gates.length > 0 ? '✓' : '!'}</span><span>Locks have an answer</span><strong>{gates.length}</strong></div>
      </div>
      {layout.variant === 'spine' && <PlaySlice layout={layout} state={sliceState} onStart={onStartSlice} onTravel={onTravel} onReset={onResetSlice} />}
    </aside>
  )
}

export function MetroidvaniaLab() {
  const [variant, setVariant] = useState<Variant>(readInitialVariant)
  const [seed, setSeed] = useState(481902)
  const [seedInput, setSeedInput] = useState('481902')
  const [layout, setLayout] = useState<Layout>(() => buildLayout(readInitialVariant(), 481902))
  const [selectedId, setSelectedId] = useState('start')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [playtestRan, setPlaytestRan] = useState(false)
  const [revealedCount, setRevealedCount] = useState(5)
  const [sliceState, setSliceState] = useState<PlayState | null>(null)

  useEffect(() => {
    setLayout(buildLayout(variant, seed))
    setSelectedId('start')
    setHoveredId(null)
    setPlaytestRan(false)
    setSliceState(null)
    setRevealedCount(variant === 'cavern' ? 5 : Number.MAX_SAFE_INTEGER)
    writeVariant(variant)
  }, [variant, seed])

  const selectedRoom = useMemo(() => roomById(layout, selectedId) ?? layout.rooms[0]!, [layout, selectedId])
  const revealed = useMemo(() => new Set(layout.rooms.slice(0, revealedCount).map(roomItem => roomItem.id)), [layout.rooms, revealedCount])
  const meta = VARIANT_META[variant]

  const generate = () => {
    const parsed = Number.parseInt(seedInput, 10)
    const next = Number.isFinite(parsed) ? Math.abs(parsed) % 1000000 : newSeed()
    setSeedInput(String(next))
    setSeed(next)
  }

  const chooseVariant = (next: Variant) => {
    setVariant(next)
    setSeedInput(String(seed))
  }

  const revealNext = () => {
    const nextCount = Math.min(layout.rooms.length, revealedCount + 1)
    setRevealedCount(nextCount)
    const nextRoom = layout.rooms[nextCount - 1]
    if (nextRoom) setSelectedId(nextRoom.id)
  }

  const startSlice = () => {
    if (layout.variant === 'spine') {
      setSliceState(initialPlayState())
      setPlaytestRan(true)
      setSelectedId('start')
      return
    }
    setPlaytestRan(true)
    setSelectedId(layout.goalId)
  }

  const travel = (targetId: string) => {
    if (!sliceState) return
    const result = travelTo(layout, sliceState, targetId)
    setSliceState(result.state)
    if (result.ok) setSelectedId(targetId)
  }

  return (
    <div className={`mv-lab mv-${variant}`} style={{ '--variant-accent': meta.color } as CSSProperties}>
      <header className="mv-header">
        <div className="mv-brand"><span className="brand-mark">⌁</span><span>MAP DRAW</span><span className="brand-slash">/</span><span className="brand-lab">GENERATION LAB</span></div>
        <div className="mv-header-right"><span className="prototype-badge">THROWAWAY PROTOTYPE</span><a className="back-link" href="/">Back to editor</a></div>
      </header>

      <div className="mv-intro">
        <div><span className="eyebrow">METROIDVANIA / UNEXPLORED DUNGEON</span><h1>Three ways to make a dungeon<br /><em>worth coming back to.</em></h1></div>
        <p className="intro-copy">Compare generation hypotheses that understand the difference between a dead end and a promise: loops, goals, locks, and keys are part of the layout from the first roll.</p>
      </div>

      <main className="mv-main">
        <section className="mv-workspace">
          <div className="map-toolbar">
            <div><span className="eyebrow">LIVE LAYOUT</span><h2>{layout.name}</h2></div>
            <div className="layout-actions"><label className="seed-control"><span>SEED</span><input aria-label="Prototype seed" value={seedInput} onChange={event => setSeedInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') generate() }} /></label><button type="button" className="mv-button secondary" onClick={() => { const next = newSeed(); setSeedInput(String(next)); setSeed(next) }}>New seed<span>↻</span></button><button type="button" className="mv-button primary" onClick={generate}>Generate layout<span>↗</span></button></div>
          </div>
          <div className="map-stage">
            <div className="map-stage-note"><span className="live-dot" /> deterministic / seed {layout.seed}</div>
            <MapSurface layout={layout} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId} onHover={setHoveredId} revealed={revealed} trace={playtestRan} currentId={sliceState?.currentRoomId} visitedIds={sliceState ? new Set(sliceState.visitedIds) : undefined} />
            {variant === 'cavern' && <div className="fog-note">fog of war / {Math.min(revealedCount, layout.rooms.length)} of {layout.rooms.length} pockets revealed</div>}
          </div>
          <div className="map-footer">
            <div className="legend"><span><i className="legend-sample start" /> start</span><span><i className="legend-sample ability" /> ability</span><span><i className="legend-sample gate" /> gate</span><span><i className="legend-sample shortcut" /> shortcut</span><span><i className="legend-sample secret" /> secret</span></div>
            <span className="map-hint">Hover a chamber to inspect its place in the loop · click to pin</span>
          </div>
        </section>

        <Inspector layout={layout} selectedRoom={selectedRoom} playtestRan={playtestRan} onPlaytest={startSlice} onReveal={revealNext} sliceState={sliceState} onStartSlice={startSlice} onTravel={travel} onResetSlice={() => { setSliceState(initialPlayState()); setSelectedId('start') }} />
      </main>

      <footer className="mv-dock">
        <div className="dock-copy"><span className="eyebrow">COMPARE PROTOTYPES</span><span className="dock-question">Which kind of return journey feels most legible?</span></div>
        <nav className="variant-nav" aria-label="Generation prototype variants">
          {VARIANTS.map(next => { const nextMeta = VARIANT_META[next]; return <button type="button" className={`variant-tab ${variant === next ? 'active' : ''}`} key={next} onClick={() => chooseVariant(next)}><span className="variant-index" style={{ color: nextMeta.color }}>{nextMeta.index}</span><span><strong>{nextMeta.label}</strong><small>{nextMeta.strap}</small></span><span className="variant-arrow">↗</span></button> })}
        </nav>
      </footer>
    </div>
  )
}
