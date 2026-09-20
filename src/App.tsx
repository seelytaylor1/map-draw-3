import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { DARKNESS, DARKNESS_COLOR, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_TILES_PER_INCH, ENVIRONMENTAL_DEFAULTS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, getExportTilePixels, GRASS, LAVA, LAVA_COLOR, MOSSY_STONE, MUD, ROAD, RUBBLE, SAND, SNOW, STONE, TILE_PX, TILES_PER_INCH_OPTIONS, normalizeTilesPerInch, WALL, WATER, WATER_COLOR, type TileState } from './constants'
import { isoUnproject, isoProject, isoFloorPoints } from './iso'
import { buildIsoScene } from './isoScene'
import { deriveFaceColors } from './faceColors'
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles, getGrid, setGrid } from './grid'
import { createHistory, push, redo, undo, type History } from './history'
import { serialize, deserialize } from './serialization'
import {
  addStamp, colorStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
import { addStepRun, moveStepRun, removeStepRun, rotateStepRun, toggleStepRunAscending, type StepRun } from './steps'
import { addRampRun, moveRampRun, removeRampRun, rotateRampRun, toggleRampRunAscending, type RampRun } from './ramps'
import { addLabel, removeLabel, updateLabel, type Label } from './labels'
import { drawShadow } from './patterns'
import { useStampImages } from './hooks/useStampImages'
import { buildExportShapes } from './exportShapes'
import { colorizeStampImage } from './stampColor'
import { applyTileLevelNoise, type TileFlip } from './noise'
import { StampPicker, type Mode } from './StampPicker'
import {
  drawingReducer, INITIAL_DRAWING_STATE,
  type DrawingState, type BrushShape, type Tile,
} from './drawingState'
import { buildTileScene, buildStampScene, buildLabelScene } from './viewportScene'
import './ui/theme.css'
import { Section, ToolButton, IconToggle, Segmented, ColorField, Btn } from './ui/controls'
import {
  IconCompass, IconLayers, IconMinus, IconPlus, IconHash, IconCube,
  IconSquareBrush, IconCircleBrush, IconFloor, IconDroplet, IconFlame, IconCave,
  IconStairs, IconRamp, IconRotate, IconMirror, IconTag, IconHatch, IconFrame,
  IconStampFloor, IconSave, IconFolder, IconImage,
} from './ui/icons'
import { isTauri, openAssetFolder, openJsonFile, saveJsonFile, saveJsonFileAs, savePngFile, setWindowTitle, onMenuEvent, onCloseRequested, confirmDialog, closeWindow, relaunch } from './tauri'
import { useUpdater } from './hooks/useUpdater'
import { UpdateNotification } from './ui/UpdateNotification'
import { ALL_LOOP_CHALLENGES, generateMissionDungeon, preflightGeneration } from './randomDungeon/missionFirst'
import { createRandomSeed } from './randomDungeon/random'
import type { ComplexityPreset, GenerationRequest, GenerationStyle, LoopPreference, MissionGenerationResult } from './randomDungeon/missionFirst'
import { formatTileCoordinate } from './coordinates'
import { MapLegend } from './MapLegend'

const GHOST_COLOR = 'rgba(255,255,100,0.45)'
const DOT_RADIUS = 2

const WALL_PRESETS = [
  { label: 'Black', color: '#000000', opacity: 1 },
  { label: 'Repro Blue', color: '#A8C8E8', opacity: 1 },
  { label: 'Transparent', color: '#000000', opacity: 0 },
]

const ENVIRONMENT_OPTIONS: { value: TileState; label: string }[] = [
  { value: GRASS,       label: 'Grass' },
  { value: ROAD,        label: 'Road' },
  { value: SAND,        label: 'Sand' },
  { value: MUD,         label: 'Mud' },
  { value: STONE,       label: 'Stone' },
  { value: MOSSY_STONE, label: 'Mossy' },
  { value: RUBBLE,      label: 'Rubble' },
  { value: SNOW,        label: 'Snow' },
]

function hexToRgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(0,0,0,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getAccessibleTextColor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff'
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset + 1, offset + 3), 16) / 255)
  const luminance = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrastWithDark = (luminance + 0.05) / 0.05
  const contrastWithLight = 1.05 / (luminance + 0.05)
  return contrastWithDark >= contrastWithLight ? '#1b1814' : '#ffffff'
}

type AppSnapshot = {
  grids: Map<number, Uint8Array>
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors: Map<number, string>
}

type StructureKind = 'step' | 'ramp'

type StructureDrag = {
  kind: StructureKind
  id: string
  startClientX: number
  startClientY: number
  nodes: Array<{ node: Konva.Node; x: number; y: number }>
}

