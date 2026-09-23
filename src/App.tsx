import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { DARKNESS, DARKNESS_COLOR, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_TILES_PER_INCH, ENVIRONMENTAL_DEFAULTS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, getExportTilePixels, GRASS, LAVA, LAVA_COLOR, MOSSY_STONE, MUD, ROAD, RUBBLE, SAND, SNOW, STONE, TILE_PX, TILES_PER_INCH_OPTIONS, normalizeTilesPerInch, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT, type TileState } from './constants'
import { isoUnproject, isoUnprojectAtZ, isoProjectAtZ, isoFloorPointsAtZ } from './iso'
import { buildIsoScene } from './isoScene'
import { drawIsoBatch, getIsoShapeBounds, groupIsoShapes } from './isoRender'
import { buildIsoDiagnosticGrids, normalizeIsoDiagnosticConfig, summarizeFrameTimes, type IsoDiagnosticApi, type IsoDiagnosticConfig, type IsoDiagnosticReport } from './isoDiagnostics'
import { deriveFaceColors } from './faceColors'
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles, getGrid, setGrid } from './grid'
import { createHistory, push, redo, undo, type History } from './history'
import { serialize, deserialize } from './serialization'
import {
  addStamp, colorStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampFootprintSize,
  type CustomImageAsset, type Stamp,
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
  IconStampFloor, IconSave, IconFolder, IconImage, IconTrash,
  IconInfo,
} from './ui/icons'
import { chooseSavePath, isTauri, openAssetFolder, openJsonFile, saveJsonFile, saveJsonFileAs, saveImageFile, saveTextFile, saveTextFileAs, setWindowTitle, onMenuEvent, onCloseRequested, confirmDialog, closeWindow, relaunch, writePngFile } from './tauri'
import { useUpdater } from './hooks/useUpdater'
import { UpdateNotification } from './ui/UpdateNotification'
import { ALL_LOOP_CHALLENGES, formatLoopChallenge, generateMissionDungeon, getDungeonLevelBudget, LOOP_CHALLENGE_DESCRIPTIONS, preflightGeneration } from './randomDungeon/missionFirst'
import { createRandomSeed } from './randomDungeon/random'
import type { ComplexityPreset, GenerationRequest, GenerationStyle, LoopPreference, MissionGenerationResult } from './randomDungeon/missionFirst'
import { formatTileCoordinate } from './coordinates'
import { createDefaultLayer, type MapLayer } from './layers'
import { composeLayerGrid, composeLayerTileColors, createLayerGrids, getLayerGrid, resizeLayerGrids, setLayerGrid, type LayerGrids } from './layerGrids'
import { exportCropRect, exportDimensions, normalizeExportRegion, wholeMapRegion, type ExportRegion } from './exportRegion'
import { copySelectedMapObjects, duplicateSelectedMapObjects, expandSelectionToGroups, groupSelectedMapObjects, moveSelectedMapObjects, pasteMapObjects, reorderSelectedMapObjects, rotateSelectedMapObjects, scaleSelectedStamps, selectMapObjects, ungroupSelectedMapObjects, type MapObjectClipboard, type MapObjectSelection } from './selection'
import { getShapePreviewPoints, isClosedShapePath, rasterizeShape, snapShapePoint, type ShapeDraft, type ShapePoint, type ShapeToolKind } from './shapeTools'
import { importExternalDungeon } from './dungeonImport'
import { BUILT_IN_STYLE_PRESETS, DEFAULT_TEXTURE_SETTINGS, normalizeCustomStylePresets, type StylePreset, type TextureSettings, type VisualStyle } from './styles'
import { createTextureCanvas } from './texture'
import { createLightingCanvas, DEFAULT_LIGHTING_SETTINGS, type LightingSettings, type MapLight } from './lighting'
import { MapLegend } from './MapLegend'
import { RoomLedger } from './RoomLedger'
import { applyPlayerViewSecretDoors, buildPlayerViewExport } from './playerView'
import { formatRoomLedgerText } from './roomLedgerData'
import { buildHtmlExport, buildMarkdownExport, buildUniversalVttExport, fileName, getMapExportExtension, getMapExportMimeType, siblingFilePath, type MapExportFormat } from './exportFormats'
import torchAndTileLogo from './assets/torch-and-tile-logo.png'

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

const DUNGEON_LEVEL_OPTIONS = [
  { value: 1, label: 'Levels 1-3' },
  { value: 4, label: 'Levels 4-6' },
  { value: 7, label: 'Levels 7-9' },
  { value: 10, label: 'Level 10' },
] as const

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
  activeLayerId: string
  grids: Map<number, Uint8Array>
  layerGrids: LayerGrids
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  layers: MapLayer[]
  environmentalColors: Map<number, string>
  styleFrame?: VisualStyle | null
  lights?: MapLight[]
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

  const [history, setHistory] = useState<History<AppSnapshot>>(() => {
    const grid = createGrid(DEFAULT_COLS, DEFAULT_ROWS)
    return createHistory({ activeLayerId: 'map', grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]), stamps: [], steps: [], ramps: [], labels: [], lights: [], layers: [createDefaultLayer()], environmentalColors: new Map() })
  })
  const { grids, layerGrids, stamps, steps, ramps, labels, layers, environmentalColors } = history.present
  const lights = history.present.lights ?? []
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [exportRegion, setExportRegion] = useState<ExportRegion>(() => wholeMapRegion(DEFAULT_COLS, DEFAULT_ROWS))
  const [exportPixelsPerCell, setExportPixelsPerCell] = useState(() => getExportTilePixels(DEFAULT_TILES_PER_INCH))
  const [exportFormat, setExportFormat] = useState<MapExportFormat>('png')
  const [exportError, setExportError] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const cropDragRef = useRef<{ start: Tile; end: Tile } | null>(null)
  const [cropDrag, setCropDrag] = useState<{ start: Tile; end: Tile } | null>(null)
  const [tilesPerInch, setTilesPerInch] = useState(DEFAULT_TILES_PER_INCH)

  const [drawingState, dispatch] = useReducer(drawingReducer, INITIAL_DRAWING_STATE)
  const drawingStateRef = useRef<DrawingState>(INITIAL_DRAWING_STATE)
  useEffect(() => { drawingStateRef.current = drawingState }, [drawingState])
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [objectSelection, setObjectSelection] = useState<MapObjectSelection[]>([])
  const [shapeTool, setShapeTool] = useState<ShapeToolKind | null>(null)
  const shapeSnap = 1
  const polygonSides = 6
  const pathSimplification = 0.5
  const shapeDraftRef = useRef<ShapeDraft | null>(null)
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null)

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
  const selectedObjectIds = (kind: MapObjectSelection['kind']) => objectSelection.filter(item => item.kind === kind).map(item => item.id)
  const selectedStamps = stamps.filter(stamp => selectedObjectIds('stamp').includes(stamp.id))
  const selectedStampScale = selectedStamps[0]?.scale ?? 1
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
  const [activeLayerId, setActiveLayerId] = useState(createDefaultLayer().id)
  const activeZRef = useRef(0)
  const isPanningRef = useRef(false)
  const panLastRef = useRef({ x: 0, y: 0 })

  const activeLayer = layers.find(layer => layer.id === activeLayerId) ?? layers[0]
  const activeGrid = activeLayer ? getLayerGrid(layerGrids, activeLayer, activeZ, cols, rows) : getGrid(grids, activeZ, cols, rows)
  useEffect(() => {
    const restored = layers.find(layer => layer.id === history.present.activeLayerId) ?? layers[0]
    if (!restored) return
    if (activeLayerId !== restored.id) setActiveLayerId(restored.id)
  }, [activeLayerId, history.present.activeLayerId, layers])
  const renderGrids = new Map<number, Uint8Array>()
  const renderedZs = new Set<number>([activeZ])
  for (const layer of layers) for (const z of layerGrids.get(layer.id)?.keys() ?? []) renderedZs.add(z)
  for (const z of renderedZs) renderGrids.set(z, composeLayerGrid(layers, layerGrids, z, cols, rows))
  const isLayerObjectVisible = (item: { layerId?: string; z: number }) => {
    const layer = layers.find(candidate => candidate.id === (item.layerId ?? createDefaultLayer().id))
    return layer?.visible === true
  }
  const layerOpacityFor = (item: { layerId?: string }) => (layers.find(candidate => candidate.id === (item.layerId ?? createDefaultLayer().id))?.opacity ?? 100) / 100
  const visibleStamps = stamps.filter(isLayerObjectVisible)
  const visibleSteps = steps.filter(isLayerObjectVisible)
  const visibleRamps = ramps.filter(isLayerObjectVisible)
  const visibleLabels = labels.filter(label => isLayerObjectVisible({ ...label, z: label.z ?? 0 }))
  const visibleLights = lights.filter(light => {
    const layer = layers.find(candidate => candidate.id === (light.layerId ?? createDefaultLayer().id))
    return layer?.visible === true
  })

  const withActiveLayerGrid = (snapshot: AppSnapshot, z: number, grid: Uint8Array): AppSnapshot => {
    const layerId = activeLayer?.id ?? createDefaultLayer().id
    return {
      ...snapshot,
      layerGrids: setLayerGrid(snapshot.layerGrids, layerId, z, grid),
      grids: layerId === createDefaultLayer().id ? setGrid(snapshot.grids, z, grid) : snapshot.grids,
    }
  }

  const selectObject = (selection: MapObjectSelection[]) => {
    setObjectSelection(expandSelectionToGroups({ stamps: visibleStamps, steps: visibleSteps, ramps: visibleRamps, labels: visibleLabels, activeZ, selection }))
  }

  const [wallColor, setWallColor] = useState('#000000')
  const [wallOpacity, setWallOpacity] = useState(0)
  const [showHatching, setShowHatching] = useState(false)
  const [hatchColor, setHatchColor] = useState('#000000')
  const [showWallOutline, setShowWallOutline] = useState(true)
  const [wallOutlineColor, setWallOutlineColor] = useState('#000000')
  const [wallOutlineStyle, setWallOutlineStyle] = useState<'clean' | 'rough'>('clean')
  const [showGrid, setShowGrid] = useState(false)
  const [playerView, setPlayerView] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showIso, setShowIso] = useState(false)
  const [isoFaceColor, setIsoFaceColor] = useState('#6a5040')
  const [floorColor, setFloorColor] = useState(FLOOR_COLOR)
  const [waterColor, setWaterColor] = useState(WATER_COLOR)
  const [lavaColor, setLavaColor] = useState(LAVA_COLOR)
  const [darknessColor, setDarknessColor] = useState(DARKNESS_COLOR)
  const [textureSettings, setTextureSettings] = useState<TextureSettings>({ ...DEFAULT_TEXTURE_SETTINGS })
  const [customStylePresets, setCustomStylePresets] = useState<StylePreset[]>(() => {
    try { return normalizeCustomStylePresets(JSON.parse(localStorage.getItem('torch-and-tile.style-presets.v1') ?? '[]')) }
    catch { return [] }
  })
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string | null>(null)
  const [lightingSettings, setLightingSettings] = useState<LightingSettings>({ ...DEFAULT_LIGHTING_SETTINGS })
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)
  const [lightPlacement, setLightPlacement] = useState(false)
  const [stylePresetName, setStylePresetName] = useState('My style')
  const captureVisualStyle = (): VisualStyle => ({
    wallColor, wallOpacity, floorColor, waterColor, lavaColor, darknessColor, isoFaceColor,
    showGrid, show3D, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle,
    texture: textureSettings,
  })
  const applyVisualStyle = (style: VisualStyle) => {
    setWallColor(style.wallColor); setWallOpacity(style.wallOpacity); setFloorColor(style.floorColor)
    setWaterColor(style.waterColor); setLavaColor(style.lavaColor); setDarknessColor(style.darknessColor)
    setIsoFaceColor(style.isoFaceColor); setShowGrid(style.showGrid); setShow3D(style.show3D)
    setShowHatching(style.showHatching); setHatchColor(style.hatchColor)
    setShowWallOutline(style.showWallOutline); setWallOutlineColor(style.wallOutlineColor)
    setWallOutlineStyle(style.wallOutlineStyle); setTextureSettings(style.texture)
  }
  const applyStylePreset = (preset: StylePreset) => {
    const before = captureVisualStyle()
    const after = { ...preset.style, texture: { ...preset.style.texture } }
    setHistory(h => {
      const previous = { ...h.present, styleFrame: before }
      const next = { ...h.present, styleFrame: after }
      return push({ ...h, present: previous }, next)
    })
    applyVisualStyle(after)
    setSelectedStylePresetId(preset.id)
    setStylePresetName(preset.name)
  }

  const updateLight = (id: string, update: Partial<MapLight>) => {
    setHistory(h => push(h, { ...h.present, lights: (h.present.lights ?? []).map(light => light.id === id ? { ...light, ...update } : light) }))
  }
  const selectedLight = lights.find(light => light.id === selectedLightId) ?? null
  const styleSignature = (style: VisualStyle, presets: StylePreset[], lightsState = lights, lightingState = lightingSettings) => JSON.stringify({ style, presets, lights: lightsState, lighting: lightingState })
  const currentStyleSignature = () => styleSignature(captureVisualStyle(), customStylePresets)
  const [savedStyleSignature, setSavedStyleSignature] = useState(() => currentStyleSignature())
  useEffect(() => {
    try { localStorage.setItem('torch-and-tile.style-presets.v1', JSON.stringify(customStylePresets)) }
    catch { /* Presets remain available in the open document even if browser storage is full. */ }
  }, [customStylePresets])
  useEffect(() => {
    if (history.present.styleFrame) applyVisualStyle(history.present.styleFrame)
    // A frame changes only when a style preset is applied or undone/redone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.present.styleFrame])
  const layerTileColorOverrides = new Map([...renderGrids.keys()].map(z => [z, composeLayerTileColors(
    layers, layerGrids, z, cols, rows, wallColor, wallOpacity, environmentalColors as Map<TileState, string>,
  )]))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [imageImportError, setImageImportError] = useState<string | null>(null)
  const [dungeonImportError, setDungeonImportError] = useState<string | null>(null)
  const [dungeonImportNotice, setDungeonImportNotice] = useState<string | null>(null)
  const [customImages, setCustomImages] = useState<CustomImageAsset[]>([])
  const [generationResult, setGenerationResult] = useState<MissionGenerationResult | null>(null)
  const [generationSeedInput, setGenerationSeedInput] = useState('')
  const generationSeedLockedRef = useRef(false)
  const [generationStyle, setGenerationStyle] = useState<GenerationStyle>('spine-shortcuts')
  const [generationComplexity, setGenerationComplexity] = useState<ComplexityPreset>('standard')
  const [generationDungeonLevel, setGenerationDungeonLevel] = useState(1)
  const [generationShadowdarkCoreMagicItems, setGenerationShadowdarkCoreMagicItems] = useState(true)
  const [generationLoopCount, setGenerationLoopCount] = useState(1)
  const [generationLoopChallenges, setGenerationLoopChallenges] = useState<Array<LoopPreference | undefined>>([undefined])
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [savedHistoryLength, setSavedHistoryLength] = useState(0)
  const isDirty = history.past.length !== savedHistoryLength || savedStyleSignature !== currentStyleSignature()
  const generationPreviewSeed = generationSeedInput.trim() === '' ? 0 : generationSeedInput
  const generationRequest: GenerationRequest = {
    style: generationStyle,
    seed: generationPreviewSeed,
    cols,
    rows,
    tilesPerInch,
    orientation: cols >= rows ? 'landscape' : 'portrait',
    complexity: generationComplexity,
    playerLevel: generationDungeonLevel,
    loopCount: generationLoopCount,
    loopPreference: 'varied',
    magicItemSources: generationShadowdarkCoreMagicItems ? ['shadowdark-core'] : [],
    loopChallenges: generationLoopChallenges.slice(0, Math.max(0, generationLoopCount)),
  }
  const generationPreflight = preflightGeneration(generationRequest)
  const generationLevelBudget = getDungeonLevelBudget(generationDungeonLevel)

  const setRequestedLoopCount = (value: number) => {
    const next = Number.isFinite(value) ? Math.min(20, Math.max(0, Math.floor(value))) : 0
    setGenerationLoopCount(next)
    setGenerationLoopChallenges(previous => Array.from({ length: next }, (_, index) => previous[index]))
  }

  const documentName = currentFilePath
    ? currentFilePath.split(/[\\/]/).pop() ?? 'Untitled'
    : 'Untitled'

  useEffect(() => {
    if (!isTauri()) return
    const marker = isDirty ? '● ' : ''
    setWindowTitle(`${marker}Torch & Tile — ${documentName}`)
  }, [documentName, isDirty])

  const [workspaceTab, setWorkspaceTab] = useState<'draw' | 'assets' | 'generate' | 'document'>('draw')
  const [toolbarWidth, setToolbarWidth] = useState(328)
  const resizingToolbarRef = useRef(false)

  const stageRef = useRef<Konva.Stage>(null)
  const pendingFitRef = useRef(false)
  const [fitRequest, setFitRequest] = useState(0)
  const layerRef = useRef<Konva.Layer>(null)
  const stampLayerRef = useRef<Konva.Layer>(null)
  const lightingLayerRef = useRef<Konva.Layer>(null)
  const lightMarkersLayerRef = useRef<Konva.Layer>(null)
  const dotLayerRef = useRef<Konva.Layer>(null)
  const labelsLayerRef = useRef<Konva.Layer>(null)
  const labelEditorRef = useRef<HTMLInputElement>(null)
  const draggedLabelRef = useRef<string | null>(null)
  const structureDragRef = useRef<StructureDrag | null>(null)
  const selectionDragRef = useRef<{ start: Tile; end: Tile } | null>(null)
  const [selectionDrag, setSelectionDrag] = useState<{ start: Tile; end: Tile } | null>(null)
  const objectClipboardRef = useRef<MapObjectClipboard | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const dungeonInputRef = useRef<HTMLInputElement>(null)
  const isoDiagnosticEnabled = useRef(new URLSearchParams(window.location.search).has('iso-diagnostic')).current
  const isoDiagnosticRequestIdRef = useRef(0)
  const isoDiagnosticRequestRef = useRef<{ requestId: number; config: ReturnType<typeof normalizeIsoDiagnosticConfig> } | null>(null)
  const isoDiagnosticReportsRef = useRef<IsoDiagnosticReport[]>([])

  const stampImages = useStampImages(customImages)
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
    if (!isoDiagnosticEnabled) return

    const api: IsoDiagnosticApi = {
      setFixture: (input: IsoDiagnosticConfig) => {
        const config = normalizeIsoDiagnosticConfig(input)
        const requestId = ++isoDiagnosticRequestIdRef.current
        isoDiagnosticRequestRef.current = { requestId, config }
        setHistory(createHistory({
          activeLayerId: 'map',
          grids: buildIsoDiagnosticGrids(config),
          layerGrids: createLayerGrids(undefined, buildIsoDiagnosticGrids(config)),
          stamps: [],
          steps: [],
          ramps: [],
          labels: [],
          lights: [],
          layers: [createDefaultLayer()],
          environmentalColors: new Map(),
        }))
        setCustomImages([])
        setCols(config.cols)
        setRows(config.rows)
        setActiveZ(config.levelCount - 1)
        setShow3D(config.show3D)
        setShowIso(true)
        return requestId
      },
      waitForReport: (requestId: number, timeoutMs = 10000) => new Promise((resolve, reject) => {
        const deadline = performance.now() + timeoutMs
        const check = () => {
          const report = isoDiagnosticReportsRef.current.find(candidate => candidate.requestId === requestId)
          if (report) {
            resolve(report)
          } else if (performance.now() >= deadline) {
            reject(new Error(`Timed out waiting for iso diagnostic report ${requestId}`))
          } else {
            window.setTimeout(check, 0)
          }
        }
        check()
      }),
      latestReport: () => isoDiagnosticReportsRef.current[isoDiagnosticReportsRef.current.length - 1] ?? null,
      measurePan: (durationMs = 1000) => {
        const stage = stageRef.current
        if (!stage) return Promise.reject(new Error('Konva stage is not ready'))

        const duration = Math.max(100, durationMs)
        const originalPosition = stage.position()
        const frameTimes: number[] = []
        const startedAt = performance.now()
        let previousFrameAt = startedAt

        return new Promise(resolve => {
          const sample = (now: number) => {
            if (now - startedAt >= duration) {
              stage.position(originalPosition)
              resolve(summarizeFrameTimes(frameTimes, duration))
              return
            }
            frameTimes.push(now - previousFrameAt)
            previousFrameAt = now
            const phase = (now - startedAt) / duration * Math.PI * 4
            stage.position({
              x: originalPosition.x + Math.sin(phase) * 8,
              y: originalPosition.y + Math.cos(phase) * 8,
            })
            window.requestAnimationFrame(sample)
          }
          window.requestAnimationFrame(sample)
        })
      },
    }

    window.__mapDrawDiagnostics = api
    return () => {
      if (window.__mapDrawDiagnostics === api) delete window.__mapDrawDiagnostics
    }
  }, [isoDiagnosticEnabled])

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
      if (e.key === 'Escape' && shapeDraftRef.current) {
        shapeDraftRef.current = null
        setShapeDraft(null)
        return
      }
      if (e.key === 'Escape' && lightPlacement) {
        setLightPlacement(false)
        return
      }
      if (e.ctrlKey && e.key === 'z') { setHistory(h => undo(h)); return }
      if (e.ctrlKey && e.key === 'y') { setHistory(h => redo(h)); return }
      const ds = drawingStateRef.current
      if (selectionMode && e.key === 'Delete' && objectSelection.length > 0) {
        const selected = new Set(objectSelection.map(item => `${item.kind}:${item.id}`))
        setHistory(h => push(h, {
          ...h.present,
          stamps: h.present.stamps.filter(item => !selected.has(`stamp:${item.id}`)),
          steps: h.present.steps.filter(item => !selected.has(`step:${item.id}`)),
          ramps: h.present.ramps.filter(item => !selected.has(`ramp:${item.id}`)),
          labels: h.present.labels.filter(item => !selected.has(`label:${item.id}`)),
        }))
        setObjectSelection([])
        return
      }
      if (e.key === 'Delete' && selectedLightId) {
        const light = lights.find(item => item.id === selectedLightId)
        const owner = layers.find(item => item.id === (light?.layerId ?? createDefaultLayer().id))
        if (light && owner?.locked !== true) {
          setHistory(h => push(h, { ...h.present, lights: (h.present.lights ?? []).filter(item => item.id !== selectedLightId) }))
          setSelectedLightId(null)
        }
        return
      }
      if (selectionMode && objectSelection.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const delta = e.key === 'ArrowUp' ? { col: 0, row: -1 }
          : e.key === 'ArrowDown' ? { col: 0, row: 1 }
            : e.key === 'ArrowLeft' ? { col: -1, row: 0 } : { col: 1, row: 0 }
        setHistory(h => push(h, { ...h.present, ...moveSelectedMapObjects({ ...h.present, selection: objectSelection, delta }) }))
        return
      }
      if (selectionMode && objectSelection.length > 0 && (e.key === 'r' || e.key === 'R')) {
        setHistory(h => push(h, { ...h.present, ...rotateSelectedMapObjects({ ...h.present, selection: objectSelection }) }))
        return
      }
      if (selectionMode && objectSelection.length > 0 && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setHistory(h => push(h, { ...h.present, ...ungroupSelectedMapObjects({ ...h.present, selection: objectSelection }) }))
        return
      }
      if (selectionMode && objectSelection.length > 1 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setHistory(h => push(h, { ...h.present, ...groupSelectedMapObjects({ ...h.present, selection: objectSelection, groupId: crypto.randomUUID() }) }))
        return
      }
      if (selectionMode && objectSelection.length > 0 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const copiedIds = new Map(objectSelection.map(item => [`${item.kind}:${item.id}`, crypto.randomUUID()]))
        const copiedGroupIds = new Map<string, string>()
        const createId = (kind: MapObjectSelection['kind'], sourceId: string) => copiedIds.get(`${kind}:${sourceId}`)!
        const createGroupId = (sourceGroupId: string) => {
          const existing = copiedGroupIds.get(sourceGroupId)
          if (existing) return existing
          const created = crypto.randomUUID()
          copiedGroupIds.set(sourceGroupId, created)
          return created
        }
        const copiedSelection = objectSelection.map(item => ({ ...item, id: createId(item.kind, item.id) }))
        setHistory(h => {
          const copies = duplicateSelectedMapObjects({ ...h.present, selection: objectSelection, delta: { col: 1, row: 1 }, createId, createGroupId })
          return push(h, { ...h.present, ...copies })
        })
        setObjectSelection(copiedSelection)
        return
      }
      if (selectionMode && objectSelection.length > 0 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        objectClipboardRef.current = copySelectedMapObjects({ stamps, steps, ramps, labels, selection: objectSelection })
        return
      }
      if (selectionMode && objectClipboardRef.current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const clipboard = objectClipboardRef.current
        const copiedIds = new Map<string, string>()
        const copiedGroupIds = new Map<string, string>()
        const createId = (kind: MapObjectSelection['kind'], sourceId: string) => {
          const key = `${kind}:${sourceId}`
          const existing = copiedIds.get(key)
          if (existing) return existing
          const created = crypto.randomUUID()
          copiedIds.set(key, created)
          return created
        }
        const createGroupId = (sourceGroupId: string) => {
          const existing = copiedGroupIds.get(sourceGroupId)
          if (existing) return existing
          const created = crypto.randomUUID()
          copiedGroupIds.set(sourceGroupId, created)
          return created
        }
        const pasted = pasteMapObjects({ clipboard, delta: { col: 1, row: 1 }, createId, createGroupId })
        setHistory(h => push(h, {
          ...h.present,
          stamps: [...h.present.stamps, ...pasted.stamps],
          steps: [...h.present.steps, ...pasted.steps],
          ramps: [...h.present.ramps, ...pasted.ramps],
          labels: [...h.present.labels, ...pasted.labels],
        }))
        setObjectSelection(pasted.selection)
        return
      }
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
          setHistory(h => ({ ...h, present: withActiveLayerGrid(h.present, activeZRef.current, savedGrid) }))
        }
        dispatch({ type: 'ESCAPE' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [labels, layers, lights, objectSelection, ramps, selectionMode, selectedLightId, stamps, steps, lightPlacement])

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
    const { col: fc, row: fr } = isoUnprojectAtZ(worldX, worldY, TILE_PX * 2, TILE_PX, activeZRef.current)
    const col = Math.floor(fc)
    const row = Math.floor(fr)
    return (col >= 0 && row >= 0 && col < cols && row < rows) ? { col, row } : null
  }

  const stageToShapePoint = (stage: Konva.Stage, clientX: number, clientY: number): ShapePoint | null => {
    const rect = stage.container().getBoundingClientRect()
    const scale = stage.scaleX()
    const worldX = (clientX - rect.left - stage.x()) / scale
    const worldY = (clientY - rect.top - stage.y()) / scale
    const point = showIso
      ? isoUnprojectAtZ(worldX, worldY, TILE_PX * 2, TILE_PX, activeZRef.current)
      : { col: worldX / TILE_PX, row: worldY / TILE_PX }
    if (point.col < 0 || point.row < 0 || point.col >= cols || point.row >= rows) return null
    return snapShapePoint(point, shapeSnap)
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

      let tile: Tile | null
      if (showIso) {
        tile = stageToIsoTile(stage, e.evt.clientX, e.evt.clientY)
      } else {
        tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      }
      if (!tile) return

      if (cropMode) {
        if (e.evt.button === 2) {
          cropDragRef.current = null
          setCropDrag(null)
          setExportRegion(wholeMapRegion(cols, rows))
          return
        }
        if (e.evt.button === 0) {
          const region = normalizeExportRegion(exportRegion, cols, rows)
          const right = region.col + region.cols - 1
          const bottom = region.row + region.rows - 1
          const isLeft = tile.col === region.col
          const isRight = tile.col === right
          const isTop = tile.row === region.row
          const isBottom = tile.row === bottom
          const isCorner = (isLeft || isRight) && (isTop || isBottom)
          const drag = isCorner
            ? { start: { col: isLeft ? right : region.col, row: isTop ? bottom : region.row }, end: tile }
            : { start: tile, end: tile }
          cropDragRef.current = drag
          setCropDrag(drag)
        }
        return
      }

      if (shapeTool && e.evt.button === 0) {
        if (activeLayer?.locked) return
        const point = stageToShapePoint(stage, e.evt.clientX, e.evt.clientY)
        if (!point) return
        const draft: ShapeDraft = { tool: shapeTool, start: point, end: point, points: [point] }
        shapeDraftRef.current = draft
        setShapeDraft(draft)
        setObjectSelection([])
        return
      }

      if (lightPlacement && e.evt.button === 0) {
        if (activeLayer?.locked) return
        const light: MapLight = {
          id: crypto.randomUUID(), name: `Light ${lights.length + 1}`,
          col: tile.col, row: tile.row, z: activeZRef.current,
          layerId: activeLayer?.id, color: '#ffcb70', intensity: 1,
          brightRadius: 3, dimRadius: 6,
        }
        setHistory(h => push(h, { ...h.present, lights: [...(h.present.lights ?? []), light] }))
        setSelectedLightId(light.id)
        setLightPlacement(false)
        return
      }

      // A right-click on empty canvas cancels object selection instead of
      // entering a placement path below.
      if (e.evt.button === 2 && (ds.tool === 'steps' || ds.tool === 'ramps' || ds.tool === 'stamp')) {
        dispatch({ type: 'SELECT', id: null })
        return
      }

      if (selectionMode) {
        if (e.evt.button === 2) {
          setObjectSelection([])
          return
        }
        if (!showIso && e.evt.button === 0) {
          const drag = { start: tile, end: tile }
          selectionDragRef.current = drag
          setSelectionDrag(drag)
        }
        return
      }

      if (activeLayer?.locked) return

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
            const baseHistory = { ...h, present: withActiveLayerGrid(h.present, az, savedBase) }
            return push(baseHistory, withActiveLayerGrid(h.present, az, next))
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
          z: activeZRef.current,
          layerId: activeLayer?.id,
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
          layerId: activeLayer?.id,
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
          layerId: activeLayer?.id,
          direction: 'E',
          ascending: false,
        }
        setHistory(h => push(h, { ...h.present, ramps: addRampRun(h.present.ramps, newRun) }))
        dispatch({ type: 'SET_TOOL', to: { tool: 'ramps', selectedId: newRun.id } })
        return
      }

      if (ds.tool === 'stamp') {
        const customAsset = customImages.find(asset => asset.type === ds.stampType)
        const newStamp: Stamp = {
          id: crypto.randomUUID(),
          type: ds.stampType,
          col: tile.col,
          row: tile.row,
          rotation: 0,
          z: activeZRef.current,
          layerId: activeLayer?.id,
          ...(customAsset ? { assetName: customAsset.name, aspectRatio: customAsset.aspectRatio } : {}),
        }
        setHistory(h => push(h, { ...h.present, stamps: addStamp(h.present.stamps, newStamp) }))
        dispatch({ type: 'SELECT', id: newStamp.id })
        return
      }

      // Paint mode: area select start
      dispatch({ type: 'PAINT_START', tile, button: e.evt.button === 2 ? 2 : 0 })
    },
    [activeLayer?.id, activeLayer?.locked, cols, cropMode, exportRegion, rows, editingLabelId, selectionMode, showIso, shapeTool, shapeSnap, lightPlacement, lights.length],
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

      const crop = cropDragRef.current
      if (cropMode && crop && tile) {
        const next = { ...crop, end: tile }
        cropDragRef.current = next
        setCropDrag(next)
        return
      }

      const shape = shapeDraftRef.current
      if (shape) {
        const point = stageToShapePoint(stage, e.evt.clientX, e.evt.clientY)
        if (point) {
          const points = shape.tool === 'path'
            ? (Math.hypot(point.col - shape.points[shape.points.length - 1].col, point.row - shape.points[shape.points.length - 1].row) >= 0.15
                ? [...shape.points, point]
                : shape.points)
            : shape.points
          const next = { ...shape, end: point, points }
          shapeDraftRef.current = next
          setShapeDraft(next)
        }
        return
      }

      setHoverTile(tile)
      setHoverPointer({ x: e.evt.clientX, y: e.evt.clientY })
      hoverTileRef.current = tile

      const ds = drawingStateRef.current
      const selection = selectionDragRef.current
      if (selectionMode && selection && tile) {
        const next = { ...selection, end: tile }
        selectionDragRef.current = next
        setSelectionDrag(next)
        return
      }
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
          const center = isoProjectAtZ(rEnd.col + 0.5, rEnd.row + 0.5, TILE_PX * 2, TILE_PX, activeZRef.current)
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
    [cols, cropMode, rows, selectionMode, showIso, shapeSnap],
  )

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = false
      return
    }

    const crop = cropDragRef.current
    if (cropMode && crop && e.button === 0) {
      const end = crop.end
      const col = Math.min(crop.start.col, end.col)
      const row = Math.min(crop.start.row, end.row)
      setExportRegion(normalizeExportRegion({
        col,
        row,
        cols: Math.abs(crop.start.col - end.col) + 1,
        rows: Math.abs(crop.start.row - end.row) + 1,
      }, cols, rows))
      cropDragRef.current = null
      setCropDrag(null)
      return
    }

    const shape = shapeDraftRef.current
    if (shape && e.button === 0) {
      const stage = stageRef.current
      const finalPoint = stage ? stageToShapePoint(stage, e.clientX, e.clientY) : null
      let completed = shape
      if (finalPoint) {
        const points = shape.tool === 'path'
          ? (Math.hypot(finalPoint.col - shape.points[shape.points.length - 1].col, finalPoint.row - shape.points[shape.points.length - 1].row) >= 0.02
              ? [...shape.points, finalPoint]
              : shape.points)
          : shape.points
        completed = { ...shape, end: finalPoint, points }
      }
      shapeDraftRef.current = null
      setShapeDraft(null)
      if (!activeLayer?.locked) {
        const preview = getShapePreviewPoints(completed, polygonSides, pathSimplification)
        const tiles = rasterizeShape(completed.tool, preview, cols, rows)
        if (tiles.length > 0) {
          const az = activeZRef.current
          setHistory(h => {
            const base = getLayerGrid(h.present.layerGrids, activeLayer ?? createDefaultLayer(), az, cols, rows)
            return push(h, withActiveLayerGrid(h.present, az, paintTiles(base, cols, tiles, selectedPaintState)))
          })
        }
      }
      return
    }

    const selection = selectionDragRef.current
    if (selectionMode && selection && e.button === 0) {
      selectionDragRef.current = null
      setSelectionDrag(null)
      setObjectSelection(selectMapObjects({
        stamps: visibleStamps, steps: visibleSteps, ramps: visibleRamps, labels: visibleLabels, activeZ: activeZRef.current,
        bounds: {
          minCol: Math.min(selection.start.col, selection.end.col),
          minRow: Math.min(selection.start.row, selection.end.row),
          maxCol: Math.max(selection.start.col, selection.end.col),
          maxRow: Math.max(selection.start.row, selection.end.row),
        },
      }))
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
      const baseGrid = getLayerGrid(layerGrids, activeLayer ?? createDefaultLayer(), activeZRef.current, cols, rows)
      setHistory(h => {
        const next = paintTiles(baseGrid, cols, rectTileList, FLOOR)
        return { ...h, present: withActiveLayerGrid(h.present, activeZRef.current, next) }
      })
      dispatch({ type: 'ROUGH_COMMIT_RECT', end, seed, baseGrid })
      return
    }

    if (ds.tool === 'paint' && ds.phase === 'selecting') {
      const tiles = getAreaTiles(ds.start, ds.end, ds.brushShape)
      const az = activeZRef.current
      const tileValue = ds.paintValue
      setHistory(h => {
        const next = paintTiles(getLayerGrid(h.present.layerGrids, activeLayer ?? createDefaultLayer(), az, cols, rows), cols, tiles, tileValue)
        return push(h, withActiveLayerGrid(h.present, az, next))
      })
      dispatch({ type: 'PAINT_COMMIT' })
    }
  }, [activeLayer, cols, cropMode, layerGrids, visibleLabels, visibleRamps, rows, selectionMode, visibleStamps, visibleSteps, showIso, polygonSides, pathSimplification, selectedPaintState, shapeSnap])

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
      const diagnosticRequest = isoDiagnosticEnabled ? isoDiagnosticRequestRef.current : null
      const diagnosticStart = diagnosticRequest ? performance.now() : 0
      const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
      const shapes = buildIsoScene({
        grids: renderGrids, steps: visibleSteps, ramps: visibleRamps, cols, rows, show3D, wallColor, wallOpacity, selectedStepId, selectedRampId,
        tileW: TILE_PX * 2, tileH: TILE_PX, frontFaceColor, eastFaceColor,
        floorColor,
        waterColor, lavaColor, darknessColor,
        environmentalColors: environmentalColors as Map<TileState, string>,
        tileColorOverrides: layerTileColorOverrides,
        secretDoorStamps: playerView ? visibleStamps : [],
      })
      const sceneBuildEnd = diagnosticRequest ? performance.now() : 0
      const groupingStart = diagnosticRequest ? performance.now() : 0
      const groups = groupIsoShapes(shapes)
      const groupingEnd = diagnosticRequest ? performance.now() : 0
      const structureNodes = new Map<string, { kind: StructureKind; id: string; nodes: Konva.Node[] }>()
      const nodeCreateStart = diagnosticRequest ? performance.now() : 0
      for (const group of groups) {
        if (group.kind === 'batch') {
          const batchNode = new Konva.Shape({
            listening: false,
            perfectDrawEnabled: false,
            sceneFunc: context => drawIsoBatch(context, group.shapes),
          })
          layer.add(batchNode)
          const bounds = getIsoShapeBounds(group.shapes)
          if (bounds && (!diagnosticRequest || diagnosticRequest.config.cacheBatches)) {
            batchNode.cache({ ...bounds, offset: 1 })
          }
          continue
        }

        const { shape } = group
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
      const nodeCreateEnd = diagnosticRequest ? performance.now() : 0
      for (const structure of structureNodes.values()) {
        const currentSelectedId = structure.kind === 'step' ? selectedStepId : selectedRampId
        for (const node of structure.nodes) {
          node.on('mousedown', (e) => {
            e.cancelBubble = true
            e.evt.preventDefault()
            if (selectionMode && e.evt.button === 0) {
              selectObject([{ kind: structure.kind, id: structure.id }])
              return
            }
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
      const drawScheduleStart = diagnosticRequest ? performance.now() : 0
      layer.batchDraw()
      const drawScheduleEnd = diagnosticRequest ? performance.now() : 0
      if (diagnosticRequest) {
        requestAnimationFrame(() => {
          const frameAt = performance.now()
          const report: IsoDiagnosticReport = {
            requestId: diagnosticRequest.requestId,
            config: diagnosticRequest.config,
            shapeCount: shapes.length,
            renderNodeCount: groups.length,
            layerNodeCount: layer.getChildren().length,
            dotNodeCount: dotLayerRef.current?.getChildren().length ?? 0,
            stampNodeCount: stampLayerRef.current?.getChildren().length ?? 0,
            labelNodeCount: labelsLayerRef.current?.getChildren().length ?? 0,
            totalNodeCount: [layer, dotLayerRef.current, stampLayerRef.current, lightingLayerRef.current, lightMarkersLayerRef.current, labelsLayerRef.current]
              .reduce((total, current) => total + (current?.getChildren().length ?? 0), 0),
            sceneBuildMs: sceneBuildEnd - diagnosticStart,
            groupingMs: groupingEnd - groupingStart,
            nodeCreateMs: nodeCreateEnd - nodeCreateStart,
            drawScheduleMs: drawScheduleEnd - drawScheduleStart,
            firstFrameMs: frameAt - diagnosticStart,
          }
          isoDiagnosticReportsRef.current = [...isoDiagnosticReportsRef.current, report].slice(-20)
        })
      }
      return
    }

    // Pure scene description — geometry, opacity, and grouping computed once;
    // this effect only walks the result and creates/wires Konva nodes.
    const scene = buildTileScene({
      grids: renderGrids, steps: visibleSteps, ramps: visibleRamps, cols, rows, activeZ,
      tilePx: TILE_PX, facePx: FACE_PX,
      show3D, showGrid, showHatching, showWallOutline,
      wallOutlineColor, wallOutlineStyle, wallColor, wallOpacity,
      selectedStepId, selectedRampId, selectedStepIds: selectedObjectIds('step'), selectedRampIds: selectedObjectIds('ramp'),
      floorColor,
      waterColor, lavaColor, darknessColor,
      environmentalColors: environmentalColors as Map<TileState, string>,
      tileColorOverrides: layerTileColorOverrides,
      secretDoorStamps: playerView ? visibleStamps : [],
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
        const runGroup = new Konva.Group({ opacity: layerOpacityFor({ layerId: run.layerId }) })
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
            if (selectionMode && e.evt.button === 0) {
              selectObject([{ kind: isStep ? 'step' : 'ramp', id: run.id }])
              return
            }
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

    const textureGrid = textureSettings.scope === 'active-layer'
      ? (activeLayer ? getLayerGrid(layerGrids, activeLayer, activeZ, cols, rows) : null)
      : renderGrids.get(activeZ)
    if (textureGrid && (textureSettings.scope === 'map' || activeLayer?.visible)) {
      const texture = createTextureCanvas(textureGrid, cols, rows, TILE_PX, textureSettings, showIso)
      if (texture) layer.add(new Konva.Image({
        image: texture.canvas as unknown as HTMLImageElement,
        x: texture.x,
        y: showIso ? -activeZ * Z_STEP_HEIGHT : texture.y,
        opacity: textureSettings.scope === 'active-layer' ? (activeLayer?.opacity ?? 100) / 100 : 1,
        listening: false,
      }))
    }

    layer.batchDraw()
  }, [renderGrids, layerGrids, activeLayer, textureSettings, visibleStamps, visibleSteps, visibleRamps, selectedStepId, selectedRampId, objectSelection, selectionMode, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, playerView, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor])

  // Stamp layer
  useEffect(() => {
    const layer = stampLayerRef.current
    if (!layer || !stampImages) return
    layer.destroyChildren()

    const items = buildStampScene({ stamps: visibleStamps, selectedStampId, selectedStampIds: selectedObjectIds('stamp'), stampImages, activeZ, tilePx: TILE_PX, showIso, showTrapIcons: !playerView, showSecretDoors: !playerView, showLockedDoors: !playerView })

    for (const item of items) {
      const stamp = visibleStamps.find(s => s.id === item.id)!
      const imgEl = stampImages.get(item.stampType)!
      const stampImage = colorizeStampImage(imgEl, stamp.color)
      const layerOpacity = layerOpacityFor(stamp)
      const v = item.variant

      const attachStampInteraction = (node: Konva.Node) => {
        node.on('mousedown', (e) => {
          e.cancelBubble = true
          e.evt.preventDefault()
          if (selectionMode && e.evt.button === 0) {
            selectObject([{ kind: 'stamp', id: item.id }])
            return
          }
          if (e.evt.button === 2) {
            setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, item.id) }))
            dispatch({ type: 'SELECT', id: null })
            return
          }
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
          opacity: layerOpacity,
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
          opacity: layerOpacity,
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
          opacity: (v.opacity ?? 1) * layerOpacity,
        })
        if (item.interactive) {
          attachStampInteraction(node)
          node.on('dragend', () => {
            const sz = stampFootprintSize(stamp)
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
  }, [visibleStamps, selectedStampId, objectSelection, selectionMode, stampImages, cols, rows, showIso, activeZ, playerView])

  // Non-exported layer: dot pattern + ghost cursor preview
  useEffect(() => {
    const layer = dotLayerRef.current
    if (!layer) return
    layer.destroyChildren()

    const isLight = isLightBackdrop(wallColor, wallOpacity)
    const dotZs = new Set(grids.keys())
    dotZs.add(activeZ)
    const sortedZsForDots = [...dotZs].filter(z => z <= activeZ).sort((a, b) => a - b)
    for (const z of sortedZsForDots) {
        const levelOpacity = 0.2 * Math.pow(0.5, activeZ - z)
        const dotColor = isLight
          ? `rgba(0,0,0,${levelOpacity})`
          : `rgba(255,255,255,${levelOpacity})`
        const levelGrid = applyPlayerViewSecretDoors(getGrid(grids, z, cols, rows), cols, rows, z, playerView ? stamps : [])
        for (let r = 0; r < rows; r += 2) {
          for (let c = 0; c < cols; c += 2) {
            if (getTile(levelGrid, cols, c, r) === WALL) {
              const dotPos = showIso
                ? isoProjectAtZ(c + 0.5, r + 0.5, TILE_PX * 2, TILE_PX, z)
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
          points: isoFloorPointsAtZ(t.col, t.row, TILE_PX * 2, TILE_PX, activeZ),
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

    if (selectionDrag && !showIso) {
      const minCol = Math.min(selectionDrag.start.col, selectionDrag.end.col)
      const minRow = Math.min(selectionDrag.start.row, selectionDrag.end.row)
      const maxCol = Math.max(selectionDrag.start.col, selectionDrag.end.col)
      const maxRow = Math.max(selectionDrag.start.row, selectionDrag.end.row)
      layer.add(new Konva.Rect({
        x: minCol * TILE_PX, y: minRow * TILE_PX,
        width: (maxCol - minCol + 1) * TILE_PX, height: (maxRow - minRow + 1) * TILE_PX,
        stroke: '#2f80ed', strokeWidth: 2, dash: [4, 2], fill: 'rgba(47,128,237,0.12)', listening: false,
      }))
    }

    if (cropMode) {
      const region = cropDrag
        ? normalizeExportRegion({
            col: Math.min(cropDrag.start.col, cropDrag.end.col),
            row: Math.min(cropDrag.start.row, cropDrag.end.row),
            cols: Math.abs(cropDrag.start.col - cropDrag.end.col) + 1,
            rows: Math.abs(cropDrag.start.row - cropDrag.end.row) + 1,
          }, cols, rows)
        : normalizeExportRegion(exportRegion, cols, rows)
      let rect = {
        x: region.col * TILE_PX,
        y: region.row * TILE_PX,
        width: region.cols * TILE_PX,
        height: region.rows * TILE_PX,
      }
      if (showIso) {
        const corners = [
          [region.col, region.row],
          [region.col + region.cols, region.row],
          [region.col + region.cols, region.row + region.rows],
          [region.col, region.row + region.rows],
        ].map(([col, row]) => ({ x: (col - row) * TILE_PX, y: (col + row) * TILE_PX / 2 }))
        const xs = corners.map(point => point.x)
        const ys = corners.map(point => point.y)
        rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
      }
      layer.add(new Konva.Rect({
        ...rect,
        stroke: '#e4bd77',
        strokeWidth: 2,
        dash: [8, 4],
        fill: 'rgba(228,189,119,0.12)',
        listening: false,
      }))
      const handles = [
        [region.col, region.row],
        [region.col + region.cols, region.row],
        [region.col + region.cols, region.row + region.rows],
        [region.col, region.row + region.rows],
      ].map(([col, row]) => showIso
        ? isoProjectAtZ(col, row, TILE_PX * 2, TILE_PX, activeZ)
        : { x: col * TILE_PX, y: row * TILE_PX })
      for (const handle of handles) layer.add(new Konva.Rect({
        x: handle.x - 4, y: handle.y - 4, width: 8, height: 8,
        fill: '#e4bd77', stroke: '#211a13', strokeWidth: 1, listening: false,
      }))
    }

    if (shapeDraft) {
      const points = getShapePreviewPoints(shapeDraft, polygonSides, pathSimplification)
      const closed = shapeDraft.tool !== 'path' || isClosedShapePath(points)
      const projected = points.flatMap(point => {
        const world = showIso
          ? isoProjectAtZ(point.col, point.row, TILE_PX * 2, TILE_PX, activeZ)
          : { x: point.col * TILE_PX, y: point.row * TILE_PX }
        return [world.x, world.y]
      })
      if (projected.length >= 2) {
        layer.add(new Konva.Line({
          points: projected,
          closed,
          stroke: '#e4bd77',
          strokeWidth: 2,
          dash: shapeDraft.tool === 'path' ? undefined : [5, 3],
          fill: closed ? 'rgba(228,189,119,0.16)' : undefined,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
        }))
      }
    }

    // Rough mode: anchor dot + ghost rect preview during placed1
    if (roughStart && roughPhase !== 'idle') {
      const dotPos = showIso
        ? isoProjectAtZ(roughStart.col + 0.5, roughStart.row + 0.5, TILE_PX * 2, TILE_PX, activeZ)
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
              points: isoFloorPointsAtZ(c, r, TILE_PX * 2, TILE_PX, activeZ),
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
          points: isoFloorPointsAtZ(flip.col, flip.row, TILE_PX * 2, TILE_PX, activeZ),
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
  }, [grids, stamps, playerView, activeZ, activeGrid, ghostTiles, cols, rows, wallColor, wallOpacity, roughStart, roughEnd, roughPhase, roughPreview, selectionDrag, cropMode, cropDrag, exportRegion, showIso, selectedPaintState, floorColor, waterColor, lavaColor, darknessColor, shapeDraft, polygonSides, pathSimplification])

  // Labels layer
  useEffect(() => {
    const layer = labelsLayerRef.current
    if (!layer) return
    layer.destroyChildren()
    if (showIso) { layer.batchDraw(); return }

    const items = buildLabelScene(visibleLabels, selectedLabelId, TILE_PX, !playerView, activeZ, selectedObjectIds('label'))

    for (const item of items) {
      const label = visibleLabels.find(candidate => candidate.id === item.id)
      const textNode = new Konva.Text({
        x: item.x,
        y: item.y,
        width: item.width,
        text: item.text,
        fontSize: item.fontSize,
        fontFamily: 'Arial',
        fill: item.color ?? '#000',
        opacity: label ? layerOpacityFor(label) : 1,
        align: 'center',
        draggable: true,
      })
      textNode.on('mousedown', (e) => {
        e.cancelBubble = true
        if (selectionMode && e.evt.button === 0) {
          selectObject([{ kind: 'label', id: item.id }])
          return
        }
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
  }, [activeZ, cols, visibleLabels, objectSelection, selectionMode, playerView, rows, showIso, selectedLabelId])

  useEffect(() => {
    const layer = lightingLayerRef.current
    if (!layer) return
    layer.destroyChildren()
    const grid = renderGrids.get(activeZ)
    if (grid && lightingSettings.enabled) {
      const visibleForLevel = visibleLights.filter(light => light.z === activeZ).map(light => ({
        ...light,
        intensity: light.intensity * ((layers.find(item => item.id === (light.layerId ?? createDefaultLayer().id))?.opacity ?? 100) / 100),
      }))
      const lighting = createLightingCanvas(grid, cols, rows, visibleForLevel, lightingSettings, TILE_PX, showIso, activeZ)
      if (lighting) layer.add(new Konva.Image({
        image: lighting.canvas as unknown as HTMLImageElement,
        x: lighting.x, y: lighting.y, listening: false,
      }))
    }
    layer.batchDraw()
  }, [renderGrids, visibleLights, layers, lightingSettings, activeZ, cols, rows, showIso])

  useEffect(() => {
    const layer = lightMarkersLayerRef.current
    if (!layer) return
    layer.destroyChildren()
    if (!playerView) for (const light of visibleLights.filter(item => item.z === activeZ)) {
      const position = showIso
        ? isoProjectAtZ(light.col + 0.5, light.row + 0.5, TILE_PX * 2, TILE_PX, activeZ)
        : { x: (light.col + 0.5) * TILE_PX, y: (light.row + 0.5) * TILE_PX }
      const owner = layers.find(item => item.id === (light.layerId ?? createDefaultLayer().id))
      const marker = new Konva.Circle({
        x: position.x, y: position.y, radius: selectedLightId === light.id ? 7 : 5,
        fill: light.color, stroke: selectedLightId === light.id ? '#fff1c6' : '#25211d',
        strokeWidth: selectedLightId === light.id ? 3 : 2,
        draggable: owner?.locked !== true,
      })
      marker.on('mousedown', event => {
        event.cancelBubble = true
        if (event.evt.button === 0) { setSelectedLightId(light.id); setLightPlacement(false) }
      })
      marker.on('dragend', () => {
        const tile = showIso
          ? isoUnprojectAtZ(marker.x(), marker.y(), TILE_PX * 2, TILE_PX, activeZ)
          : { col: marker.x() / TILE_PX - 0.5, row: marker.y() / TILE_PX - 0.5 }
        updateLight(light.id, {
          col: Math.max(0, Math.min(cols - 1, Math.round(tile.col))),
          row: Math.max(0, Math.min(rows - 1, Math.round(tile.row))),
        })
      })
      layer.add(marker)
    }
    layer.batchDraw()
  }, [visibleLights, playerView, activeZ, showIso, selectedLightId, cols, rows, layers])

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
      return createHistory({ activeLayerId: h.present.activeLayerId, grids: newGrids, layerGrids: resizeLayerGrids(h.present.layerGrids, cols, rows, newCols, newRows), stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, lights: h.present.lights, layers: h.present.layers, environmentalColors: h.present.environmentalColors })
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
      return createHistory({ activeLayerId: h.present.activeLayerId, grids: newGrids, layerGrids: resizeLayerGrids(h.present.layerGrids, cols, rows, newCols, rows), stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, lights: h.present.lights, layers: h.present.layers, environmentalColors: h.present.environmentalColors })
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
      return createHistory({ activeLayerId: h.present.activeLayerId, grids: newGrids, layerGrids: resizeLayerGrids(h.present.layerGrids, cols, rows, cols, newRows), stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, lights: h.present.lights, layers: h.present.layers, environmentalColors: h.present.environmentalColors })
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
      return createHistory({ activeLayerId: h.present.activeLayerId, grids: resized, layerGrids: resizeLayerGrids(h.present.layerGrids, cols, rows, newCols, newRows), stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels, lights: h.present.lights, layers: h.present.layers, environmentalColors: h.present.environmentalColors })
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

  const renderExportImage = useCallback((forPlayerView: boolean, mimeType = 'image/png', options: { includePointLights?: boolean; universalVtt?: boolean } = {}): Promise<string> => {
    if (!stampImages) return Promise.reject(new Error('Stamp images are not ready'))

    const exportGrid = renderGrids.get(activeZ) ?? activeGrid
    const exportIso = options.universalVtt ? false : showIso
    const export3D = options.universalVtt ? false : show3D
    const exportGridLines = options.universalVtt ? false : showGrid
    const normalizedRegion = normalizeExportRegion(exportRegion, cols, rows)
    const activeStamps = visibleStamps.filter(s => s.z === activeZ)
    const exportState = forPlayerView
      ? buildPlayerViewExport(exportGrid, cols, rows, activeZ, activeStamps)
      : { grid: exportGrid, stamps: activeStamps }
    const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
    const layout = buildExportShapes({
      grid: exportState.grid, cols, rows, showIso: exportIso, show3D: export3D, showGrid: exportGridLines, wallColor, wallOpacity,
      frontFaceColor, eastFaceColor,
      stamps: exportState.stamps,
      showHatching,
      hatchColor,
      showWallOutline,
      wallOutlineColor,
      wallOutlineStyle,
      exportTile: exportPixelsPerCell,
      floorColor,
      waterColor,
      lavaColor,
      darknessColor,
      environmentalColors: environmentalColors as Map<TileState, string>,
      tileColorOverrides: layerTileColorOverrides.get(activeZ),
      layerOpacityById: new Map(layers.map(layer => [layer.id, layer.opacity / 100])),
      textureGrid: textureSettings.scope === 'active-layer'
        ? (activeLayer?.visible ? getLayerGrid(layerGrids, activeLayer, activeZ, cols, rows) : null)
        : exportState.grid,
      textureSettings,
      textureOpacity: textureSettings.scope === 'active-layer' ? (activeLayer?.opacity ?? 100) / 100 : 1,
    })
    if (lightingSettings.enabled) {
      const exportLights = (options.includePointLights !== false ? visibleLights.filter(light => light.z === activeZ) : []).map(light => ({
        ...light,
        z: 0,
        intensity: light.intensity * ((layers.find(item => item.id === (light.layerId ?? createDefaultLayer().id))?.opacity ?? 100) / 100),
      }))
      const lighting = createLightingCanvas(
        exportState.grid, cols, rows, exportLights, lightingSettings, exportPixelsPerCell, exportIso, 0,
      )
      if (lighting) layout.shapes.push({
        kind: 'canvas', canvas: lighting.canvas,
        x: lighting.x, y: lighting.y,
        w: lighting.canvas.width, h: lighting.canvas.height,
      })
    }

    return new Promise((resolve, reject) => {
      const container = document.createElement('div')
      container.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;'
      document.body.appendChild(container)

      try {
        const offStage = new Konva.Stage({ container, width: layout.canvasW, height: layout.canvasH })
        const offLayer = new Konva.Layer()
        if (layout.offsetX !== 0) offLayer.x(layout.offsetX)
        offStage.add(offLayer)

        // JPEG has no alpha channel. Composite transparent wall areas over a
        // white page so the result is predictable in image viewers and VTTs.
        if (mimeType === 'image/jpeg') {
          offLayer.add(new Konva.Rect({ x: 0, y: 0, width: layout.canvasW, height: layout.canvasH, fill: '#ffffff', listening: false }))
        }

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
              opacity: shape.opacity,
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
            if (!imgEl) continue
            if (shape.scaleX !== undefined) {
              // iso mode: Group with no offset so skewX is applied before translate
              const group = new Konva.Group({
                x: shape.x, y: shape.y,
                rotation: shape.rotation,
                scaleX: shape.scaleX, scaleY: shape.scaleY,
                skewX: shape.skewX,
              })
              group.add(new Konva.Image({ image: colorizeStampImage(imgEl, shape.color), x: -shape.w / 2, y: -shape.h / 2, width: shape.w, height: shape.h, opacity: shape.opacity }))
              offLayer.add(group)
            } else {
              offLayer.add(new Konva.Image({
                image: colorizeStampImage(imgEl, shape.color),
                x: shape.x, y: shape.y,
                width: shape.w, height: shape.h,
                offsetX: shape.offsetX, offsetY: shape.offsetY,
                rotation: shape.rotation,
                scaleX: shape.mirrored ? -1 : 1,
                opacity: shape.opacity,
              }))
            }
          }
        }

        offLayer.draw()
        const crop = exportCropRect(normalizedRegion, exportPixelsPerCell, exportIso ? 'iso' : 'top-down', rows)
        offStage.toDataURL({
          ...crop,
          mimeType,
          quality: mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.92 : undefined,
          callback: (dataUrl: string) => {
            document.body.removeChild(container)
            offStage.destroy()
            resolve(dataUrl)
          },
        })
      } catch (error) {
        document.body.removeChild(container)
        reject(error)
      }
    })
  }, [activeGrid, activeZ, renderGrids, layerGrids, activeLayer, textureSettings, layerTileColorOverrides, layers, visibleLights, lightingSettings, visibleStamps, cols, rows, exportPixelsPerCell, exportRegion, wallColor, wallOpacity, showGrid, show3D, showIso, stampImages, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, environmentalColors])

  const getRoomLedgerText = useCallback(() => {
    if (!generationResult?.ok || !generationResult.space) return null
    return formatRoomLedgerText({
      modules: generationResult.space.modules,
      mission: generationResult.mission,
      labels,
      generalNotes: generationResult.space.generalNotes,
    })
  }, [generationResult, labels])

  const downloadText = (name: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.download = name
    anchor.href = url
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = useCallback(async () => {
    if (!stampImages) return
    setExportError(null)
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const extension = getMapExportExtension(exportFormat)
      const outputName = `dungeon-map-${ts}.${extension}`
      if (exportFormat === 'uvtt') {
        const imageDataUrl = await renderExportImage(playerView, 'image/png', { includePointLights: false, universalVtt: true })
        const region = normalizeExportRegion(exportRegion, cols, rows)
        const content = buildUniversalVttExport({
          title: documentName,
          imageDataUrl,
          cols,
          rows,
          pixelsPerGrid: exportPixelsPerCell,
          region,
          grid: renderGrids.get(activeZ) ?? activeGrid,
          stamps: visibleStamps.filter(stamp => stamp.z === activeZ).map(stamp => ({ ...stamp, z: 0 })),
          lights: lightingSettings.enabled ? visibleLights.filter(light => light.z === activeZ).map(light => ({
            col: light.col - region.col + 0.5,
            row: light.row - region.row + 0.5,
            range: light.dimRadius,
            intensity: light.intensity * ((layers.find(item => item.id === (light.layerId ?? createDefaultLayer().id))?.opacity ?? 100) / 100),
            color: `ff${light.color.slice(1)}`.toLowerCase(),
          })).filter(light => light.col >= 0 && light.row >= 0 && light.col <= region.cols && light.row <= region.rows) : [],
        })
        if (isTauri()) await saveTextFileAs(outputName, content, 'Universal VTT Map', extension)
        else downloadText(outputName, content)
        return
      }

      const mimeType = getMapExportMimeType(exportFormat)
      const dataUrl = await renderExportImage(playerView, mimeType)
      if (isTauri()) {
        const filterName = exportFormat === 'jpg' ? 'JPEG Image' : exportFormat === 'webp' ? 'WebP Image' : 'PNG Image'
        await saveImageFile(outputName, dataUrl, extension, filterName)
      } else {
        const anchor = document.createElement('a')
        anchor.download = outputName
        anchor.href = dataUrl
        anchor.click()
      }
      const ledgerText = getRoomLedgerText()
      if (ledgerText) downloadText(siblingFilePath(outputName, '.txt'), ledgerText)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Try a smaller region or resolution.')
    }
  }, [activeGrid, activeZ, cols, documentName, exportFormat, exportPixelsPerCell, exportRegion, getRoomLedgerText, layers, lightingSettings, playerView, renderExportImage, renderGrids, rows, stampImages, visibleLights, visibleStamps])

  const handleExportHtml = useCallback(async () => {
    if (!stampImages) return
    const [mapImage, playerMapImage] = await Promise.all([renderExportImage(false), renderExportImage(true)])
    const ledgerText = getRoomLedgerText()
    const html = buildHtmlExport({ mapImage, playerMapImage, ledgerText: ledgerText ?? undefined, initialPlayerView: playerView })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const defaultName = `dungeon-map-${ts}.html`
    if (isTauri()) {
      await saveTextFileAs(defaultName, html, 'HTML Document', 'html')
    } else {
      downloadText(defaultName, html)
    }
  }, [getRoomLedgerText, playerView, renderExportImage, stampImages])

  const handleExportMarkdown = useCallback(async () => {
    if (!stampImages) return
    const dataUrl = await renderExportImage(playerView)
    const ledgerText = getRoomLedgerText()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const markdownName = `dungeon-map-${ts}.md`
    const pngName = `dungeon-map-${ts}.png`
    if (isTauri()) {
      const markdownPath = await chooseSavePath(markdownName, 'Markdown Document', 'md')
      if (markdownPath) {
        const pngPath = siblingFilePath(markdownPath, '.png')
        await saveTextFile(markdownPath, buildMarkdownExport({ pngFileName: fileName(pngPath), ledgerText: ledgerText ?? undefined }))
        await writePngFile(pngPath, dataUrl)
      }
      return
    }
    const anchor = document.createElement('a')
    anchor.download = pngName
    anchor.href = dataUrl
    anchor.click()
    downloadText(markdownName, buildMarkdownExport({ pngFileName: pngName, ledgerText: ledgerText ?? undefined }))
  }, [getRoomLedgerText, playerView, renderExportImage, stampImages])

  const getSerializedMap = () => {
    const mapSave = serialize({ grids, layerGrids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, playerView, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, customImages, steps, ramps, labels, layers, activeLayerId, environmentalColors: environmentalColors as Map<number, string>, textureSettings, customStylePresets, lights, lightingSettings })
    return JSON.stringify(mapSave, null, 2)
  }

  const handleSave = useCallback(async () => {
    const content = getSerializedMap()
    if (isTauri()) {
      if (currentFilePath) {
        await saveJsonFile(currentFilePath, content)
        setSavedHistoryLength(history.past.length)
        setSavedStyleSignature(currentStyleSignature())
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
      setSavedHistoryLength(history.past.length)
      setSavedStyleSignature(currentStyleSignature())
    }
  }, [currentFilePath, history.past.length, grids, layerGrids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, playerView, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, customImages, steps, ramps, labels, layers, activeLayerId, environmentalColors, textureSettings, customStylePresets, lights, lightingSettings])

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
      setSavedStyleSignature(currentStyleSignature())
    }
  }, [currentFilePath, history.past.length, grids, layerGrids, cols, rows, tilesPerInch, wallColor, wallOpacity, brushShape, showGrid, playerView, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, floorColor, waterColor, lavaColor, darknessColor, stamps, customImages, steps, ramps, labels, layers, activeLayerId, environmentalColors, textureSettings, customStylePresets, lights, lightingSettings])

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
    const grid = createGrid(DEFAULT_COLS, DEFAULT_ROWS)
    setHistory(createHistory({ activeLayerId: 'map', grids: new Map([[0, grid]]), layerGrids: new Map([['map', new Map([[0, grid]])]]), stamps: [], steps: [], ramps: [], labels: [], lights: [], layers: [createDefaultLayer()], environmentalColors: new Map() }))
    setActiveLayerId('map')
    setCustomImages([])
    setCols(DEFAULT_COLS)
    setRows(DEFAULT_ROWS)
    setTilesPerInch(DEFAULT_TILES_PER_INCH)
    setPlayerView(false)
    setFloorColor(FLOOR_COLOR)
    setWaterColor(WATER_COLOR)
    setLavaColor(LAVA_COLOR)
    setDarknessColor(DARKNESS_COLOR)
    setTextureSettings({ ...DEFAULT_TEXTURE_SETTINGS })
    setLightingSettings({ ...DEFAULT_LIGHTING_SETTINGS })
    setSelectedStylePresetId(null)
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
      setHistory(h => push(h, { ...snapshot, activeLayerId: 'map', layerGrids: createLayerGrids(undefined, snapshot.grids), layers: [createDefaultLayer()] }))
      setActiveLayerId('map')
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

  const handleCommitRoomName = useCallback((moduleId: string, text: string) => {
    const labelId = `label-${moduleId}`
    setHistory(h => {
      const current = h.present.labels.find(label => label.id === labelId)
      if (!current || current.text === text) return h
      return push(h, { ...h.present, labels: updateLabel(h.present.labels, labelId, { text }) })
    })
  }, [])

  const handleCommitRoomDetails = useCallback((moduleId: string, details: string) => {
    const labelId = `label-${moduleId}`
    setHistory(h => {
      const current = h.present.labels.find(label => label.id === labelId)
      if (!current || current.details === details) return h
      return push(h, { ...h.present, labels: updateLabel(h.present.labels, labelId, { details }) })
    })
  }, [])

  const handleCommitGeneralNotes = useCallback((generalNotes: string[]) => {
    setGenerationResult(result => result?.space
      ? { ...result, space: { ...result.space, generalNotes } }
      : result)
  }, [])

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
      const loadedPresets = normalizeCustomStylePresets([...customStylePresets, ...save.customStylePresets])
      const loadedStyle: VisualStyle = {
        wallColor: save.wallColor, wallOpacity: save.wallOpacity, floorColor: save.floorColor,
        waterColor: save.waterColor, lavaColor: save.lavaColor, darknessColor: save.darknessColor,
        isoFaceColor: save.isoFaceColor, showGrid: save.showGrid, show3D: save.show3D,
        showHatching: save.showHatching, hatchColor: save.hatchColor,
        showWallOutline: save.showWallOutline, wallOutlineColor: save.wallOutlineColor,
        wallOutlineStyle: save.wallOutlineStyle, texture: save.textureSettings,
      }
      setSavedStyleSignature(styleSignature(loadedStyle, loadedPresets, save.lights, save.lightingSettings))
      setHistory(createHistory({ activeLayerId: save.activeLayerId, grids: save.grids, layerGrids: save.layerGrids, stamps: save.stamps, steps: save.steps, ramps: save.ramps, labels: save.labels, lights: save.lights, layers: save.layers, environmentalColors: save.environmentalColors }))
      setCustomImages(save.customImages)
      setActiveLayerId(save.activeLayerId)
      setActiveZ(save.layers.find(layer => layer.id === save.activeLayerId)?.targetZ ?? save.layers[0].targetZ)
      setGenerationResult(null)
      setCols(save.cols)
      setRows(save.rows)
      setTilesPerInch(normalizeTilesPerInch(save.tilesPerInch))
      setWallColor(save.wallColor)
      setWallOpacity(save.wallOpacity)
      dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: FLOOR, brushShape: save.brushShape } })
      setShowGrid(save.showGrid)
      setPlayerView(save.playerView)
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
      setTextureSettings(save.textureSettings)
      setLightingSettings(save.lightingSettings)
      setCustomStylePresets(loadedPresets)
      setSelectedStylePresetId(null)
      setLoadError(null)
      pendingFitRef.current = true
      setFitRequest(value => value + 1)
      setSavedHistoryLength(0)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load file')
    }
  }

  const handleCustomImageFile = (file: File, clientPoint?: { x: number; y: number }) => {
    setImageImportError(null)
    const extension = file.name.split('.').pop()?.toLowerCase()
    const inferredMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : ''
    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp']
    const mime = allowedMimes.includes(file.type) ? file.type : inferredMime || file.type
    if (!allowedMimes.includes(mime)) {
      setImageImportError('Choose a PNG, JPEG, or WebP image.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setImageImportError('Image files must be 20 MB or smaller.')
      return
    }
    if (activeLayer?.locked) {
      setImageImportError('Unlock the active layer before placing an image.')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setImageImportError(`Could not read ${file.name}. Try another image file.`)
    reader.onload = event => {
      const dataUrl = typeof event.target?.result === 'string' ? event.target.result : ''
      if (!dataUrl) {
        setImageImportError(`Could not read ${file.name}. Try another image file.`)
        return
      }
      const preview = new window.Image()
      preview.onerror = () => setImageImportError(`${file.name} is not a readable PNG, JPEG, or WebP image.`)
      preview.onload = () => {
        const aspectRatio = preview.naturalWidth / Math.max(1, preview.naturalHeight)
        const type = `custom-image-2x1-${crypto.randomUUID()}`
        const asset: CustomImageAsset = { type, name: file.name, dataUrl, aspectRatio }
        setCustomImages(previous => [...previous, asset])
        let tile = hoverTileRef.current
        const stage = stageRef.current
        if (clientPoint && stage) tile = showIso
          ? stageToIsoTile(stage, clientPoint.x, clientPoint.y)
          : stageToTile(stage, clientPoint.x, clientPoint.y)
        tile ??= { col: Math.floor(cols / 2), row: Math.floor(rows / 2) }
        const widthInCells = 2
        const heightInCells = widthInCells / aspectRatio
        const col = Math.max(0, Math.min(Math.max(0, cols - widthInCells), tile.col - 1))
        const row = Math.max(0, Math.min(Math.max(0, Math.floor(rows - heightInCells)), Math.round(tile.row - heightInCells / 2)))
        const stamp: Stamp = {
          id: crypto.randomUUID(), type, col, row, rotation: 0,
          z: activeLayer?.targetZ ?? activeZ,
          layerId: activeLayer?.id,
          assetName: file.name,
          aspectRatio,
        }
        setHistory(history => push(history, { ...history.present, stamps: addStamp(history.present.stamps, stamp) }))
        setActiveZ(activeLayer?.targetZ ?? activeZ)
        setSelectionMode(false)
        dispatch({ type: 'SET_TOOL', to: { tool: 'stamp', stampType: type, selectedId: stamp.id } })
      }
      preview.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const removeCustomImage = (type: string) => {
    const removedIds = new Set(stamps.filter(stamp => stamp.type === type).map(stamp => stamp.id))
    setCustomImages(previous => previous.filter(asset => asset.type !== type))
    setHistory(previous => {
      const withoutImage = (snapshot: AppSnapshot) => ({
        ...snapshot,
        stamps: snapshot.stamps.filter(stamp => stamp.type !== type),
      })
      return {
        past: previous.past.map(withoutImage),
        present: withoutImage(previous.present),
        future: [],
      }
    })
    setSavedHistoryLength(-1)
    setObjectSelection(previous => previous.filter(item => item.kind !== 'stamp' || !removedIds.has(item.id)))
    if (objectClipboardRef.current) {
      objectClipboardRef.current.stamps = objectClipboardRef.current.stamps.filter(stamp => stamp.type !== type)
    }
    if (drawingState.tool === 'stamp' && drawingState.stampType === type) {
      dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape } })
    }
  }

  const handleFileLoad = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => applyLoad(e.target?.result as string)
    reader.readAsText(file)
  }

  const applyExternalDungeonImport = (raw: unknown) => {
    setDungeonImportError(null)
    setDungeonImportNotice(null)
    try {
        const imported = importExternalDungeon(raw)
        const detail = imported.diagnostics.length ? `\n\nImport notes:\n${imported.diagnostics.join('\n')}` : ''
        const accepted = window.confirm(`Import ${imported.source} map (${imported.cols} × ${imported.rows} cells, ${imported.stamps.length} doors or stairs)? This replaces the current map.${detail}`)
        if (!accepted) return
        const layer: MapLayer = { ...createDefaultLayer(), name: 'Imported' }
        const nextGrid = imported.grid
        setHistory(createHistory({
          activeLayerId: layer.id,
          grids: new Map([[0, nextGrid]]),
          layerGrids: new Map([[layer.id, new Map([[0, nextGrid]])]]),
          stamps: imported.stamps,
          steps: [], ramps: [], labels: imported.labels,
          layers: [layer], environmentalColors: new Map(), lights: [],
        }))
        setCols(imported.cols)
        setRows(imported.rows)
        setActiveLayerId(layer.id)
        setActiveZ(0)
        activeZRef.current = 0
        setCustomImages([])
        setCurrentFilePath(null)
        setSavedHistoryLength(-1)
        setSelectionMode(false)
        setShapeTool(null)
        dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: FLOOR, brushShape } })
        setWorkspaceTab('draw')
        setDungeonImportNotice(`${imported.source} imported: ${imported.cols} × ${imported.rows} cells${imported.diagnostics.length ? ` · ${imported.diagnostics.join(' ')}` : ''}`)
        pendingFitRef.current = true
        setFitRequest(value => value + 1)
    } catch (error) {
      setDungeonImportError(error instanceof Error ? error.message : 'Could not import that dungeon JSON.')
    }
  }

  const handleDungeonImportFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setDungeonImportError('Dungeon JSON must be 10 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setDungeonImportError(`Could not read ${file.name}. Try another JSON export.`)
    reader.onload = event => {
      try { applyExternalDungeonImport(JSON.parse(String(event.target?.result ?? ''))) }
      catch (error) { setDungeonImportError(error instanceof Error ? error.message : 'Could not read that JSON file.') }
    }
    reader.readAsText(file)
  }

  const handleJsonDrop = (file: File) => {
    const reader = new FileReader()
    reader.onerror = () => setDungeonImportError(`Could not read ${file.name}.`)
    reader.onload = event => {
      const text = String(event.target?.result ?? '')
      try {
        const raw = JSON.parse(text) as Record<string, unknown>
        if (raw && raw.version === 1) applyLoad(text)
        else applyExternalDungeonImport(raw)
      } catch (error) {
        setDungeonImportError(error instanceof Error ? error.message : 'Could not import that JSON file.')
      }
    }
    reader.readAsText(file)
  }

  const applyPreset = (preset: typeof WALL_PRESETS[number]) => {
    setWallColor(preset.color)
    setWallOpacity(preset.opacity)
  }
  const saveStylePreset = (update: boolean) => {
    const name = stylePresetName.trim()
    if (!name) return
    if (update && selectedStylePresetId && customStylePresets.some(preset => preset.id === selectedStylePresetId)) {
      setCustomStylePresets(previous => previous.map(preset => preset.id === selectedStylePresetId ? { ...preset, name, style: captureVisualStyle() } : preset))
      return
    }
    const preset = { id: crypto.randomUUID(), name: name.slice(0, 48), style: captureVisualStyle() }
    setCustomStylePresets(previous => [...previous, preset])
    setSelectedStylePresetId(preset.id)
    setStylePresetName(preset.name)
  }
  const deleteStylePreset = (id: string) => {
    setCustomStylePresets(previous => previous.filter(preset => preset.id !== id))
    if (selectedStylePresetId === id) setSelectedStylePresetId(null)
  }

  const editingLabel = editingLabelId ? labels.find(label => label.id === editingLabelId) ?? null : null
  const editingItem = editingLabel && !showIso
    ? buildLabelScene([editingLabel], editingLabelId, TILE_PX)[0]
    : null
  const activateDrawingMode = () => {
    setSelectionMode(false)
    setObjectSelection([])
    setShapeTool(null)
    setShapeDraft(null)
    shapeDraftRef.current = null
    setLightPlacement(false)
    setCropMode(false)
  }
  const activatePaintSetting = () => {
    if (shapeTool !== 'path') activateDrawingMode()
  }
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
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={e => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (!file) return
        if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
          handleCustomImageFile(file, { x: e.clientX, y: e.clientY })
        } else if (/\.json$/i.test(file.name)) {
          handleJsonDrop(file)
        } else {
          setImageImportError('Drop a PNG, JPEG, WebP image, or JSON map file.')
        }
      }}
    >
      {/* Workspace inspector */}
      <aside className="toolbar" style={{ width: toolbarWidth, position: 'absolute', top: 12, left: 12, zIndex: 10, userSelect: 'none' }}>
        <header className="toolbar-title">
          <span className="brand-mark"><img src={torchAndTileLogo} alt="" aria-hidden="true" draggable={false} /></span>
          <span className="brand-copy">
            <strong>Torch &amp; Tile</strong>
            <small className="brand-tagline">From blank grid to deadly delve.</small>
            <small className="brand-document">{isDirty ? 'Unsaved changes' : documentName}</small>
          </span>
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
          <div className="panel-intro"><strong>Draw on the map</strong><span>Paint tiles, work across levels, then add paths, objects, and light.</span></div>

        <Section title="Draw" icon={<IconFloor size={14} />} defaultOpen>
          <Segmented
            value={shapeTool === 'path' ? 'path' : drawingState.tool === 'rough' ? 'cave' : brushShape}
            onChange={(s: BrushShape | 'cave' | 'path') => {
              if (s === 'path') {
                setShapeTool('path')
                setSelectionMode(false)
                setLightPlacement(false)
                setCropMode(false)
                setObjectSelection([])
                dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape } })
                return
              }
              activateDrawingMode()
              if (s === 'cave') {
                const ds = drawingState
                if (ds.tool === 'rough') {
                  if (ds.phase === 'placed2') {
                    setHistory(h => ({ ...h, present: withActiveLayerGrid(h.present, activeZ, ds.baseGrid) }))
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
              { value: 'path' as const, label: 'Path', icon: <IconFrame size={13} /> },
            ]}
          />
          <Segmented
            value={selectedPaintState === WALL ? 'erase' : 'draw'}
            onChange={(v: 'draw' | 'erase') => {
              activatePaintSetting()
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
                onChange={(v: TileState) => { activatePaintSetting(); dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: v, brushShape: brushShape } }) }}
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
                      onClick={() => { activatePaintSetting(); dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: env.value, brushShape: brushShape } }) }}
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
          {shapeTool === 'path' && <div className="hint">Drag a path. Return to its start to fill the enclosed area; release elsewhere for a line.</div>}
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

        <Section title="Lighting" icon={<IconFlame size={14} />}>
          <div className="button-row">
            <ToolButton
              icon={<IconFlame size={13} />}
              label={lightingSettings.enabled ? 'Lighting on' : 'Lighting off'}
              active={lightingSettings.enabled}
              onClick={() => setLightingSettings(previous => ({ ...previous, enabled: !previous.enabled }))}
            />
            <ToolButton
              icon={<IconPlus size={13} />}
              label="Place light"
              active={lightPlacement}
              onClick={() => {
                if (activeLayer?.locked) return
                setLightPlacement(value => !value)
                setShapeTool(null)
                setCropMode(false)
                setSelectionMode(false)
                setObjectSelection([])
              }}
            />
          </div>
          {lightingSettings.enabled && <div className="field-stack">
            <ColorField label="Ambient color" value={lightingSettings.ambientColor} onChange={ambientColor => setLightingSettings(previous => ({ ...previous, ambientColor }))} />
            <label className="field-row">
              <span>Darkness</span>
              <input aria-label="Ambient darkness" type="range" min={0} max={1} step={0.02} value={lightingSettings.darkness} onChange={e => setLightingSettings(previous => ({ ...previous, darkness: Number(e.target.value) }))} />
              <span className="label-dim">{Math.round(lightingSettings.darkness * 100)}%</span>
            </label>
            {lightPlacement && <div className="hint">Click a map tile to place a light. Escape cancels placement.</div>}
            <div className="field-stack">
              <span className="label-dim">Lights on Z{activeZ}</span>
              {visibleLights.filter(light => light.z === activeZ).map(light => (
                <ToolButton
                  key={light.id}
                  label={light.name}
                  active={selectedLightId === light.id}
                  onClick={() => { setSelectedLightId(light.id); setLightPlacement(false) }}
                  style={{ borderColor: light.color }}
                />
              ))}
              {visibleLights.every(light => light.z !== activeZ) && <div className="hint">No lights on this level yet.</div>}
            </div>
            {selectedLight && selectedLight.z === activeZ && (() => {
              const owner = layers.find(layer => layer.id === (selectedLight.layerId ?? createDefaultLayer().id))
              const locked = owner?.locked === true
              return <div className="field-stack">
                <label className="field-row"><span>Name</span><input aria-label="Light name" className="text-field" value={selectedLight.name} disabled={locked} onChange={e => updateLight(selectedLight.id, { name: e.target.value.slice(0, 48) })} /></label>
                <div style={{ opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : 'auto' }}><ColorField label="Light color" value={selectedLight.color} onChange={color => updateLight(selectedLight.id, { color })} /></div>
                <label className="field-row"><span>Intensity</span><input aria-label="Light intensity" type="range" min={0} max={1} step={0.05} value={selectedLight.intensity} disabled={locked} onChange={e => updateLight(selectedLight.id, { intensity: Number(e.target.value) })} /><span className="label-dim">{Math.round(selectedLight.intensity * 100)}%</span></label>
                <label className="field-row"><span>Bright radius</span><input aria-label="Bright radius" type="range" min={0} max={20} step={0.5} value={selectedLight.brightRadius} disabled={locked} onChange={e => {
                  const brightRadius = Number(e.target.value)
                  updateLight(selectedLight.id, { brightRadius, dimRadius: Math.max(brightRadius, selectedLight.dimRadius) })
                }} /><span className="label-dim">{selectedLight.brightRadius.toFixed(1)}</span></label>
                <label className="field-row"><span>Dim radius</span><input aria-label="Dim radius" type="range" min={selectedLight.brightRadius} max={30} step={0.5} value={selectedLight.dimRadius} disabled={locked} onChange={e => updateLight(selectedLight.id, { dimRadius: Math.max(selectedLight.brightRadius, Number(e.target.value)) })} /><span className="label-dim">{selectedLight.dimRadius.toFixed(1)}</span></label>
                <button className="btn btn-danger" disabled={locked} onClick={() => {
                  setHistory(h => push(h, { ...h.present, lights: (h.present.lights ?? []).filter(item => item.id !== selectedLight.id) }))
                  setSelectedLightId(null)
                }}>Delete light</button>
              </div>
            })()}
            <div className="hint">Walls block light in both projections. Universal VTT stores one range per light (the dim radius); bright/dim falloff stays in raster exports.</div>
          </div>}
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
          <div className="panel-intro"><strong>Place an asset</strong><span>Choose a library stamp or add an image stored with this map.</span></div>

        <Section title="Custom images" icon={<IconImage size={14} />} defaultOpen>
          <div className="row">
            <Btn onClick={() => imageInputRef.current?.click()}><IconImage size={13} /> Upload image</Btn>
            <span className="label-dim">PNG · JPEG · WebP</span>
          </div>
          {imageImportError && <div role="alert" className="hint" style={{ borderLeftColor: 'var(--danger)', color: '#e08b71' }}>{imageImportError}</div>}
          {customImages.length > 0 && <div className="field-stack">
            {customImages.map(asset => <div className="row" key={asset.type}>
              <button className="btn" style={{ flex: 1, textAlign: 'left' }} onClick={() => {
                setSelectionMode(false)
                dispatch({ type: 'SET_TOOL', to: { tool: 'stamp', stampType: asset.type, selectedId: null } })
              }}>{asset.name}</button>
              <button className="btn btn-danger" aria-label={`Remove ${asset.name}`} title={`Remove ${asset.name} and its placed copies`} onClick={() => removeCustomImage(asset.type)}>
                <IconTrash size={13} />
              </button>
            </div>)}
          </div>}
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleCustomImageFile(file)
            e.target.value = ''
          }} />
          <div className="hint">Images are embedded in the map file. Drag an image onto the canvas to place it at that spot.</div>
        </Section>

        <Section title="Stamps" icon={<IconStampFloor size={14} />} defaultOpen>
          <div className="row" style={{ marginBottom: 8 }}>
            <Btn onClick={handleOpenAssetFolder} title="Open the folder with floor and object assets"><IconFolder size={13} /> Open Asset Folder</Btn>
          </div>
          <ToolButton
            icon={<IconFrame size={14} />}
            label="Select objects"
            active={selectionMode}
            onClick={() => {
              setSelectionMode(active => !active)
              setShapeTool(null)
              setLightPlacement(false)
              setCropMode(false)
              setObjectSelection([])
              selectionDragRef.current = null
              setSelectionDrag(null)
            }}
          />
          {selectionMode && <div className="hint">Drag across visible objects on this level. Arrow keys move; Ctrl/Cmd+C/V copies and pastes; Ctrl/Cmd+D duplicates; Ctrl/Cmd+G groups; Ctrl/Cmd+Shift+G ungroups; Delete removes {objectSelection.length || 'the'} selected object{objectSelection.length === 1 ? '' : 's'}.</div>}
          {selectionMode && objectSelection.length > 0 && (
            <div className="field-stack">
              {objectSelection.length > 1 && (
                <Btn onClick={() => setHistory(h => push(h, { ...h.present, ...groupSelectedMapObjects({ ...h.present, selection: objectSelection, groupId: crypto.randomUUID() }) }))}>
                  <IconLayers size={13} /> Group selected
                </Btn>
              )}
              <Btn onClick={() => setHistory(h => push(h, { ...h.present, ...ungroupSelectedMapObjects({ ...h.present, selection: objectSelection }) }))}>
                <IconLayers size={13} /> Ungroup selected
              </Btn>
              <div className="button-row">
                <Btn onClick={() => setHistory(h => push(h, { ...h.present, ...reorderSelectedMapObjects({ ...h.present, selection: objectSelection, direction: 'backward' }) }))}>Send backward</Btn>
                <Btn onClick={() => setHistory(h => push(h, { ...h.present, ...reorderSelectedMapObjects({ ...h.present, selection: objectSelection, direction: 'forward' }) }))}>Bring forward</Btn>
              </div>
              <div className="hint">Draw order changes only within each object type; structures stay beneath stamps and labels stay above them.</div>
              <Btn onClick={() => setHistory(h => push(h, { ...h.present, ...rotateSelectedMapObjects({ ...h.present, selection: objectSelection }) }))}>
                <IconRotate size={13} /> Rotate selected
              </Btn>
              {selectedStamps.length > 0 && (
                <label className="field-row">
                  <span>Stamp scale</span>
                  <input aria-label="Selected stamp scale" type="range" min={0.5} max={4} step={0.25} value={selectedStampScale}
                    onChange={e => setHistory(h => push(h, { ...h.present, stamps: scaleSelectedStamps({ stamps: h.present.stamps, selection: objectSelection, scale: Number(e.target.value) }) }))} />
                </label>
              )}
            </div>
          )}
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
              <div className="field-row">
                <div className="field-label-with-tooltip">
                  <label htmlFor="generation-style">Layout</label>
                  <button type="button" className="tooltip-trigger" aria-label="Layout information" aria-describedby="layout-tooltip">
                    <IconInfo size={12} />
                  </button>
                  <span id="layout-tooltip" className="tooltip-content" role="tooltip">
                    Spine: a linear Start-to-Goal path with loops returning to the main route. Hub: a central start with room spokes and loops returning to it. Branches: routes split from a room chain and merge at explicit junctions.
                  </span>
                </div>
                <select id="generation-style" className="num-field" value={generationStyle} onChange={e => setGenerationStyle(e.target.value as GenerationStyle)} aria-label="Generation style">
                  <option value="spine-shortcuts">Spine</option>
                  <option value="orbit-gates">Hub</option>
                  <option value="cavern-pressure">Branches</option>
                </select>
              </div>
              <div className="field-row">
                <div className="field-label-with-tooltip">
                  <label htmlFor="generation-complexity">Complexity</label>
                  <button type="button" className="tooltip-trigger" aria-label="Layout complexity information" aria-describedby="layout-complexity-tooltip">
                    <IconInfo size={12} />
                  </button>
                  <span id="layout-complexity-tooltip" className="tooltip-content" role="tooltip">
                    Compact uses fewer rooms and branches. Standard balances space and variety. Dense packs in more rooms, branches, and challenges.
                  </span>
                </div>
                <select id="generation-complexity" className="num-field" value={generationComplexity} onChange={e => setGenerationComplexity(e.target.value as ComplexityPreset)} aria-label="Complexity preset">
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="dense">Dense</option>
                </select>
              </div>
              <div className="field-row">
                <div className="field-label-with-tooltip">
                  <label htmlFor="generation-dungeon-level">Dungeon level</label>
                  <button type="button" className="tooltip-trigger" aria-label="Dungeon level information" aria-describedby="dungeon-level-tooltip">
                    <IconInfo size={12} />
                  </button>
                  <span id="dungeon-level-tooltip" className="tooltip-content" role="tooltip">
                    Sets the monster levels and the total encounter and dungeon budgets.
                  </span>
                </div>
                <select id="generation-dungeon-level" className="num-field" value={generationDungeonLevel} onChange={e => setGenerationDungeonLevel(Number(e.target.value))} aria-label="Dungeon level">
                  {DUNGEON_LEVEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="field-row">
                <span>Shadowdark Core magic items</span>
                <button
                  type="button"
                  className={`btn${generationShadowdarkCoreMagicItems ? ' btn-primary' : ''}`}
                  aria-label="Shadowdark Core magic items"
                  aria-pressed={generationShadowdarkCoreMagicItems}
                  onClick={() => setGenerationShadowdarkCoreMagicItems(value => !value)}
                >
                  {generationShadowdarkCoreMagicItems ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Loops & challenges" icon={<IconRotate size={14} />} defaultOpen>
            <div className="field-stack">
              <label className="field-row" htmlFor="generation-loop-count">
                <span>Number of loops</span>
                <input id="generation-loop-count" className="num-field loop-count-field" type="number" min={0} max={20} step={1} value={generationLoopCount} onChange={e => setRequestedLoopCount(Number(e.target.value))} aria-label="Number of loops" />
              </label>
              {generationLoopChallenges.slice(0, generationLoopCount).map((challenge, index) => {
                const selectedChallenge = challenge ?? 'varied'
                const tooltipId = `loop-challenge-${index}-tooltip`
                return (
                  <div className="field-row" key={`loop-challenge-${index}`}>
                    <div className="field-label-with-tooltip">
                      <label htmlFor={`generation-loop-challenge-${index}`}>Loop {index + 1}</label>
                      <button type="button" className="tooltip-trigger" aria-label={`Loop ${index + 1} description`} aria-describedby={tooltipId}>
                        <IconInfo size={12} />
                      </button>
                      <span id={tooltipId} className="tooltip-content" role="tooltip" data-testid={tooltipId}>
                        <strong>{selectedChallenge === 'varied' ? 'Random' : formatLoopChallenge(selectedChallenge)}</strong> — {LOOP_CHALLENGE_DESCRIPTIONS[selectedChallenge]}
                      </span>
                    </div>
                    <select id={`generation-loop-challenge-${index}`} className="num-field" value={selectedChallenge} title={LOOP_CHALLENGE_DESCRIPTIONS[selectedChallenge]} onChange={e => setGenerationLoopChallenges(previous => previous.map((current, itemIndex) => itemIndex === index ? e.target.value as LoopPreference : current))} aria-label={`Loop ${index + 1} challenge`}>
                      <option value="varied" title={LOOP_CHALLENGE_DESCRIPTIONS.varied}>Random</option>
                      {ALL_LOOP_CHALLENGES.map(option => <option key={option} value={option} title={LOOP_CHALLENGE_DESCRIPTIONS[option]}>{formatLoopChallenge(option)}</option>)}
                    </select>
                  </div>
                )
              })}
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
              <div>Monster levels {generationLevelBudget.monsterLevelLabel} · {generationLevelBudget.encounterBudget}-level encounters · {generationLevelBudget.dungeonBudget}-level dungeon</div>
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
                {generationResult.summary.mission.loopChallenges.length > 0 && (
                  <span>
                    {generationResult.summary.mission.loopChallenges.map((loop, index) => (
                      <span key={loop.cycleId}>{index > 0 ? ' · ' : ''}Loop {index + 1}: {formatLoopChallenge(loop.challenge)}</span>
                    ))}
                  </span>
                )}
                {generationResult.ok && generationResult.space && (() => {
                  const plan = generationResult.space.treasurePlan
                  const generatedGoldGp = plan.finds.reduce((total, find) => total + (find.gp ?? 0), 0)
                  const magicItemValueGp = plan.finds.reduce(
                    (total, find) => total + (find.magicItems ?? []).reduce((itemTotal, item) => itemTotal + (item.valueGp ?? 0), 0),
                    0,
                  )
                  const generatedGp = generatedGoldGp + magicItemValueGp
                  const magicItemCount = plan.finds.reduce((total, find) => total + (find.magicItems?.length ?? 0), 0)
                  const tierLabels = [
                    { tier: 'poor', label: 'Poor' },
                    { tier: 'normal', label: 'Normal' },
                    { tier: 'fabulous', label: 'Fabulous' },
                    { tier: 'legend', label: 'Legend' },
                  ] as const

                  return (
                    <section className="treasure-summary" aria-label="Generated treasure plan">
                      <div className="treasure-summary-heading">
                        <strong>Treasure allocation</strong>
                        <span>Level {plan.levelLabel} · Budget: {generatedGp} / {plan.gpTotal} gp ({generatedGoldGp} gp + {magicItemValueGp} gp in magic items) · {magicItemCount} magic item{magicItemCount === 1 ? '' : 's'}</span>
                      </div>
                      <div className="treasure-tier-counts" aria-label="Treasure finds by tier">
                        {tierLabels.map(({ tier, label }) => (
                          <span className="treasure-tier-count" key={tier}>
                            <strong>{plan.finds.filter(find => find.tier === tier).length}</strong>
                            <span>{label}</span>
                          </span>
                        ))}
                      </div>
                      <ul className="treasure-find-list">
                        {plan.finds.map(find => {
                          const module = generationResult.space!.modules.find(candidate => candidate.id === find.moduleId)
                          const roomLabel = labels.find(label => label.id === `label-${find.moduleId}`)
                          const missionNode = module?.missionNodeId
                            ? generationResult.mission.nodes.find(node => node.id === module.missionNodeId)
                            : undefined
                          const roomName = roomLabel?.text ?? missionNode?.label ?? (module?.type === 'hub' ? 'Hub' : 'Room')
                          const value = find.magicItems?.length
                            ? find.magicItems.map(item => `${item.name} (${item.strength}, ${item.valueGp ?? 0} gp)`).join(', ')
                            : `${find.gp ?? 0} gp`
                          const note = find.magicItemUnavailable
                            ? ' · no item source'
                            : find.magicItemPossible && !find.magicItems?.length
                              ? ' · rolled as GP'
                              : ''

                          return (
                            <li className={`treasure-find-row tier-${find.tier}`} key={find.id}>
                              <span className="treasure-find-tier">{find.tier}</span>
                              <span className="treasure-find-room">{roomName}</span>
                              <span className="treasure-find-value">{value}{note}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })()}
                {generationResult.failedAttempts.length > 0 && (
                  <details><summary>Rejected attempts</summary>{generationResult.failedAttempts.map((attempt, index) => <div key={`${attempt.code}-${index}`}>{attempt.message}</div>)}</details>
                )}
                <details>
                  <summary>Mission &amp; space inspector</summary>
                  <div>{generationResult.summary.mission.patterns} patterns → {generationResult.summary.mission.nodes} primitive nodes</div>
                  {generationResult.summary.mission.pairings.map(pairing => <div key={pairing.keyId}>{pairing.keyId} → {pairing.lockIds.length ? pairing.lockIds.join(', ') : 'optional'}</div>)}
                  {generationResult.summary.mission.loopChallenges.map(loop => <div key={loop.cycleId}>{loop.cycleId}: {formatLoopChallenge(loop.challenge)} · {loop.realization}</div>)}
                  <div>{generationResult.summary.space.realization}</div>
                </details>
              </div>
            )}
          </Section>
        </div>

        <div className="workspace-panel" role="tabpanel" hidden={workspaceTab !== 'document'}>
          <div className="panel-intro"><strong>File</strong><span>Manage the map, page size, and exports.</span></div>

        <Section title="Map file" icon={<IconSave size={14} />} defaultOpen>
          <div className="row file-action-row">
            <Btn onClick={handleSave}><IconSave size={13} /> Save</Btn>
            <Btn onClick={() => fileInputRef.current?.click()}><IconFolder size={13} /> Load</Btn>
          </div>
          {loadError && <div role="alert" className="hint" style={{ borderLeftColor: 'var(--danger)', color: '#e08b71' }}>{loadError}</div>}
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

        </Section>

        <Section title="Export map" icon={<IconImage size={14} />} defaultOpen>
          <ToolButton icon={<IconHash size={14} />} label="Player view" active={playerView} onClick={() => setPlayerView(value => !value)} />
          <div className="hint">{playerView ? 'Room numbers, trap, hazard and chest icons hidden; secret doors become walls; locked doors become regular doors' : 'Room numbers, trap, hazard and chest icons visible; secret and locked doors shown'}</div>
          <label className="field-row"><span>Format</span><select aria-label="Export format" className="num-field" value={exportFormat} onChange={e => setExportFormat(e.target.value as MapExportFormat)}>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
            <option value="jpg">JPG (white background)</option>
            <option value="uvtt">Universal VTT (.dd2vtt)</option>
          </select></label>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleExport}>
            <IconImage size={13} /> Export {exportFormat === 'uvtt' ? 'Universal VTT' : exportFormat.toUpperCase()}
          </button>
          {exportError && <div role="alert" className="hint" style={{ borderLeftColor: 'var(--danger)', color: '#e08b71' }}>{exportError}</div>}

          <details className="file-options">
            <summary>Region &amp; resolution</summary>
            <div className="field-stack">
              <ToolButton
                icon={<IconFrame size={14} />}
                label={cropMode ? 'Finish crop selection' : 'Select crop region'}
                active={cropMode}
                onClick={() => {
                  setCropMode(value => !value)
                  setObjectSelection([])
                  setSelectionMode(false)
                  cropDragRef.current = null
                  setCropDrag(null)
                }}
              />
              {cropMode && <div className="hint">Drag over the map to choose bounds, or drag a marked corner to resize. Right-click resets the crop.</div>}
              <label className="field-row"><span>Pixels per cell</span><input aria-label="Export pixels per cell" className="num-field" type="number" min={16} max={600} value={exportPixelsPerCell} onChange={e => setExportPixelsPerCell(Math.max(16, Math.min(600, Number(e.target.value) || 75)))} /></label>
              <div className="hint">{(() => { const region = normalizeExportRegion(exportRegion, cols, rows); const size = showIso ? exportCropRect(region, exportPixelsPerCell, 'iso', rows) : exportDimensions(region, exportPixelsPerCell); return `${Math.round(size.width)} × ${Math.round(size.height)}px output` })()}</div>
              <Btn onClick={() => { setExportRegion(wholeMapRegion(cols, rows)); setCropMode(false); cropDragRef.current = null; setCropDrag(null) }}>Reset crop to full map</Btn>
            </div>
          </details>

          <div className="subsection-label">Document exports</div>
          <div className="row file-action-row">
            <Btn onClick={handleExportHtml}>Export HTML</Btn>
            <Btn onClick={handleExportMarkdown}>Export MD</Btn>
          </div>
        </Section>

        <Section title="Import dungeon" icon={<IconFolder size={14} />}>
          <Btn onClick={() => dungeonInputRef.current?.click()}><IconFolder size={13} /> Choose dungeon JSON</Btn>
          <input ref={dungeonInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleDungeonImportFile(file)
            e.target.value = ''
          }} />
          {dungeonImportError && <div role="alert" className="hint" style={{ borderLeftColor: 'var(--danger)', color: '#e08b71' }}>{dungeonImportError}</div>}
          {dungeonImportNotice && <div role="status" className="hint">{dungeonImportNotice}</div>}
          <div className="hint">Accepts Watabou One Page Dungeon JSON with room/corridor geometry and donjon Random Dungeon JSON cell matrices. Import replaces the open map after confirmation.</div>
        </Section>

        <Section title="Styles" icon={<IconHatch size={14} />}>
          <div className="field-stack">
            {[...BUILT_IN_STYLE_PRESETS, ...customStylePresets].map(preset => (
              <div key={preset.id} className="row">
                <div style={{ flex: 1 }}><ToolButton label={preset.name} active={selectedStylePresetId === preset.id} onClick={() => applyStylePreset(preset)} /></div>
                {customStylePresets.some(candidate => candidate.id === preset.id) && <Btn variant="danger" onClick={() => deleteStylePreset(preset.id)}>Delete</Btn>}
              </div>
            ))}
            <label className="field-row">
              <span>Preset name</span>
              <input className="text-field" aria-label="Style preset name" maxLength={48} value={stylePresetName} onChange={e => setStylePresetName(e.target.value)} />
            </label>
            <div className="row">
              <Btn onClick={() => saveStylePreset(false)}>Save as new</Btn>
              {customStylePresets.some(preset => preset.id === selectedStylePresetId) && <Btn onClick={() => saveStylePreset(true)}>Update selected</Btn>}
            </div>
            <div className="hint">Styles capture wall and floor colors, grid, shading, hatching, outlines, and texture. Applying one is undoable with Ctrl/Cmd+Z.</div>
          </div>
        </Section>

        <Section title="Appearance" icon={<IconHatch size={14} />}>
          <div className="subsection-label">Texture overlay</div>
          <div className="field-stack">
            <label className="field-row"><span>Pattern</span><select aria-label="Texture pattern" className="num-field" value={textureSettings.pattern} onChange={e => setTextureSettings(previous => ({ ...previous, pattern: e.target.value as TextureSettings['pattern'] }))}>
              <option value="none">None</option><option value="dots">Dots</option><option value="diagonal">Diagonal</option><option value="crosshatch">Crosshatch</option>
            </select></label>
            {textureSettings.pattern !== 'none' && <>
              <label className="field-row"><span>Scope</span><select aria-label="Texture scope" className="num-field" value={textureSettings.scope} onChange={e => setTextureSettings(previous => ({ ...previous, scope: e.target.value as TextureSettings['scope'] }))}>
                <option value="map">Visible map content</option><option value="active-layer">Active layer</option>
              </select></label>
              <label className="field-row"><span>Scale</span><input aria-label="Texture scale" type="range" min={0.25} max={4} step={0.25} value={textureSettings.scale} onChange={e => setTextureSettings(previous => ({ ...previous, scale: Number(e.target.value) }))} /><span className="label-dim">{textureSettings.scale}×</span></label>
              <label className="field-row"><span>Opacity</span><input aria-label="Texture opacity" type="range" min={0} max={100} value={textureSettings.opacity} onChange={e => setTextureSettings(previous => ({ ...previous, opacity: Number(e.target.value) }))} /><span className="label-dim">{textureSettings.opacity}%</span></label>
              <ColorField label="Texture color" value={textureSettings.color} onChange={color => setTextureSettings(previous => ({ ...previous, color }))} />
            </>}
            <div className="hint">Scale is spacing in cell multiples. Texture is clipped to floor cells and appears in Player View and raster exports.</div>
          </div>

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

      <div className="map-reference-controls">
        {generationResult?.ok && generationResult.space && (
          <RoomLedger
            key={generationResult.summary.seed}
            modules={generationResult.space.modules}
            mission={generationResult.mission}
            labels={labels}
            generalNotes={generationResult.space.generalNotes}
            onCommitGeneralNotes={handleCommitGeneralNotes}
            onCommitRoomName={handleCommitRoomName}
            onCommitRoomDetails={handleCommitRoomDetails}
          />
        )}
        <MapLegend />
      </div>
      <div className="canvas-status" aria-live="polite">
        <strong>{cropMode ? 'Export crop' : shapeDraft?.tool === 'path' || shapeTool === 'path' ? 'Path' : shapeDraft?.tool ?? (shapeTool ? `Shape: ${shapeTool}` : selectionMode ? 'Select' : drawingState.tool === 'paint' ? 'Paint' : drawingState.tool === 'rough' ? 'Cave' : drawingState.tool === 'stamp' ? 'Stamp' : drawingState.tool === 'steps' ? 'Steps' : drawingState.tool === 'ramps' ? 'Ramp' : 'Label')}</strong>
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
        style={{ cursor: cropMode || shapeTool || lightPlacement || selectionMode || drawingState.tool === 'paint' || drawingState.tool === 'rough' ? 'crosshair' : 'cell' }}
      >
        <Layer ref={layerRef} />
        <Layer ref={stampLayerRef} />
        <Layer ref={lightingLayerRef} listening={false} />
        <Layer ref={lightMarkersLayerRef} />
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