function getAreaTiles(start: Tile, end: Tile, shape: BrushShape): Tile[] {
  if (shape === 'square') {
    return rectTiles(start.col, start.row, end.col, end.row)
  }
  const minC = Math.min(start.col, end.col)
  const maxC = Math.max(start.col, end.col)
  const minR = Math.min(start.row, end.row)
  const maxR = Math.max(start.row, end.row)
  const radius = Math.floor(Math.min(maxC - minC + 1, maxR - minR + 1) / 2)
  const centerCol = Math.round((minC + maxC) / 2)
  const centerRow = Math.round((minR + maxR) / 2)
  return circleBrushTiles(centerCol, centerRow, radius)
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  const [history, setHistory] = useState<History<AppSnapshot>>(() =>
    createHistory({ grids: new Map([[0, createGrid(DEFAULT_COLS, DEFAULT_ROWS)]]), stamps: [], steps: [], ramps: [], labels: [], environmentalColors: new Map() }),
  )
  const { grids, stamps, steps, ramps, labels, environmentalColors } = history.present
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [tilesPerInch, setTilesPerInch] = useState(DEFAULT_TILES_PER_INCH)

  const [drawingState, dispatch] = useReducer(drawingReducer, INITIAL_DRAWING_STATE)
  const drawingStateRef = useRef<DrawingState>(INITIAL_DRAWING_STATE)
  useEffect(() => { drawingStateRef.current = drawingState }, [drawingState])
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)

  const gridsRef = useRef(grids)
  useEffect(() => { gridsRef.current = grids }, [grids])

  // Derived values from DrawingState — keep render code and layer effects clean
  const brushShape: BrushShape = drawingState.tool === 'paint' ? drawingState.brushShape : 'square'
  const selectedPaintState: TileState = drawingState.tool === 'paint'
    ? (drawingState.phase === 'idle' ? drawingState.paintValue : drawingState.idlePaintValue)
    : FLOOR
  const selectedEnvironment = ENVIRONMENT_OPTIONS.find(env => env.value === selectedPaintState)
  const selectedStampId: string | null = drawingState.tool === 'stamp' ? drawingState.selectedId : null
  const selectedStepId: string | null = drawingState.tool === 'steps' ? drawingState.selectedId : null
  const selectedRampId: string | null = drawingState.tool === 'ramps' ? drawingState.selectedId : null
  const selectedLabelId: string | null = drawingState.tool === 'label' && drawingState.phase === 'idle' ? drawingState.selectedId : null
  const labelMode: 'none' | 'place' = drawingState.tool === 'label' && drawingState.phase === 'placing' ? 'place' : 'none'
  const mode: Mode = drawingState.tool === 'stamp' ? drawingState.stampType
    : drawingState.tool === 'label' ? 'paint'
    : drawingState.tool as Mode
  const roughPhase = drawingState.tool === 'rough' ? drawingState.phase : 'idle' as const
  const roughStart: Tile | null = drawingState.tool === 'rough' && drawingState.phase !== 'idle' ? drawingState.start : null
  const roughEnd: Tile | null = drawingState.tool === 'rough' && drawingState.phase !== 'idle' ? drawingState.end : null
  const roughPreview: TileFlip[] = drawingState.tool === 'rough' && drawingState.phase === 'placed2' ? drawingState.preview : []
  const areaStart: Tile | null = drawingState.tool === 'paint' && drawingState.phase === 'selecting' ? drawingState.start : null
  const areaEnd: Tile | null = drawingState.tool === 'paint' && drawingState.phase === 'selecting' ? drawingState.end : null
  const areaPhase: 'idle' | 'selecting' = drawingState.tool === 'paint' && drawingState.phase === 'selecting' ? 'selecting' : 'idle'

  const [hoverTile, setHoverTile] = useState<Tile | null>(null)
  const [hoverPointer, setHoverPointer] = useState<{ x: number; y: number } | null>(null)
  const hoverTileRef = useRef<Tile | null>(null)
  const [activeZ, setActiveZ] = useState(0)
  const activeZRef = useRef(0)
  const isPanningRef = useRef(false)
  const panLastRef = useRef({ x: 0, y: 0 })

  const activeGrid = getGrid(grids, activeZ, cols, rows)

  const [wallColor, setWallColor] = useState('#000000')
  const [wallOpacity, setWallOpacity] = useState(0)
  const [showHatching, setShowHatching] = useState(false)
  const [hatchColor, setHatchColor] = useState('#000000')
  const [showWallOutline, setShowWallOutline] = useState(true)
  const [wallOutlineColor, setWallOutlineColor] = useState('#000000')
  const [wallOutlineStyle, setWallOutlineStyle] = useState<'clean' | 'rough'>('clean')
  const [showGrid, setShowGrid] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showIso, setShowIso] = useState(false)
  const [isoFaceColor, setIsoFaceColor] = useState('#6a5040')
  const [floorColor, setFloorColor] = useState(FLOOR_COLOR)
  const [waterColor, setWaterColor] = useState(WATER_COLOR)
  const [lavaColor, setLavaColor] = useState(LAVA_COLOR)
  const [darknessColor, setDarknessColor] = useState(DARKNESS_COLOR)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [generationResult, setGenerationResult] = useState<MissionGenerationResult | null>(null)
  const [generationSeedInput, setGenerationSeedInput] = useState('')
  const generationSeedLockedRef = useRef(false)
  const [generationStyle, setGenerationStyle] = useState<GenerationStyle>('spine-shortcuts')
  const [generationComplexity, setGenerationComplexity] = useState<ComplexityPreset>('standard')
  const [generationLoopCount, setGenerationLoopCount] = useState(1)
  const [generationLoopPreference, setGenerationLoopPreference] = useState<LoopPreference>('varied')
  const [generationLoopChallenges, setGenerationLoopChallenges] = useState<Array<LoopPreference | undefined>>([undefined])
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [savedHistoryLength, setSavedHistoryLength] = useState(0)
  const isDirty = history.past.length !== savedHistoryLength
  const generationPreviewSeed = generationSeedInput.trim() === '' ? 0 : generationSeedInput
  const generationRequest: GenerationRequest = {
    style: generationStyle,
    seed: generationPreviewSeed,
    cols,
    rows,
    tilesPerInch,
    orientation: cols >= rows ? 'landscape' : 'portrait',
    complexity: generationComplexity,
    loopCount: generationLoopCount,
    loopPreference: generationLoopPreference,
    loopChallenges: generationLoopChallenges.slice(0, Math.max(0, generationLoopCount)),
  }
  const generationPreflight = preflightGeneration(generationRequest)

  const setRequestedLoopCount = (value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    setGenerationLoopCount(next)
    setGenerationLoopChallenges(previous => Array.from({ length: next }, (_, index) => previous[index]))
  }

  const documentName = currentFilePath
    ? currentFilePath.split(/[\\/]/).pop() ?? 'Untitled'
    : 'Untitled'

  useEffect(() => {
    if (!isTauri()) return
    const marker = isDirty ? '● ' : ''
    setWindowTitle(`${marker}Map Draw — ${documentName}`)
  }, [documentName, isDirty])

  const [workspaceTab, setWorkspaceTab] = useState<'draw' | 'assets' | 'generate' | 'document'>('draw')
  const [toolbarWidth, setToolbarWidth] = useState(328)
  const resizingToolbarRef = useRef(false)

  const stageRef = useRef<Konva.Stage>(null)
  const pendingFitRef = useRef(false)
  const [fitRequest, setFitRequest] = useState(0)
  const layerRef = useRef<Konva.Layer>(null)
  const stampLayerRef = useRef<Konva.Layer>(null)
  const dotLayerRef = useRef<Konva.Layer>(null)
  const labelsLayerRef = useRef<Konva.Layer>(null)
  const labelEditorRef = useRef<HTMLInputElement>(null)
  const draggedLabelRef = useRef<string | null>(null)
  const structureDragRef = useRef<StructureDrag | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stampImages = useStampImages()
  const { state: updaterState, checkForUpdate, downloadAndInstall } = useUpdater()

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      setSize({ w: window.innerWidth, h: window.innerHeight })
      setToolbarWidth(width => Math.min(width, Math.max(280, window.innerWidth - 48)))
    })
    obs.observe(document.body)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!editingLabelId) return
    // Select the existing placeholder/text so typing immediately replaces it.
    requestAnimationFrame(() => {
      labelEditorRef.current?.focus()
      labelEditorRef.current?.select()
    })
  }, [editingLabelId])

  useEffect(() => {
    if (drawingState.tool !== 'label') setEditingLabelId(null)
  }, [drawingState.tool])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey && e.key === 'z') { setHistory(h => undo(h)); return }
      if (e.ctrlKey && e.key === 'y') { setHistory(h => redo(h)); return }
      const ds = drawingStateRef.current
      if (e.key === 'Delete' && ds.tool === 'stamp' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, id) }))
        dispatch({ type: 'SELECT', id: null })
        return
      }
      if ((e.key === 'r' || e.key === 'R') && ds.tool === 'stamp' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, id) }))
        return
      }
      if ((e.key === 'e' || e.key === 'E') && ds.tool === 'stamp' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, id) }))
        return
      }
      if (e.key === 'Delete' && ds.tool === 'steps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, steps: removeStepRun(h.present.steps, id) }))
        dispatch({ type: 'SELECT', id: null })
        return
      }
      if ((e.key === 'r' || e.key === 'R') && ds.tool === 'steps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, steps: rotateStepRun(h.present.steps, id) }))
        return
      }
      if ((e.key === 'a' || e.key === 'A') && ds.tool === 'steps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, steps: toggleStepRunAscending(h.present.steps, id) }))
        return
      }
      if (e.key === 'Delete' && ds.tool === 'ramps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, ramps: removeRampRun(h.present.ramps, id) }))
        dispatch({ type: 'SELECT', id: null })
        return
      }
      if ((e.key === 'r' || e.key === 'R') && ds.tool === 'ramps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, ramps: rotateRampRun(h.present.ramps, id) }))
        return
      }
      if ((e.key === 'a' || e.key === 'A') && ds.tool === 'ramps' && ds.selectedId) {
        const id = ds.selectedId
        setHistory(h => push(h, { ...h.present, ramps: toggleRampRunAscending(h.present.ramps, id) }))
        return
      }
      if (e.key === 'Escape') {
        if (ds.tool === 'rough' && ds.phase === 'placed2') {
          const savedGrid = ds.baseGrid
          setHistory(h => ({ ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZRef.current, savedGrid) } }))
        }
        dispatch({ type: 'ESCAPE' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const stageToTile = (stage: Konva.Stage, clientX: number, clientY: number): Tile | null => {
    const rect = stage.container().getBoundingClientRect()
    const scale = stage.scaleX()
    const ox = stage.x()
    const oy = stage.y()
    const worldX = (clientX - rect.left - ox) / scale
    const worldY = (clientY - rect.top - oy) / scale
    const col = Math.floor(worldX / TILE_PX)
    const row = Math.floor(worldY / TILE_PX)
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null
    return { col, row }
  }

  const stageToIsoTile = (stage: Konva.Stage, clientX: number, clientY: number): Tile | null => {
    const rect = stage.container().getBoundingClientRect()
    const scale = stage.scaleX()
    const worldX = (clientX - rect.left - stage.x()) / scale
    const worldY = (clientY - rect.top - stage.y()) / scale
    const { col: fc, row: fr } = isoUnproject(worldX, worldY, TILE_PX * 2, TILE_PX)
    const col = Math.floor(fc)
    const row = Math.floor(fr)
    return (col >= 0 && row >= 0 && col < cols && row < rows) ? { col, row } : null
  }

  const beginStructureDrag = useCallback((kind: StructureKind, id: string, nodes: Konva.Node[], e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    e.evt.preventDefault()
    structureDragRef.current = {
      kind,
      id,
      startClientX: e.evt.clientX,
      startClientY: e.evt.clientY,
      nodes: nodes.map(node => ({ node, x: node.x(), y: node.y() })),
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1) {
        e.evt.preventDefault()
        isPanningRef.current = true
        panLastRef.current = { x: e.evt.clientX, y: e.evt.clientY }
        return
      }
      const ds = drawingStateRef.current
      const stage = e.target.getStage()!
      if (e.target === stage && editingLabelId) setEditingLabelId(null)

      // A right-click on empty canvas cancels structure selection instead of
      // entering the structure placement path below.
      if (e.evt.button === 2 && (ds.tool === 'steps' || ds.tool === 'ramps')) {
        dispatch({ type: 'SELECT', id: null })
        return
      }

      let tile: Tile | null
      if (showIso) {
        tile = stageToIsoTile(stage, e.evt.clientX, e.evt.clientY)
      } else {
        tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      }
      if (!tile) return

      if (ds.tool === 'rough') {
        if (ds.phase === 'idle') {
          dispatch({ type: 'ROUGH_CLICK', tile })
        } else if (ds.phase === 'placed2') {
          const { start, end, preview, baseGrid } = ds
          const minC = Math.min(start.col, end.col)
          const maxC = Math.max(start.col, end.col)
          const minR = Math.min(start.row, end.row)
          const maxR = Math.max(start.row, end.row)
          const az = activeZRef.current
          const captured = preview
          const savedBase = baseGrid
          setHistory(h => {
            const rectTileList: Tile[] = []
            for (let r = minR; r <= maxR; r++)
              for (let c = minC; c <= maxC; c++)
                rectTileList.push({ col: c, row: r })
            let next = paintTiles(savedBase, cols, rectTileList, FLOOR)
            if (captured.length > 0)
              next = paintTiles(next, cols, captured.map(f => ({ col: f.col, row: f.row })), WALL)
            const baseHistory = { ...h, present: { ...h.present, grids: setGrid(h.present.grids, az, savedBase) } }
            return push(baseHistory, { ...h.present, grids: setGrid(h.present.grids, az, next) })
          })
          dispatch({ type: 'ROUGH_COMMIT' })
        }
        return
      }

      if (ds.tool === 'label' && ds.phase === 'placing') {
        const newLabel: Label = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          text: 'New Label',
          number: undefined,
        }
        setHistory(h => push(h, { ...h.present, labels: addLabel(h.present.labels, newLabel) }))
        dispatch({ type: 'LABEL_PLACED', id: newLabel.id })
        setEditingLabelId(newLabel.id)
        return
      }

      if (ds.tool === 'steps') {
        const newRun: StepRun = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          z: activeZRef.current,
          direction: 'E',
          ascending: false,
        }
        setHistory(h => push(h, { ...h.present, steps: addStepRun(h.present.steps, newRun) }))
        dispatch({ type: 'SET_TOOL', to: { tool: 'steps', selectedId: newRun.id } })
        return
      }

      if (ds.tool === 'ramps') {
        const newRun: RampRun = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          z: activeZRef.current,
          direction: 'E',
          ascending: false,
        }
        setHistory(h => push(h, { ...h.present, ramps: addRampRun(h.present.ramps, newRun) }))
        dispatch({ type: 'SET_TOOL', to: { tool: 'ramps', selectedId: newRun.id } })
        return
      }

      if (ds.tool === 'stamp') {
        const newStamp: Stamp = {
          id: crypto.randomUUID(),
          type: ds.stampType,
          col: tile.col,
          row: tile.row,
          rotation: 0,
          z: activeZRef.current,
        }
        setHistory(h => push(h, { ...h.present, stamps: addStamp(h.present.stamps, newStamp) }))
        dispatch({ type: 'SELECT', id: newStamp.id })
        return
      }

      // Paint mode: area select start
      dispatch({ type: 'PAINT_START', tile, button: e.evt.button === 2 ? 2 : 0 })
    },
    [cols, rows, editingLabelId, showIso],
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanningRef.current) {
        const stage = e.target.getStage()!
        const dx = e.evt.clientX - panLastRef.current.x
        const dy = e.evt.clientY - panLastRef.current.y
        panLastRef.current = { x: e.evt.clientX, y: e.evt.clientY }
        stage.position({ x: stage.x() + dx, y: stage.y() + dy })
        return
      }
      const stage = e.target.getStage()!

      const structureDrag = structureDragRef.current
      if (structureDrag) {
        const scale = stage.scaleX()
        const dx = (e.evt.clientX - structureDrag.startClientX) / scale
        const dy = (e.evt.clientY - structureDrag.startClientY) / scale
        for (const item of structureDrag.nodes) {
          item.node.position({ x: item.x + dx, y: item.y + dy })
        }
        return
      }

      let tile: Tile | null
      if (showIso) {
        tile = stageToIsoTile(stage, e.evt.clientX, e.evt.clientY)
      } else {
        tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      }
      setHoverTile(tile)
      setHoverPointer({ x: e.evt.clientX, y: e.evt.clientY })
      hoverTileRef.current = tile

      const ds = drawingStateRef.current
      if (ds.tool === 'rough' && ds.phase === 'placed1' && tile) {
        dispatch({ type: 'ROUGH_UPDATE_RECT', tile })
        return
      }

      if (ds.tool === 'rough' && ds.phase === 'placed2') {
        const stageRect = stage.container().getBoundingClientRect()
        const scale = stage.scaleX()
        const ox = stage.x(); const oy = stage.y()
        const rEnd = ds.end
        const rStart = ds.start
        let endWorldX: number
        let endWorldY: number
        if (showIso) {
          const center = isoProject(rEnd.col + 0.5, rEnd.row + 0.5, TILE_PX * 2, TILE_PX)
          endWorldX = center.x
          endWorldY = center.y
        } else {
          endWorldX = rEnd.col * TILE_PX + TILE_PX / 2
          endWorldY = rEnd.row * TILE_PX + TILE_PX / 2
        }
        const endScreenX = endWorldX * scale + stageRect.left + ox
        const endScreenY = endWorldY * scale + stageRect.top + oy
        const dx = (e.evt.clientX - endScreenX) / scale
        const dy = (e.evt.clientY - endScreenY) / scale
        const distTiles = Math.sqrt(dx * dx + dy * dy) / TILE_PX
        const intensity = Math.min(1, distTiles / 10)
        const minC = Math.min(rStart.col, rEnd.col)
        const maxC = Math.max(rStart.col, rEnd.col)
        const minR = Math.min(rStart.row, rEnd.row)
        const maxR = Math.max(rStart.row, rEnd.row)
        const preview = applyTileLevelNoise({ minC, minR, maxC, maxR }, intensity, ds.seed)
        dispatch({ type: 'ROUGH_UPDATE_NOISE', preview })
        return
      }

      if (ds.tool === 'paint' && ds.phase === 'selecting' && tile) {
        dispatch({ type: 'PAINT_UPDATE', tile })
      }
    },
    [cols, rows, showIso],
  )

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = false
      return
    }

    const structureDrag = structureDragRef.current
    if (structureDrag) {
      const stage = stageRef.current
      if (stage && e.button === 0) {
        const scale = stage.scaleX()
        const dx = (e.clientX - structureDrag.startClientX) / scale
        const dy = (e.clientY - structureDrag.startClientY) / scale
        const tileDelta = showIso
          ? isoUnproject(dx, dy, TILE_PX * 2, TILE_PX)
          : { col: dx / TILE_PX, row: dy / TILE_PX }
        const colDelta = Math.round(tileDelta.col)
        const rowDelta = Math.round(tileDelta.row)

        for (const item of structureDrag.nodes) {
          item.node.position({ x: item.x, y: item.y })
        }
        structureDragRef.current = null

        if (colDelta !== 0 || rowDelta !== 0) {
          if (structureDrag.kind === 'step') {
            setHistory(h => {
              const run = h.present.steps.find(item => item.id === structureDrag.id)
              return run
                ? push(h, { ...h.present, steps: moveStepRun(h.present.steps, structureDrag.id, run.col + colDelta, run.row + rowDelta) })
                : h
            })
          } else {
            setHistory(h => {
              const run = h.present.ramps.find(item => item.id === structureDrag.id)
              return run
                ? push(h, { ...h.present, ramps: moveRampRun(h.present.ramps, structureDrag.id, run.col + colDelta, run.row + rowDelta) })
                : h
            })
          }
        }
      } else {
        for (const item of structureDrag.nodes) {
          item.node.position({ x: item.x, y: item.y })
        }
        structureDragRef.current = null
      }
      return
    }

    const ds = drawingStateRef.current

    if (ds.tool === 'rough' && ds.phase === 'placed1') {
      const start = ds.start
      const end = hoverTileRef.current ?? start
      const minC = Math.min(start.col, end.col)
      const maxC = Math.max(start.col, end.col)
      const minR = Math.min(start.row, end.row)
      const maxR = Math.max(start.row, end.row)
      const rectTileList: Tile[] = []
      for (let r = minR; r <= maxR; r++)
        for (let c = minC; c <= maxC; c++)
          rectTileList.push({ col: c, row: r })
      const seed = Math.floor(Math.random() * 2 ** 32)
      const baseGrid = getGrid(gridsRef.current, activeZRef.current, cols, rows)
      setHistory(h => {
        const next = paintTiles(baseGrid, cols, rectTileList, FLOOR)
        return { ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZRef.current, next) } }
      })
      dispatch({ type: 'ROUGH_COMMIT_RECT', end, seed, baseGrid })
      return
    }

    if (ds.tool === 'paint' && ds.phase === 'selecting') {
      const tiles = getAreaTiles(ds.start, ds.end, ds.brushShape)
      const az = activeZRef.current
      const tileValue = ds.paintValue
      setHistory(h => {
        const gridsNext = setGrid(h.present.grids, az, paintTiles(getGrid(h.present.grids, az, cols, rows), cols, tiles, tileValue))
        return push(h, { ...h.present, grids: gridsNext })
      })
      dispatch({ type: 'PAINT_COMMIT' })
    }
  }, [cols, rows, showIso])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()!
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()!
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.2, Math.min(8, oldScale * factor))
    const newPos = {
      x: pointer.x - ((pointer.x - stage.x()) / oldScale) * newScale,
      y: pointer.y - ((pointer.y - stage.y()) / oldScale) * newScale,
    }
    stage.scale({ x: newScale, y: newScale })
    stage.position(newPos)
  }, [])

  const fitView = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const pad = 60
    const availW = size.w - pad * 2
    const availH = size.h - pad * 2
    const contentW = showIso ? (cols + rows) * TILE_PX : cols * TILE_PX
    const contentH = showIso ? (cols + rows) * TILE_PX / 2 : rows * TILE_PX
    const originX = showIso ? -rows * TILE_PX : 0
    const scale = Math.min(availW / contentW, availH / contentH, 8)
    stage.scale({ x: scale, y: scale })
    stage.position({
      x: (size.w - contentW * scale) / 2 - originX * scale,
      y: (size.h - contentH * scale) / 2,
    })
  }, [cols, rows, showIso, size])

  useEffect(() => {
    if (pendingFitRef.current) { pendingFitRef.current = false; fitView() }
  }, [cols, rows, fitView, fitRequest])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === 'F') fitView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView])

  const ghostTiles: Tile[] = areaStart && areaEnd && areaPhase === 'selecting'
    ? getAreaTiles(areaStart, areaEnd, brushShape)
    : []

  // Exported layer: walls, floor tiles, optional grid overlay
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.destroyChildren()

    if (showIso) {
      // Painter-sorted scene: ordering logic lives (and is tested) in isoScene.ts
      const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
      const shapes = buildIsoScene({
        grids, steps, ramps, cols, rows, show3D, wallColor, wallOpacity, selectedStepId, selectedRampId,
        tileW: TILE_PX * 2, tileH: TILE_PX, frontFaceColor, eastFaceColor,
        floorColor,
        waterColor, lavaColor, darknessColor,
        environmentalColors: environmentalColors as Map<TileState, string>,
      })
      const structureNodes = new Map<string, { kind: StructureKind; id: string; nodes: Konva.Node[] }>()
      for (const shape of shapes) {
        const node = new Konva.Line({
          points: shape.points,
          closed: true,
          fill: shape.fill,
          opacity: shape.opacity,
          stroke: shape.stroke,
          strokeWidth: shape.strokeWidth,
        })
        if (shape.stepId) {
          const key = `step:${shape.stepId}`
          const entry = structureNodes.get(key) ?? { kind: 'step' as const, id: shape.stepId, nodes: [] }
          entry.nodes.push(node)
          structureNodes.set(key, entry)
        }
        if (shape.rampId) {
          const key = `ramp:${shape.rampId}`
          const entry = structureNodes.get(key) ?? { kind: 'ramp' as const, id: shape.rampId, nodes: [] }
          entry.nodes.push(node)
          structureNodes.set(key, entry)
        }
        layer.add(node)
      }
      for (const structure of structureNodes.values()) {
        const currentSelectedId = structure.kind === 'step' ? selectedStepId : selectedRampId
        for (const node of structure.nodes) {
          node.on('mousedown', (e) => {
            e.cancelBubble = true
            e.evt.preventDefault()
            if (e.evt.button === 2) {
              setHistory(h => push(h, structure.kind === 'step'
                ? { ...h.present, steps: removeStepRun(h.present.steps, structure.id) }
                : { ...h.present, ramps: removeRampRun(h.present.ramps, structure.id) }))
              dispatch({ type: 'SELECT', id: null })
              return
            }
            if (structure.id === currentSelectedId) {
              beginStructureDrag(structure.kind, structure.id, structure.nodes, e)
            } else {
              dispatch({ type: 'SET_TOOL', to: structure.kind === 'step'
                ? { tool: 'steps', selectedId: structure.id }
                : { tool: 'ramps', selectedId: structure.id } })
            }
          })
        }
      }
      layer.batchDraw()
      return
    }

    // Pure scene description — geometry, opacity, and grouping computed once;
    // this effect only walks the result and creates/wires Konva nodes.
    const scene = buildTileScene({
      grids, steps, ramps, cols, rows, activeZ,
      tilePx: TILE_PX, facePx: FACE_PX,
      show3D, showGrid, showHatching, showWallOutline,
      wallOutlineColor, wallOutlineStyle, wallColor, wallOpacity,
      selectedStepId, selectedRampId,
      floorColor,
      waterColor, lavaColor, darknessColor,
      environmentalColors: environmentalColors as Map<TileState, string>,
    })

    if (scene.wallBackground) {
      layer.add(new Konva.Rect({
        x: 0, y: 0,
        width: scene.canvasW, height: scene.canvasH,
        fill: scene.wallBackground.fill,
        opacity: scene.wallBackground.opacity,
      }))
    }

    for (const level of scene.levels) {
      const group = new Konva.Group({ opacity: level.opacity, listening: level.interactive })

      for (const tile of level.tiles) {
        group.add(new Konva.Rect({ x: tile.rect.x, y: tile.rect.y, width: tile.rect.w, height: tile.rect.h, fill: tile.fill }))
      }

      for (const face of level.faces) {
        group.add(new Konva.Rect({ x: face.x, y: face.y, width: face.w, height: face.h, fill: FACE_COLOR }))
      }

      // Directional cast shadow — one continuous down-right offset of the
      // wall boundary, including interior cutouts.
      if (level.drawShadow) {
        const shadowCanvas = document.createElement('canvas')
        shadowCanvas.width = cols * TILE_PX
        shadowCanvas.height = rows * TILE_PX
        drawShadow(shadowCanvas.getContext('2d')!, level.grid, cols, rows, TILE_PX)
        group.add(new Konva.Image({
          image: shadowCanvas as unknown as HTMLImageElement,
          x: 0, y: 0,
          width: cols * TILE_PX, height: rows * TILE_PX,
          listening: false,
        }))
      }

      for (const gl of level.gridLines) {
        group.add(new Konva.Rect({ x: gl.x, y: gl.y, width: gl.w, height: gl.h, stroke: 'rgba(0,0,0,0.2)', strokeWidth: 0.5 }))
      }

      // Crosshatch overlay — Konva.Line nodes so they stay crisp at any zoom
      if (level.hatchPolylines) {
        const hatchGroup = new Konva.Group({
          clipFunc: (ctx) => {
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (getTile(level.grid, cols, c, r) === WALL) {
                  ctx.rect(c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
                }
              }
            }
          },
          listening: false,
        })
        for (const polyline of level.hatchPolylines) {
          if (polyline.length < 2) continue
          hatchGroup.add(new Konva.Line({
            points: polyline.flat(),
            stroke: hatchColor,
            strokeWidth: 1,
            lineCap: 'round',
            listening: false,
          }))
        }
        group.add(hatchGroup)
      }

      // Wall outline
      if (level.outline) {
        const outlineGroup = new Konva.Group({ listening: false })
        for (const seg of level.outline.segments) {
          outlineGroup.add(new Konva.Line({
            points: seg.points,
            stroke: level.outline.color,
            strokeWidth: seg.strokeWidth,
            lineCap: 'round',
            lineJoin: 'round',
            listening: false,
          }))
        }
        group.add(outlineGroup)
      }

      // Runs draw above wall overlays so their footprint stays clear at
      // exterior entrances and remains selectable over hatch/outline strokes.
      for (const run of level.runs) {
        const runGroup = new Konva.Group()
        if (run.faceRect) {
          runGroup.add(new Konva.Rect({ x: run.faceRect.x, y: run.faceRect.y, width: run.faceRect.w, height: run.faceRect.h, fill: FACE_COLOR }))
        }
        for (const fp of run.footprint) {
          runGroup.add(new Konva.Rect({
            x: fp.x, y: fp.y, width: fp.w, height: fp.h,
            fill: floorColor, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1,
          }))
        }
        if (run.selectionRect) {
          const sel = run.selectionRect
          runGroup.add(new Konva.Rect({
            x: sel.x, y: sel.y, width: sel.w, height: sel.h,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
        if (level.interactive) {
          const isStep = run.runType === 'step'
          runGroup.on('mousedown', (e) => {
            e.cancelBubble = true
            e.evt.preventDefault()
            const currentSelectedId = isStep ? selectedStepId : selectedRampId
            if (e.evt.button === 2) {
              setHistory(h => push(h, isStep
                ? { ...h.present, steps: removeStepRun(h.present.steps, run.id) }
                : { ...h.present, ramps: removeRampRun(h.present.ramps, run.id) }))
              dispatch({ type: 'SELECT', id: null })
            } else if (run.id === currentSelectedId) {
              beginStructureDrag(isStep ? 'step' : 'ramp', run.id, [runGroup], e)
            } else {
              dispatch({ type: 'SET_TOOL', to: isStep ? { tool: 'steps', selectedId: run.id } : { tool: 'ramps', selectedId: run.id } })
            }
          })
        }
        group.add(runGroup)
      }

      layer.add(group)
    }

    layer.batchDraw()
  }, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor])

  // Stamp layer
  useEffect(() => {
    const layer = stampLayerRef.current
    if (!layer || !stampImages) return
    layer.destroyChildren()

    const items = buildStampScene({ stamps, selectedStampId, stampImages, activeZ, tilePx: TILE_PX, showIso })

    for (const item of items) {
      const stamp = stamps.find(s => s.id === item.id)!
      const imgEl = stampImages.get(stamp.type)!
      const stampImage = colorizeStampImage(imgEl, stamp.color)
      const v = item.variant

      const attachStampInteraction = (node: Konva.Node) => {
        node.on('mousedown', (e) => {
          e.cancelBubble = true
          e.evt.preventDefault()
          if (e.evt.button === 2) return
          dispatch({ type: 'SET_TOOL', to: { tool: 'stamp', stampType: stamp.type, selectedId: item.id } })
        })
      }

      if (v.kind === 'isoBillboard') {
        const imgNode = new Konva.Image({
          image: stampImage,
          x: v.x, y: v.y,
          width: v.w, height: v.h,
          offsetX: v.w / 2, offsetY: v.h / 2,
          rotation: v.rotation,
          scaleX: v.mirrored ? -1 : 1,
        })
        attachStampInteraction(imgNode)
        layer.add(imgNode)
        if (item.selectionRect) {
          const sel = item.selectionRect
          layer.add(new Konva.Rect({
            x: v.x, y: v.y,
            width: sel.w, height: sel.h,
            offsetX: sel.w / 2, offsetY: sel.h / 2,
            rotation: v.rotation,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
      } else if (v.kind === 'isoFloor') {
        const group = new Konva.Group({
          x: v.x, y: v.y,
          rotation: v.rotation,
          scaleX: v.scaleX, scaleY: v.scaleY, skewX: v.skewX,
        })
        group.add(new Konva.Image({ image: stampImage, x: -v.w / 2, y: -v.h / 2, width: v.w, height: v.h }))
        attachStampInteraction(group)
        if (item.selected) {
          group.add(new Konva.Rect({
            x: -v.w / 2 - 1, y: -v.h / 2 - 1,
            width: v.w + 2, height: v.h + 2,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
        layer.add(group)
      } else {
        const node = new Konva.Image({
          image: stampImage,
          x: v.x, y: v.y,
          width: v.w, height: v.h,
          offsetX: v.w / 2, offsetY: v.h / 2,
          rotation: v.rotation,
          scaleX: v.mirrored ? -1 : 1,
          draggable: v.draggable,
          listening: v.listening,
          opacity: v.opacity,
        })
        if (item.interactive) {
          attachStampInteraction(node)
          node.on('dragend', () => {
            const sz = stampSize(stamp.type)
            const snappedCol = Math.max(0, Math.min(cols - sz.cols, Math.round((node.x() - v.w / 2) / TILE_PX)))
            const snappedRow = Math.max(0, Math.min(rows - sz.rows, Math.round((node.y() - v.h / 2) / TILE_PX)))
            setHistory(h => push(h, { ...h.present, stamps: moveStamp(h.present.stamps, item.id, snappedCol, snappedRow) }))
          })
        }
        layer.add(node)

        if (item.selectionRect) {
          const sel = item.selectionRect
          layer.add(new Konva.Rect({
            x: v.x, y: v.y,
            width: sel.w, height: sel.h,
            offsetX: sel.w / 2, offsetY: sel.h / 2,
            rotation: v.rotation,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
      }
    }

    layer.batchDraw()
  }, [stamps, selectedStampId, stampImages, cols, rows, showIso, activeZ])

  // Non-exported layer: dot pattern + ghost cursor preview
  useEffect(() => {
    const layer = dotLayerRef.current
    if (!layer) return
    layer.destroyChildren()

    {
      const isLight = isLightBackdrop(wallColor, wallOpacity)
      const sortedZsForDots = [...grids.keys()].filter(z => z <= activeZ).sort((a, b) => a - b)
      for (const z of sortedZsForDots) {
        const levelOpacity = 0.2 * Math.pow(0.5, activeZ - z)
        const dotColor = isLight
          ? `rgba(0,0,0,${levelOpacity})`
          : `rgba(255,255,255,${levelOpacity})`
        const levelGrid = grids.get(z)!
        for (let r = 0; r < rows; r += 2) {
          for (let c = 0; c < cols; c += 2) {
            if (getTile(levelGrid, cols, c, r) === WALL) {
              const dotPos = showIso
                ? isoProject(c + 0.5, r + 0.5, TILE_PX * 2, TILE_PX)
                : { x: c * TILE_PX + TILE_PX, y: r * TILE_PX + TILE_PX }
              layer.add(new Konva.Circle({
                x: dotPos.x,
                y: dotPos.y,
                radius: DOT_RADIUS,
                fill: dotColor,
              }))
            }
          }
        }
      }
    }

    const ghostFill =
      selectedPaintState === FLOOR    ? hexToRgba(floorColor,    0.45) :
      selectedPaintState === WATER    ? hexToRgba(waterColor,    0.45) :
      selectedPaintState === LAVA     ? hexToRgba(lavaColor,     0.45) :
      selectedPaintState === DARKNESS ? hexToRgba(darknessColor, 0.45) :
      GHOST_COLOR
    for (const t of ghostTiles) {
      if (t.col < 0 || t.row < 0 || t.col >= cols || t.row >= rows) continue
      if (showIso) {
        layer.add(new Konva.Line({
          points: isoFloorPoints(t.col, t.row, TILE_PX * 2, TILE_PX),
          closed: true,
          fill: ghostFill,
          stroke: undefined,
          strokeWidth: 0,
          listening: false,
        }))
      } else {
        layer.add(new Konva.Rect({
          x: t.col * TILE_PX, y: t.row * TILE_PX,
          width: TILE_PX, height: TILE_PX,
          fill: ghostFill,
        }))
      }
    }

    // Rough mode: anchor dot + ghost rect preview during placed1
    if (roughStart && roughPhase !== 'idle') {
      const dotPos = showIso
        ? isoProject(roughStart.col + 0.5, roughStart.row + 0.5, TILE_PX * 2, TILE_PX)
        : { x: roughStart.col * TILE_PX + TILE_PX / 2, y: roughStart.row * TILE_PX + TILE_PX / 2 }
      layer.add(new Konva.Circle({
        x: dotPos.x,
        y: dotPos.y,
        radius: 4,
        fill: '#ff8800',
      }))
    }
    if (roughStart && roughEnd && roughPhase === 'placed1') {
      const minC = Math.min(roughStart.col, roughEnd.col)
      const maxC = Math.max(roughStart.col, roughEnd.col)
      const minR = Math.min(roughStart.row, roughEnd.row)
      const maxR = Math.max(roughStart.row, roughEnd.row)
      if (showIso) {
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            layer.add(new Konva.Line({
              points: isoFloorPoints(c, r, TILE_PX * 2, TILE_PX),
              closed: true,
              fill: GHOST_COLOR,
              strokeWidth: 0,
              listening: false,
            }))
          }
        }
      } else {
        layer.add(new Konva.Rect({
          x: minC * TILE_PX, y: minR * TILE_PX,
          width: (maxC - minC + 1) * TILE_PX,
          height: (maxR - minR + 1) * TILE_PX,
          fill: GHOST_COLOR,
          listening: false,
        }))
      }
    }

    // Rough mode: noise preview overlay (tiles to be removed)
    for (const flip of roughPreview) {
      if (flip.col < 0 || flip.row < 0 || flip.col >= cols || flip.row >= rows) continue
      if (showIso) {
        layer.add(new Konva.Line({
          points: isoFloorPoints(flip.col, flip.row, TILE_PX * 2, TILE_PX),
          closed: true,
          fill: 'rgba(255,80,0,0.45)',
          strokeWidth: 0,
          listening: false,
        }))
      } else {
        layer.add(new Konva.Rect({
          x: flip.col * TILE_PX, y: flip.row * TILE_PX,
          width: TILE_PX, height: TILE_PX,
          fill: 'rgba(255,80,0,0.45)',
        }))
      }
    }

    layer.batchDraw()
  }, [grids, activeZ, activeGrid, ghostTiles, cols, rows, wallColor, wallOpacity, roughStart, roughEnd, roughPhase, roughPreview, showIso, selectedPaintState, floorColor, waterColor, lavaColor, darknessColor])

  // Labels layer
  useEffect(() => {
    const layer = labelsLayerRef.current
    if (!layer) return
    layer.destroyChildren()
    if (showIso) { layer.batchDraw(); return }

    const items = buildLabelScene(labels, selectedLabelId, TILE_PX)

    for (const item of items) {
      const textNode = new Konva.Text({
        x: item.x,
        y: item.y,
        width: item.width,
        text: item.text,
        fontSize: item.fontSize,
        fontFamily: 'Arial',
        fill: item.color ?? '#000',
        align: 'center',
        draggable: true,
      })
      textNode.on('mousedown', (e) => {
        e.cancelBubble = true
        const ds = drawingStateRef.current
        if (e.evt.button === 2 && ds.tool === 'label' && ds.phase === 'idle' && ds.selectedId === item.id) {
          setHistory(h => push(h, { ...h.present, labels: removeLabel(h.present.labels, item.id) }))
          dispatch({ type: 'SELECT', id: null })
          setEditingLabelId(null)
        } else if (e.evt.button === 0) {
          draggedLabelRef.current = null
          dispatch({ type: 'SET_TOOL', to: { tool: 'label', phase: 'idle', selectedId: item.id } })
        }
      })
      textNode.on('dragstart', (e) => {
        e.cancelBubble = true
        draggedLabelRef.current = item.id
        setEditingLabelId(null)
      })
      textNode.on('dragend', (e) => {
        e.cancelBubble = true
        const node = e.target as Konva.Text
        const centerX = node.x() + item.width / 2
        const centerY = node.y() + item.fontSize / 2
        const col = Math.max(0, Math.min(cols - 1, Math.floor(centerX / TILE_PX)))
        const row = Math.max(0, Math.min(rows - 1, Math.floor(centerY / TILE_PX)))
        const current = labels.find(label => label.id === item.id)
        if (!current || (current.col === col && current.row === row)) return
        setHistory(h => push(h, {
          ...h.present,
          labels: updateLabel(h.present.labels, item.id, { col, row }),
        }))
      })
      textNode.on('click', (e) => {
        e.cancelBubble = true
        if (e.evt.button !== 0) return
        if (draggedLabelRef.current === item.id) {
          draggedLabelRef.current = null
        } else {
          dispatch({ type: 'SET_TOOL', to: { tool: 'label', phase: 'idle', selectedId: item.id } })
          setEditingLabelId(item.id)
        }
      })
      layer.add(textNode)

      if (item.selectionRect) {
        const sel = item.selectionRect
        layer.add(new Konva.Rect({
          x: sel.x,
          y: sel.y,
          width: sel.w,
          height: sel.h,
          stroke: '#ffff00',
          strokeWidth: 2,
          fill: 'transparent',
          listening: false,
        }))
      }
    }

    layer.batchDraw()
  }, [cols, labels, rows, showIso, selectedLabelId])

  useEffect(() => { activeZRef.current = activeZ }, [activeZ])

  useEffect(() => { setShow3D(showIso) }, [showIso])

  const canvasDimensionStep = 1 / tilesPerInch

  const handleSquareScaleChange = (nextTilesPerInch: number) => {
    const snappedTiles = normalizeTilesPerInch(nextTilesPerInch)
    if (snappedTiles === tilesPerInch) return

    const widthInches = cols / tilesPerInch
    const heightInches = rows / tilesPerInch
    const newCols = Math.max(1, Math.round(widthInches * snappedTiles))
    const newRows = Math.max(1, Math.round(heightInches * snappedTiles))

    setHistory(h => {
      const newGrids = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        newGrids.set(z, resizeGrid(g, cols, rows, newCols, newRows))
      }
      return createHistory({ grids: newGrids, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, environmentalColors: h.present.environmentalColors })
    })
    setCols(newCols)
    setRows(newRows)
    setTilesPerInch(snappedTiles)
    pendingFitRef.current = true
    setFitRequest(value => value + 1)
  }

  const handleWidthChange = (inches: number) => {
    if (!Number.isFinite(inches)) return
    const snappedInches = Math.min(36, Math.max(1, Number((Math.round(inches / canvasDimensionStep) * canvasDimensionStep).toFixed(2))))
    if (snappedInches < 1 || snappedInches > 36) return
    const newCols = Math.round(snappedInches * tilesPerInch)
    if (newCols === cols) return
    setHistory(h => {
      const newGrids = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        newGrids.set(z, resizeGrid(g, cols, rows, newCols, rows))
      }
      return createHistory({ grids: newGrids, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, environmentalColors: h.present.environmentalColors })
    })
    setCols(newCols)
    pendingFitRef.current = true
    setFitRequest(value => value + 1)
  }

  const handleHeightChange = (inches: number) => {
    if (!Number.isFinite(inches)) return
    const snappedInches = Math.min(36, Math.max(1, Number((Math.round(inches / canvasDimensionStep) * canvasDimensionStep).toFixed(2))))
    if (snappedInches < 1 || snappedInches > 36) return
    const newRows = Math.round(snappedInches * tilesPerInch)
    if (newRows === rows) return
    setHistory(h => {
      const newGrids = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        newGrids.set(z, resizeGrid(g, cols, rows, cols, newRows))
      }
      return createHistory({ grids: newGrids, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, environmentalColors: h.present.environmentalColors })
    })
    setRows(newRows)
    pendingFitRef.current = true
    setFitRequest(value => value + 1)
  }

  const stepCanvasDimension = (dimension: 'width' | 'height', delta: number) => {
    const currentInches = dimension === 'width' ? cols / tilesPerInch : rows / tilesPerInch
    const nextInches = Number((currentInches + delta).toFixed(2))
    if (dimension === 'width') handleWidthChange(nextInches)
    else handleHeightChange(nextInches)
  }

  const handleSwapDimensions = () => {
    setHistory(h => {
      const newCols = rows
      const newRows = cols
      const resized = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        resized.set(z, resizeGrid(g, cols, rows, newCols, newRows))
      }
      return createHistory({ grids: resized, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, environmentalColors: h.present.environmentalColors })
    })
    setCols(rows)
    setRows(cols)
  }

  const handleCanvasFieldKeyDown = (dimension: 'width' | 'height', event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      stepCanvasDimension(dimension, canvasDimensionStep)
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      stepCanvasDimension(dimension, -canvasDimensionStep)
    }
  }

  const handleExport = useCallback(() => {
    if (!stampImages) return

    const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
    const layout = buildExportShapes({
      grid: activeGrid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity,
      frontFaceColor, eastFaceColor,
      stamps: stamps.filter(s => s.z === activeZ),
      showHatching,
      hatchColor,
      showWallOutline,
      wallOutlineColor,
      wallOutlineStyle,
      exportTile: getExportTilePixels(tilesPerInch),
      floorColor,
      waterColor,
      lavaColor,
      darknessColor,
      environmentalColors: environmentalColors as Map<TileState, string>,
    })

    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;'
    document.body.appendChild(container)

    const offStage = new Konva.Stage({ container, width: layout.canvasW, height: layout.canvasH })
    const offLayer = new Konva.Layer()
    if (layout.offsetX !== 0) offLayer.x(layout.offsetX)
    offStage.add(offLayer)

    for (const shape of layout.shapes) {
      if (shape.kind === 'rect') {
        offLayer.add(new Konva.Rect({
          x: shape.x, y: shape.y, width: shape.w, height: shape.h,
          fill: shape.fill, opacity: shape.opacity,
          stroke: shape.stroke, strokeWidth: shape.strokeWidth,
        }))
      } else if (shape.kind === 'polygon') {
        offLayer.add(new Konva.Line({
          points: shape.points, closed: true,
          fill: shape.fill, opacity: shape.opacity,
          stroke: shape.stroke, strokeWidth: shape.strokeWidth,
        }))
      } else if (shape.kind === 'canvas') {
        offLayer.add(new Konva.Image({
          image: shape.canvas as unknown as HTMLImageElement,
          x: shape.x, y: shape.y, width: shape.w, height: shape.h,
          listening: false,
        }))
      } else if (shape.kind === 'line') {
        offLayer.add(new Konva.Line({
          points: shape.points,
          stroke: shape.stroke, strokeWidth: shape.strokeWidth,
          opacity: shape.opacity, lineCap: shape.lineCap, lineJoin: shape.lineJoin,
          listening: false,
        }))
      } else if (shape.kind === 'image') {
        const imgEl = stampImages.get(shape.stampType as any)
        if (imgEl) {
          if (shape.scaleX !== undefined) {
            // iso mode: Group with no offset so skewX is applied before translate
            const group = new Konva.Group({
              x: shape.x, y: shape.y,
              rotation: shape.rotation,
              scaleX: shape.scaleX, scaleY: shape.scaleY,
              skewX: shape.skewX,
            })
            group.add(new Konva.Image({ image: colorizeStampImage(imgEl, shape.color), x: -shape.w / 2, y: -shape.h / 2, width: shape.w, height: shape.h }))
            offLayer.add(group)
          } else {
            offLayer.add(new Konva.Image({
              image: colorizeStampImage(imgEl, shape.color),
              x: shape.x, y: shape.y,
              width: shape.w, height: shape.h,
              offsetX: shape.offsetX, offsetY: shape.offsetY,
              rotation: shape.rotation,
              scaleX: shape.mirrored ? -1 : 1,
            }))
          }
        }
      }
    }

    offLayer.draw()
    offStage.toDataURL({
      mimeType: 'image/png',
      callback: async (dataUrl: string) => {
        document.body.removeChild(container)
        offStage.destroy()
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        if (isTauri()) {
          await savePngFile(`dungeon-map-${ts}.png`, dataUrl)
        } else {
          const a = document.createElement('a')
          a.download = `dungeon-map-${ts}.png`
          a.href = dataUrl
          a.click()
        }
      },
    })
  }, [activeGrid, activeZ, stamps, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, stampImages, isoFaceColor, showHatching, hatchColor, floorColor, waterColor, lavaColor, darknessColor])

  const getSerializedMap = () => {
    const mapSave = serialize({ grids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, steps, ramps, labels, environmentalColors: environmentalColors as Map<number, string> })
    return JSON.stringify(mapSave, null, 2)
  }

  const handleSave = useCallback(async () => {
    const content = getSerializedMap()
    if (isTauri()) {
      if (currentFilePath) {
        await saveJsonFile(currentFilePath, content)
        setSavedHistoryLength(history.past.length)
      } else {
        await handleSaveAs()
      }
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dungeon-map.json'
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [currentFilePath, history.past.length, grids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, steps, ramps, labels, environmentalColors])

  const handleSaveAs = useCallback(async () => {
    if (!isTauri()) return
    const content = getSerializedMap()
    const defaultName = currentFilePath
      ? currentFilePath.split(/[\\/]/).pop() ?? 'dungeon-map.json'
      : 'dungeon-map.json'
    const path = await saveJsonFileAs(defaultName, content)
    if (path) {
      setCurrentFilePath(path)
      setSavedHistoryLength(history.past.length)
    }
  }, [currentFilePath, history.past.length, grids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, steps, ramps, labels, environmentalColors])

  const handleOpen = useCallback(async () => {
    if (!isTauri()) return
    if (isDirtyRef.current) {
      const confirmed = window.confirm('You have unsaved changes. Open a new file anyway?')
      if (!confirmed) return
    }
    const result = await openJsonFile()
    if (!result) return
    applyLoad(result.content)
    setCurrentFilePath(result.path)
    setSavedHistoryLength(0)
  }, [])

  const handleOpenAssetFolder = useCallback(async () => {
    if (!isTauri()) return
    await openAssetFolder()
  }, [])

  const handleNew = useCallback(async () => {
    if (isDirtyRef.current) {
      const confirmed = window.confirm('You have unsaved changes. Start a new map anyway?')
      if (!confirmed) return
    }
    setHistory(createHistory({ grids: new Map([[0, createGrid(DEFAULT_COLS, DEFAULT_ROWS)]]), stamps: [], steps: [], ramps: [], labels: [], environmentalColors: new Map() }))
    setCols(DEFAULT_COLS)
    setRows(DEFAULT_ROWS)
    setTilesPerInch(DEFAULT_TILES_PER_INCH)
    setFloorColor(FLOOR_COLOR)
    setWaterColor(WATER_COLOR)
    setLavaColor(LAVA_COLOR)
    setDarknessColor(DARKNESS_COLOR)
    setCurrentFilePath(null)
    setSavedHistoryLength(0)
    setGenerationResult(null)
    pendingFitRef.current = true
    setFitRequest(value => value + 1)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizingToolbarRef.current) return
      setToolbarWidth(Math.min(520, Math.max(280, event.clientX - 12)))
    }
    const stopResizing = () => {
      resizingToolbarRef.current = false
      document.body.classList.remove('resizing-panel')
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      document.body.classList.remove('resizing-panel')
    }
  }, [])

  const generateRandomDungeonWithSeed = useCallback(async (seed: number) => {
    try {
      const result = generateMissionDungeon({ ...generationRequest, seed })
      setGenerationSeedInput(String(result.seed))
      setGenerationResult(result)
      if (!result.ok || !result.snapshot) {
        const failure = result.diagnostics[0]
        setLoadError(`Generation stopped: ${failure?.message ?? 'The fixed request could not be realized. Choose different inputs.'}`)
        return
      }
      const snapshot = result.snapshot
      setHistory(h => push(h, snapshot))
      setActiveZ(0)
      activeZRef.current = 0
      setHoverTile(null)
      setEditingLabelId(null)
      dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: FLOOR, brushShape } })
      setLoadError(null)
      pendingFitRef.current = true
      setFitRequest(value => value + 1)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Mission-first dungeon generation failed.')
    }
  }, [brushShape, generationRequest])

  const handleGenerateRandomDungeon = useCallback(() => {
    if (!generationSeedLockedRef.current) return generateRandomDungeonWithSeed(createRandomSeed())

    const text = generationSeedInput.trim()
    const seed = Number(text)
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      setLoadError('Dungeon seed must be an integer from 0 to 4,294,967,295.')
      return
    }
    return generateRandomDungeonWithSeed(seed)
  }, [generateRandomDungeonWithSeed, generationSeedInput])

  const handleNewSeed = useCallback(() => {
    generationSeedLockedRef.current = false
    return generateRandomDungeonWithSeed(createRandomSeed())
  }, [generateRandomDungeonWithSeed])

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  const handleNewRef = useRef(handleNew)
  const handleOpenRef = useRef(handleOpen)
  const handleSaveRef = useRef(handleSave)
  const handleSaveAsRef = useRef(handleSaveAs)
  const handleExportRef = useRef(handleExport)
  const checkForUpdateRef = useRef(checkForUpdate)

  useEffect(() => { handleNewRef.current = handleNew }, [handleNew])
  useEffect(() => { handleOpenRef.current = handleOpen }, [handleOpen])
  useEffect(() => { handleSaveRef.current = handleSave }, [handleSave])
  useEffect(() => { handleSaveAsRef.current = handleSaveAs }, [handleSaveAs])
  useEffect(() => { handleExportRef.current = handleExport }, [handleExport])
  useEffect(() => { checkForUpdateRef.current = checkForUpdate }, [checkForUpdate])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const setup = async () => {
      const listeners = await Promise.all([
        onMenuEvent('menu-new', () => handleNewRef.current()),
        onMenuEvent('menu-open', () => handleOpenRef.current()),
        onMenuEvent('menu-save', () => handleSaveRef.current()),
        onMenuEvent('menu-save-as', () => handleSaveAsRef.current()),
        onMenuEvent('menu-export-png', () => handleExportRef.current()),
        onMenuEvent('menu-check-updates', () => checkForUpdateRef.current?.()),
        onMenuEvent('menu-quit', async () => {
          if (isDirtyRef.current) {
            const yes = await confirmDialog('You have unsaved changes. Quit anyway?', 'Unsaved Changes')
            if (yes) await closeWindow()
          } else {
            await closeWindow()
          }
        }),
        onCloseRequested(async (prevent) => {
          if (isDirtyRef.current) {
            prevent()
            const yes = await confirmDialog('You have unsaved changes. Quit anyway?', 'Unsaved Changes')
            if (yes) await closeWindow()
          }
        }),
      ])
      if (cancelled) {
        listeners.forEach(fn => fn())
        return
      }
      return () => listeners.forEach(fn => fn())
    }
    const teardownPromise = setup()
    return () => {
      cancelled = true
      teardownPromise.then(fn => fn?.())
    }
  }, [])

  const applyLoad = (text: string) => {
    try {
      const save = deserialize(JSON.parse(text))
      setHistory(createHistory({ grids: save.grids, stamps: save.stamps, steps: save.steps, ramps: save.ramps, labels: save.labels, environmentalColors: save.environmentalColors }))
      setGenerationResult(null)
      setCols(save.cols)
      setRows(save.rows)
      setTilesPerInch(normalizeTilesPerInch(save.tilesPerInch))
      setWallColor(save.wallColor)
      setWallOpacity(save.wallOpacity)
      dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: FLOOR, brushShape: save.brushShape } })
      setShowGrid(save.showGrid)
      setShow3D(save.show3D)
      setIsoFaceColor(save.isoFaceColor)
      setShowHatching(save.showHatching)
      setHatchColor(save.hatchColor)
      setShowWallOutline(save.showWallOutline)
      setWallOutlineColor(save.wallOutlineColor)
      setWallOutlineStyle(save.wallOutlineStyle)
      setFloorColor(save.floorColor)
      setWaterColor(save.waterColor)
      setLavaColor(save.lavaColor)
      setDarknessColor(save.darknessColor)
      setLoadError(null)
      pendingFitRef.current = true
      setFitRequest(value => value + 1)
      setSavedHistoryLength(0)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load file')
    }
  }

  const handleFileLoad = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => applyLoad(e.target?.result as string)
    reader.readAsText(file)
  }

  const applyPreset = (preset: typeof WALL_PRESETS[number]) => {
    setWallColor(preset.color)
    setWallOpacity(preset.opacity)
  }

  const editingLabel = editingLabelId ? labels.find(label => label.id === editingLabelId) ?? null : null
  const editingItem = editingLabel && !showIso
    ? buildLabelScene([editingLabel], editingLabelId, TILE_PX)[0]
    : null
  const labelEditorStyle = editingItem && stageRef.current && containerRef.current
    ? (() => {
        const stage = stageRef.current!
        const stageRect = stage.container().getBoundingClientRect()
        const rootRect = containerRef.current!.getBoundingClientRect()
        const scale = stage.scaleX()
        return {
          position: 'absolute' as const,
          left: stageRect.left - rootRect.left + stage.x() + editingItem.x * scale,
          top: stageRect.top - rootRect.top + stage.y() + editingItem.y * scale,
          width: Math.max(80, editingItem.width * scale),
          height: Math.max(24, (editingItem.fontSize + 8) * scale),
          fontSize: Math.max(10, editingItem.fontSize * scale),
          zIndex: 5,
        }
      })()
    : undefined
  return (
    <div
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#fff' }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) handleFileLoad(file)
      }}
    >
      {/* Workspace inspector */}
      <aside className="toolbar" style={{ width: toolbarWidth, position: 'absolute', top: 12, left: 12, zIndex: 10, userSelect: 'none' }}>
        <header className="toolbar-title">
          <span className="brand-mark"><IconCompass size={16} /></span>
          <span className="brand-copy"><strong>Map Draw</strong><small>{isDirty ? 'Unsaved changes' : documentName}</small></span>
          <span className="map-size-badge">{+(cols / tilesPerInch).toFixed(2)} × {+(rows / tilesPerInch).toFixed(2)} in</span>
        </header>
        <nav className="workspace-tabs" role="tablist" aria-label="Workspace">
          {([
            ['draw', 'Draw'],
            ['assets', 'Assets'],
            ['document', 'File'],
            ['generate', 'Generate'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={workspaceTab === value}
              className={workspaceTab === value ? 'active' : ''}
              onClick={() => {
                setWorkspaceTab(value)
                if (value === 'draw' && (drawingState.tool === 'steps' || drawingState.tool === 'ramps')) {
                  dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape } })
                }
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="toolbar-content">
        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'draw'}>
          <div className="panel-intro"><strong>Shape the map</strong><span>Choose a surface, then drag on the canvas. Right-click erases tiles, deletes structures, deselects on blank space, or does nothing on stamps.</span></div>

        <Section title="Draw" icon={<IconFloor size={14} />} defaultOpen>
          <Segmented
            value={drawingState.tool === 'rough' ? 'cave' : brushShape}
            onChange={(s: BrushShape | 'cave') => {
              if (s === 'cave') {
                const ds = drawingState
                if (ds.tool === 'rough') {
                  if (ds.phase === 'placed2') {
                    setHistory(h => ({ ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZ, ds.baseGrid) } }))
                  }
                  dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape } })
                } else {
                  dispatch({ type: 'SET_TOOL', to: { tool: 'rough', phase: 'idle' } })
                }
                return
              }
              dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape: s } })
            }}
            options={[
              { value: 'square' as const, label: 'Square', icon: <IconSquareBrush size={13} /> },
              { value: 'circle' as const, label: 'Circle', icon: <IconCircleBrush size={13} /> },
              { value: 'cave' as const, label: 'Cave', icon: <IconCave size={13} /> },
            ]}
          />
          <Segmented
            value={selectedPaintState === WALL ? 'erase' : 'draw'}
            onChange={(v: 'draw' | 'erase') => {
              if (v === 'erase') {
                dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: WALL, brushShape } })
              } else {
                dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState === WALL ? FLOOR : selectedPaintState, brushShape } })
              }
            }}
            options={[
              { value: 'draw' as const, label: 'Draw' },
              { value: 'erase' as const, label: 'Erase' },
            ]}
          />
          {selectedPaintState !== WALL && (
            <>
              <Segmented
                value={selectedPaintState}
                onChange={(v: TileState) => dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: v, brushShape: brushShape } })}
                tones={{ [WATER]: 'water', [LAVA]: 'lava', [DARKNESS]: 'darkness' } as Partial<Record<TileState, 'water' | 'lava' | 'darkness' | 'erase'>>}
                options={[
                  { value: FLOOR     as TileState, label: 'Floor',    icon: <IconFloor   size={13} />, style: { backgroundColor: floorColor, color: getAccessibleTextColor(floorColor) } },
                  { value: WATER     as TileState, label: 'Water',    icon: <IconDroplet size={13} />, style: { backgroundColor: waterColor, color: getAccessibleTextColor(waterColor) } },
                  { value: LAVA      as TileState, label: 'Lava',     icon: <IconFlame   size={13} />, style: { backgroundColor: lavaColor, color: getAccessibleTextColor(lavaColor) } },
                  { value: DARKNESS  as TileState, label: 'Dark',     icon: <IconCave    size={13} />, style: { backgroundColor: darknessColor, color: getAccessibleTextColor(darknessColor) } },
                ]}
              />
              {selectedPaintState === FLOOR && (
                <ColorField label="Floor color" value={floorColor} onChange={setFloorColor} onReset={() => setFloorColor(FLOOR_COLOR)} />
              )}
              {selectedPaintState === WATER && (
                <ColorField label="Water color" value={waterColor} onChange={setWaterColor} onReset={() => setWaterColor(WATER_COLOR)} />
              )}
              {selectedPaintState === LAVA && (
                <ColorField label="Lava color" value={lavaColor} onChange={setLavaColor} onReset={() => setLavaColor(LAVA_COLOR)} />
              )}
              {selectedPaintState === DARKNESS && (
                <ColorField label="Darkness color" value={darknessColor} onChange={setDarknessColor} onReset={() => setDarknessColor(DARKNESS_COLOR)} />
              )}
              <div className="environment-grid">
                {ENVIRONMENT_OPTIONS.map((env) => {
                  const color = environmentalColors.get(env.value) ?? ENVIRONMENTAL_DEFAULTS[env.value] ?? FLOOR_COLOR
                  return (
                    <ToolButton
                      key={env.value}
                      active={drawingState.tool === 'paint' && selectedPaintState === env.value}
                      label={env.label}
                      onClick={() => dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: env.value, brushShape: brushShape } })}
                      style={{ backgroundColor: color, color: getAccessibleTextColor(color) }}
                    />
                  )
                })}
              </div>
              {selectedEnvironment && (
                <ColorField
                  label={`${selectedEnvironment.label} color`}
                  value={environmentalColors.get(selectedEnvironment.value) ?? ENVIRONMENTAL_DEFAULTS[selectedEnvironment.value] ?? '#000000'}
                  onChange={(color) => {
                    setHistory(h => push(h, {
                      ...h.present,
                      environmentalColors: new Map(h.present.environmentalColors).set(selectedEnvironment.value, color),
                    }))
                  }}
                  onReset={() => {
                    setHistory(h => {
                      if (!h.present.environmentalColors.has(selectedEnvironment.value)) return h
                      const colors = new Map(h.present.environmentalColors)
                      colors.delete(selectedEnvironment.value)
                      return push(h, { ...h.present, environmentalColors: colors })
                    })
                  }}
                />
              )}
            </>
          )}
          {drawingState.tool === 'rough' && (
            <div className="hint">
              {roughPhase === 'idle' && 'Click 1: set start corner'}
              {roughPhase === 'placed1' && 'Click 2: set end corner'}
              {roughPhase === 'placed2' && 'Move to adjust edges · Click 3: commit · Esc: cancel'}
            </div>
          )}
        </Section>

        <Section title="Level & View" icon={<IconLayers size={14} />} defaultOpen>
          <div className="stepper">
            <button aria-label="Previous level" onClick={() => setActiveZ(z => z - 1)}><IconMinus size={13} /></button>
            <span className="z-value">Z{activeZ}</span>
            <button aria-label="Next level" onClick={() => setActiveZ(z => z + 1)}><IconPlus size={13} /></button>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <ToolButton icon={<IconHash size={14} />} label="Grid" active={showGrid} onClick={() => setShowGrid(v => !v)} />
            </div>
            <div style={{ flex: 1 }}>
              <ToolButton icon={<IconCube size={14} />} label="Iso" tone="iso" active={showIso} onClick={() => setShowIso(v => !v)} />
            </div>
          </div>
        </Section>

        <Section title="Structures" icon={<IconStairs size={14} />} defaultOpen>
          <ToolButton
            icon={<IconStairs size={14} />}
            label="Steps"
            active={drawingState.tool === 'steps'}
            onClick={() => {
              if (drawingState.tool === 'steps') dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape: brushShape } })
              else dispatch({ type: 'SET_TOOL', to: { tool: 'steps', selectedId: null } })
            }}
          />
          {drawingState.tool === 'steps' && (
            <div className="hint">Click: place steps descending Z{activeZ} → Z{activeZ - 1}</div>
          )}
          {selectedStepId && (() => {
            const selected = steps.find(s => s.id === selectedStepId)
            return (
              <>
                <div className="row">
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, steps: rotateStepRun(h.present.steps, selectedStepId) }))}>
                    <IconRotate size={13} /> Rotate
                  </Btn>
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, steps: toggleStepRunAscending(h.present.steps, selectedStepId) }))}>
                    {selected?.ascending ? 'Descend' : 'Ascend'}
                  </Btn>
                </div>
                <div className="hint">R: rotate · A: {selected?.ascending ? 'descend' : 'ascend'} · Del: delete · Esc: deselect</div>
              </>
            )
          })()}
          <ToolButton
            icon={<IconRamp size={14} />}
            label="Ramp"
            active={drawingState.tool === 'ramps'}
            onClick={() => {
              if (drawingState.tool === 'ramps') dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape: brushShape } })
              else dispatch({ type: 'SET_TOOL', to: { tool: 'ramps', selectedId: null } })
            }}
          />
          {drawingState.tool === 'ramps' && (
            <div className="hint">Click: place ramp descending Z{activeZ} → Z{activeZ - 1}</div>
          )}
          {selectedRampId && (() => {
            const selected = ramps.find(r => r.id === selectedRampId)
            return (
              <>
                <div className="row">
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, ramps: rotateRampRun(h.present.ramps, selectedRampId) }))}>
                    <IconRotate size={13} /> Rotate
                  </Btn>
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, ramps: toggleRampRunAscending(h.present.ramps, selectedRampId) }))}>
                    {selected?.ascending ? 'Descend' : 'Ascend'}
                  </Btn>
                </div>
                <div className="hint">R: rotate · A: {selected?.ascending ? 'descend' : 'ascend'} · Del: delete · Esc: deselect</div>
              </>
            )
          })()}
        </Section>

        </div>

        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'assets'}>
          <div className="panel-intro"><strong>Place an asset</strong><span>Search the library, select an icon, then click the map.</span></div>

        <Section title="Stamps" icon={<IconStampFloor size={14} />} defaultOpen>
          <div className="row" style={{ marginBottom: 8 }}>
            <Btn onClick={handleOpenAssetFolder} title="Open the folder with floor and object assets"><IconFolder size={13} /> Open Asset Folder</Btn>
          </div>
          <StampPicker
            mode={mode}
            onModeChange={newMode => {
              if (newMode === 'paint' || newMode === 'rough' || newMode === 'steps' || newMode === 'ramps') {
                dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape } })
              } else {
                dispatch({ type: 'SET_TOOL', to: { tool: 'stamp', stampType: newMode, selectedId: null } })
              }
            }}
          />
          {selectedStampId && (() => {
            const sel = stamps.find(s => s.id === selectedStampId)
            const currentScale = sel?.scale ?? 1
            return (
              <>
                <div className="row">
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, selectedStampId) }))}>
                    <IconRotate size={13} /> Rotate
                  </Btn>
                  <Btn onClick={() => setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, selectedStampId) }))}>
                    <IconMirror size={13} /> Mirror
                  </Btn>
                </div>
                <div className="row">
                  <ColorField
                    label="Color"
                    value={sel?.color ?? '#ffffff'}
                    onChange={color => setHistory(h => push(h, { ...h.present, stamps: colorStamp(h.present.stamps, selectedStampId, color) }))}
                  />
                  {sel?.color && (
                    <Btn onClick={() => setHistory(h => push(h, { ...h.present, stamps: colorStamp(h.present.stamps, selectedStampId, null) }))}>
                      Reset
                    </Btn>
                  )}
                </div>
                <div className="row">
                  <label className="label-dim" style={{ width: 40 }}>Scale</label>
                  <input
                    type="range" min={0.5} max={4} step={0.25} value={currentScale}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setHistory(h => push(h, { ...h.present, stamps: scaleStamp(h.present.stamps, selectedStampId, v) }))
                    }}
                  />
                  <span className="label-dim" style={{ width: 28, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{currentScale}×</span>
                </div>
                <div className="hint">R: rotate · E: mirror · Del: delete · Esc: deselect</div>
              </>
            )
          })()}
        </Section>

        </div>

        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'draw'}>

        <Section title="Labels" icon={<IconTag size={14} />} defaultOpen>
          <ToolButton
            icon={<IconTag size={14} />}
            label="Add Label"
            active={labelMode === 'place'}
            onClick={() => {
              if (labelMode === 'place') {
                dispatch({ type: 'SET_TOOL', to: { tool: 'label', phase: 'idle', selectedId: null } })
                setEditingLabelId(null)
              } else {
                setEditingLabelId(null)
                dispatch({ type: 'LABEL_START_PLACING' })
              }
            }}
          />
          {selectedLabelId && (() => {
            const label = labels.find(l => l.id === selectedLabelId)
            return label ? (
              <>
                <input
                  className="text-field"
                  type="text"
                  value={label.text}
                  style={editingLabelId === label.id ? { display: 'none' } : undefined}
                  onChange={e => setHistory(h => push(h, { ...h.present, labels: updateLabel(h.present.labels, selectedLabelId, { text: e.target.value }) }))}
                  placeholder="Label text"
                />
                <div className="row">
                  <input
                    className="text-field"
                    type="number"
                    value={label.number ?? ''}
                    onChange={e => {
                      const parsed = parseInt(e.target.value, 10)
                      const num = e.target.value === '' || isNaN(parsed) ? undefined : parsed
                      setHistory(h => push(h, { ...h.present, labels: updateLabel(h.present.labels, selectedLabelId, { number: num }) }))
                    }}
                    placeholder="Number"
                    style={{ width: 60 }}
                  />
                  <Btn variant="danger" onClick={() => {
                    setHistory(h => push(h, { ...h.present, labels: removeLabel(h.present.labels, selectedLabelId) }))
                    dispatch({ type: 'SELECT', id: null })
                    setEditingLabelId(null)
                  }}>Delete</Btn>
                </div>
              </>
            ) : null
          })()}
        </Section>

        </div>

        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'generate'}>
          <div className="panel-intro"><strong>Generate a dungeon</strong><span>Set the structure and complexity, review the fit, then replace the canvas in one step.</span></div>

          <Section title="Dungeon setup" icon={<IconCave size={14} />} defaultOpen>
            <div className="field-stack">
              <label className="field-row" htmlFor="generation-style">
                <span>Layout</span>
                <select id="generation-style" className="num-field" value={generationStyle} onChange={e => setGenerationStyle(e.target.value as GenerationStyle)} aria-label="Generation style">
                  <option value="spine-shortcuts">Critical Spine</option>
                  <option value="orbit-gates">Central Hub</option>
                  <option value="cavern-pressure">Branch-and-merge</option>
                </select>
              </label>
              <label className="field-row" htmlFor="generation-complexity">
                <span>Complexity</span>
                <select id="generation-complexity" className="num-field" value={generationComplexity} onChange={e => setGenerationComplexity(e.target.value as ComplexityPreset)} aria-label="Complexity preset">
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="dense">Dense</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Loops & challenges" icon={<IconRotate size={14} />} defaultOpen>
            <div className="field-stack">
              <label className="field-row" htmlFor="generation-loop-count">
                <span>Loops</span>
                <input id="generation-loop-count" className="num-field" type="number" min={0} max={20} value={generationLoopCount} onChange={e => setRequestedLoopCount(Number(e.target.value))} aria-label="Loop count" />
              </label>
              <label className="field-row">
                <span>Default challenge</span>
                <select className="num-field" value={generationLoopPreference} onChange={e => setGenerationLoopPreference(e.target.value as LoopPreference)} aria-label="Loop preference">
                  <option value="varied">Varied</option>
                  {ALL_LOOP_CHALLENGES.map(challenge => <option key={challenge} value={challenge}>{challenge.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())}</option>)}
                </select>
              </label>
              {generationLoopChallenges.slice(0, generationLoopCount).map((challenge, index) => (
                <label className="field-row" htmlFor={`generation-loop-challenge-${index}`} key={`loop-challenge-${index}`}>
                  <span>Loop {index + 1}</span>
                  <select id={`generation-loop-challenge-${index}`} className="num-field" value={challenge ?? generationLoopPreference} onChange={e => setGenerationLoopChallenges(previous => previous.map((current, itemIndex) => itemIndex === index ? e.target.value as LoopPreference : current))} aria-label={`Loop ${index + 1} challenge`}>
                    <option value="varied">Varied</option>
                    {ALL_LOOP_CHALLENGES.map(option => <option key={option} value={option}>{option.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Review & generate" icon={<IconCompass size={14} />} defaultOpen>
            <div className={`preflight-summary status-${generationPreflight.status}`}>
              <div><strong>{generationPreflight.status === 'fit' ? 'Ready to generate' : generationPreflight.status === 'warning' ? 'Tight fit' : 'Cannot fit'}</strong><span>{generationPreflight.estimatedRooms} room anchors · {generationPreflight.budget.requestedLoops} loop{generationPreflight.budget.requestedLoops === 1 ? '' : 's'}</span></div>
              <span className="preflight-status">{generationPreflight.status}</span>
            </div>
            <details className="generation-details">
              <summary>Capacity details</summary>
              <div>{generationPreflight.budget.missionNodes} mission nodes · {generationPreflight.budget.branches} branches · {generationPreflight.budget.challengeDensity} challenge density</div>
              <div>{generationPreflight.capacity.usableCols}×{generationPreflight.capacity.usableRows} usable cells · {generationPreflight.capacity.roomSlots} buffered room slots</div>
              <div>Derived dependencies: {generationPreflight.budget.derivedKeys} key{generationPreflight.budget.derivedKeys === 1 ? '' : 's'} · {generationPreflight.budget.derivedLocks} lock{generationPreflight.budget.derivedLocks === 1 ? '' : 's'}</div>
              {generationPreflight.diagnostics.slice(0, 3).map(diagnostic => <div key={`${diagnostic.code}-${diagnostic.message}`} className="diagnostic-line">{diagnostic.message}</div>)}
            </details>
            <label className="field-row seed-row" htmlFor="generation-seed">
              <span>Seed</span>
              <input
                id="generation-seed"
                className="text-field"
                inputMode="numeric"
                placeholder="Random on generate"
                value={generationSeedInput}
                onChange={e => {
                  generationSeedLockedRef.current = true
                  setGenerationSeedInput(e.target.value)
                }}
                aria-label="Dungeon seed"
              />
            </label>
            <div className="generation-actions">
              <button className="btn btn-primary" onClick={handleGenerateRandomDungeon} disabled={generationPreflight.status === 'impossible'}>
                <IconCave size={13} /> Generate Dungeon
              </button>
              <button className="btn" onClick={handleNewSeed}>New Seed</button>
            </div>
            {generationResult && (
              <div className={`generation-result ${generationResult.ok ? 'success' : 'failure'}`}>
                <strong>{generationResult.ok ? `Generated ${generationResult.summary.style}` : 'Generation request failed'}</strong>
                <span>Seed {generationResult.summary.seed}</span>
                <span>{generationResult.summary.mission.nodes} nodes · {generationResult.summary.mission.cycles} cycles · {generationResult.summary.space.modules} modules · {generationResult.summary.rejectedAttempts} rejected attempts</span>
                {generationResult.failedAttempts.length > 0 && (
                  <details><summary>Rejected attempts</summary>{generationResult.failedAttempts.map((attempt, index) => <div key={`${attempt.code}-${index}`}>{attempt.message}</div>)}</details>
                )}
                <details>
                  <summary>Mission &amp; space inspector</summary>
                  <div>{generationResult.summary.mission.patterns} patterns → {generationResult.summary.mission.nodes} primitive nodes</div>
                  {generationResult.summary.mission.pairings.map(pairing => <div key={pairing.keyId}>{pairing.keyId} → {pairing.lockIds.length ? pairing.lockIds.join(', ') : 'optional'}</div>)}
                  {generationResult.summary.mission.loopChallenges.map(loop => <div key={loop.cycleId}>{loop.cycleId}: {loop.challenge} · {loop.realization}</div>)}
                  <div>{generationResult.summary.space.realization}</div>
                </details>
              </div>
            )}
          </Section>
        </div>

        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'document'}>
          <div className="panel-intro"><strong>Canvas & file</strong><span>Set the printed page, save your work, or export a high-resolution PNG.</span></div>

        <Section title="Canvas size" icon={<IconImage size={14} />} defaultOpen>
          <div className="canvas-size-stack">
            <div className="row" style={{ marginTop: 4 }}>
              <Btn onClick={handleSwapDimensions}>Swap Width/Length</Btn>
            </div>

            <div className="canvas-size-row">
              <label className="label-dim" style={{ width: 46, flexShrink: 0 }}>Width</label>
              <div className="canvas-size-control">
                <button type="button" aria-label="Decrease width" onClick={() => stepCanvasDimension('width', -canvasDimensionStep)}><IconMinus size={13} /></button>
                <input
                  className="num-field canvas-size-input"
                  type="number"
                  min={1}
                  max={36}
                  step={canvasDimensionStep}
                  value={+(cols / tilesPerInch).toFixed(2)}
                  onKeyDown={e => handleCanvasFieldKeyDown('width', e)}
                  onChange={e => handleWidthChange(Number(e.target.value))}
                  aria-label="Canvas width in inches"
                />
                <button type="button" aria-label="Increase width" onClick={() => stepCanvasDimension('width', canvasDimensionStep)}><IconPlus size={13} /></button>
              </div>
              <span className="label-dim" style={{ fontSize: 10, flexShrink: 0 }}>in</span>
            </div>

            <div className="canvas-size-row">
              <label className="label-dim" style={{ width: 46, flexShrink: 0 }}>Height</label>
              <div className="canvas-size-control">
                <button type="button" aria-label="Decrease height" onClick={() => stepCanvasDimension('height', -canvasDimensionStep)}><IconMinus size={13} /></button>
                <input
                  className="num-field canvas-size-input"
                  type="number"
                  min={1}
                  max={36}
                  step={canvasDimensionStep}
                  value={+(rows / tilesPerInch).toFixed(2)}
                  onKeyDown={e => handleCanvasFieldKeyDown('height', e)}
                  onChange={e => handleHeightChange(Number(e.target.value))}
                  aria-label="Canvas height in inches"
                />
                <button type="button" aria-label="Increase height" onClick={() => stepCanvasDimension('height', canvasDimensionStep)}><IconPlus size={13} /></button>
              </div>
              <span className="label-dim" style={{ fontSize: 10, flexShrink: 0 }}>in</span>
            </div>

            <div className="canvas-size-row" style={{ marginTop: 4 }}>
              <label className="label-dim" style={{ width: 80, flexShrink: 0 }}>Square size</label>
              <div className="canvas-size-control">
                <select
                  className="num-field canvas-size-input"
                  value={tilesPerInch}
                  onChange={e => handleSquareScaleChange(Number(e.target.value))}
                  aria-label="Square scale"
                >
                  {TILES_PER_INCH_OPTIONS.map(value => (
                    <option key={value} value={value}>
                      {value === 2 ? '½ in' : value === 4 ? '¼ in' : '⅛ in'}
                    </option>
                  ))}
                </select>
              </div>
              <span className="label-dim" style={{ fontSize: 10, flexShrink: 0 }}>in</span>
            </div>

          </div>

          <div className="subsection-label">File actions</div>
          <div className="row">
            <Btn onClick={handleSave}><IconSave size={13} /> Save</Btn>
            <Btn onClick={() => fileInputRef.current?.click()}><IconFolder size={13} /> Load</Btn>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleExport}>
            <IconImage size={13} /> Export PNG
          </button>

          {loadError && (
            <div className="hint" style={{ borderLeftColor: 'var(--danger)', color: '#e08b71' }}>{loadError}</div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFileLoad(file)
              e.target.value = ''
            }}
          />
        </Section>

        <Section title="Style" icon={<IconHatch size={14} />} defaultOpen>
          <div className="row">
            <IconToggle icon={<IconHatch size={15} />} active={showHatching} onClick={() => setShowHatching(v => !v)} title="Hatching" />
            {showHatching && <ColorField label="Hatch" value={hatchColor} onChange={setHatchColor} />}
          </div>

          <div className="row">
            <IconToggle icon={<IconFrame size={15} />} active={showWallOutline} onClick={() => setShowWallOutline(v => !v)} title="Outline" />
            {showWallOutline && <ColorField label="Outline" value={wallOutlineColor} onChange={setWallOutlineColor} />}
          </div>
          {showWallOutline && (
            <Segmented
              value={wallOutlineStyle}
              onChange={setWallOutlineStyle}
              options={[
                { value: 'clean', label: 'Clean' },
                { value: 'rough', label: 'Rough' },
              ]}
            />
          )}

          <div className="row" style={{ marginTop: 4 }}>
            {WALL_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                title={p.label}
                className="btn"
                style={{
                  background: p.opacity === 0 ? 'rgba(255,255,255,0.03)' : p.color,
                  color: p.color === '#000000' ? '#fff' : '#222',
                  borderColor: wallColor === p.color && wallOpacity === p.opacity ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                  outline: p.opacity === 0 ? '1px dashed rgba(255,255,255,0.25)' : 'none',
                  outlineOffset: -1,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <ColorField label="Wall" value={wallColor} onChange={setWallColor} />
          {showIso && <ColorField label="Face" value={isoFaceColor} onChange={setIsoFaceColor} />}

          <div className="row">
            <label className="label-dim" style={{ width: 56 }}>Opacity</label>
            <input type="range" min={0} max={1} step={0.01} value={wallOpacity} onChange={e => setWallOpacity(Number(e.target.value))} />
            <span className="label-dim" style={{ width: 30, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(wallOpacity * 100)}%</span>
          </div>
        </Section>
        </div>

        <UpdateNotification
          state={updaterState}
          onInstall={downloadAndInstall}
          onRelaunch={relaunch}
        />
        </div>
        <div
          className="toolbar-resizer"
          role="separator"
          aria-label="Resize inspector"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={520}
          aria-valuenow={toolbarWidth}
          tabIndex={0}
          onPointerDown={event => {
            event.preventDefault()
            resizingToolbarRef.current = true
            document.body.classList.add('resizing-panel')
          }}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            setToolbarWidth(width => Math.min(520, Math.max(280, width + (event.key === 'ArrowRight' ? 16 : -16))))
          }}
        />
      </aside>

      <MapLegend />
      <div className="canvas-status" aria-live="polite">
        <strong>{drawingState.tool === 'paint' ? 'Paint' : drawingState.tool === 'rough' ? 'Cave' : drawingState.tool === 'stamp' ? 'Stamp' : drawingState.tool === 'steps' ? 'Steps' : drawingState.tool === 'ramps' ? 'Ramp' : 'Label'}</strong>
        <span>Z{activeZ}</span>
        <span>{showIso ? 'Isometric preview' : 'Top-down editing'}</span>
      </div>

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoverTile(null)
          setHoverPointer(null)
          hoverTileRef.current = null
        }}
        onWheel={handleWheel}
        onContextMenu={e => e.evt.preventDefault()}
        style={{ cursor: (drawingState.tool === 'paint' || drawingState.tool === 'rough') ? 'crosshair' : 'cell' }}
      >
        <Layer ref={layerRef} />
        <Layer ref={stampLayerRef} />
        <Layer ref={dotLayerRef} listening={false} />
        <Layer ref={labelsLayerRef} />
      </Stage>
      {hoverTile && hoverPointer && (
        <div
          className="coordinate-readout"
          data-testid="hover-coordinate"
          aria-hidden="true"
          style={{ left: hoverPointer.x, top: hoverPointer.y }}
        >
          {formatTileCoordinate(hoverTile)}
        </div>
      )}
      {editingLabel && labelEditorStyle && (
        <input
          ref={labelEditorRef}
          className="label-editor"
          aria-label="Edit label"
          type="text"
          value={editingLabel.text}
          style={labelEditorStyle}
          onChange={e => setHistory(h => push(h, {
            ...h.present,
            labels: updateLabel(h.present.labels, editingLabel.id, { text: e.target.value }),
          }))}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.currentTarget.blur()
            }
          }}
          onBlur={() => setEditingLabelId(null)}
        />
      )}
    </div>
  )
}

// The wall fill is painted over a white page background at `opacity`, so the
// backdrop dots must contrast against is a blend toward white as opacity drops
// (e.g. a black wall preset at 0 opacity reads as white, not black).
function isLightBackdrop(hex: string, opacity: number): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const blend = (channel: number) => channel * opacity + 255 * (1 - opacity)
  return (blend(r) * 299 + blend(g) * 587 + blend(b) * 114) / 1000 > 128
}
