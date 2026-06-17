import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { DARKNESS_COLOR, DEFAULT_COLS, DEFAULT_ROWS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, LAVA_COLOR, TILE_PX, TILES_PER_INCH, WALL, WATER, WATER_COLOR, type TileState } from './constants'
import { isoUnproject } from './iso'
import { buildIsoScene } from './isoScene'
import { deriveFaceColors } from './faceColors'
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles, getGrid, setGrid } from './grid'
import { createHistory, push, redo, undo, type History } from './history'
import { serialize, deserialize } from './serialization'
import {
  addStamp, isObjectStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
import { addStepRun, removeStepRun, rotateStepRun, type StepRun } from './steps'
import { addRampRun, removeRampRun, rotateRampRun, type RampRun } from './ramps'
import { addLabel, removeLabel, updateLabel, type Label } from './labels'
import { drawShadow } from './patterns'
import { useStampImages } from './hooks/useStampImages'
import { buildExportShapes } from './exportShapes'
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
  IconSquareBrush, IconCircleBrush, IconFloor, IconDroplet, IconEraser, IconCave,
  IconStairs, IconRamp, IconRotate, IconMirror, IconTag, IconHatch, IconFrame,
  IconStampFloor, IconSave, IconFolder, IconImage,
} from './ui/icons'

const GHOST_COLOR = 'rgba(255,255,100,0.45)'
const DOT_RADIUS = 2

const WALL_PRESETS = [
  { label: 'Black', color: '#000000', opacity: 1 },
  { label: 'Repro Blue', color: '#A8C8E8', opacity: 1 },
  { label: 'Transparent', color: '#000000', opacity: 0 },
]

type AppSnapshot = { grids: Map<number, Uint8Array>; stamps: Stamp[]; steps: StepRun[]; ramps: RampRun[]; labels: Label[] }

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
    createHistory({ grids: new Map([[0, createGrid(DEFAULT_COLS, DEFAULT_ROWS)]]), stamps: [], steps: [], ramps: [], labels: [] }),
  )
  const { grids, stamps, steps, ramps, labels } = history.present
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [rows, setRows] = useState(DEFAULT_ROWS)

  const [drawingState, dispatch] = useReducer(drawingReducer, INITIAL_DRAWING_STATE)
  const drawingStateRef = useRef<DrawingState>(INITIAL_DRAWING_STATE)
  useEffect(() => { drawingStateRef.current = drawingState }, [drawingState])

  const gridsRef = useRef(grids)
  useEffect(() => { gridsRef.current = grids }, [grids])

  // Derived values from DrawingState — keep render code and layer effects clean
  const brushShape: BrushShape = drawingState.tool === 'paint' ? drawingState.brushShape : 'square'
  const selectedPaintState: TileState = drawingState.tool === 'paint'
    ? (drawingState.phase === 'idle' ? drawingState.paintValue : drawingState.idlePaintValue)
    : FLOOR
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
  const [loadError, setLoadError] = useState<string | null>(null)

  const stageRef = useRef<Konva.Stage>(null)
  const pendingFitRef = useRef(false)
  const layerRef = useRef<Konva.Layer>(null)
  const stampLayerRef = useRef<Konva.Layer>(null)
  const dotLayerRef = useRef<Konva.Layer>(null)
  const labelsLayerRef = useRef<Konva.Layer>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stampImages = useStampImages()

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      setSize({ w: window.innerWidth, h: window.innerHeight })
    })
    obs.observe(document.body)
    return () => obs.disconnect()
  }, [])

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

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1) {
        e.evt.preventDefault()
        isPanningRef.current = true
        panLastRef.current = { x: e.evt.clientX, y: e.evt.clientY }
        return
      }
      const ds = drawingStateRef.current
      if (showIso && (ds.tool === 'paint' || ds.tool === 'rough')) return
      const stage = e.target.getStage()!
      let tile: Tile | null
      if (showIso) {
        const rect = stage.container().getBoundingClientRect()
        const scale = stage.scaleX()
        const worldX = (e.evt.clientX - rect.left - stage.x()) / scale
        const worldY = (e.evt.clientY - rect.top - stage.y()) / scale
        const { col: fc, row: fr } = isoUnproject(worldX, worldY, TILE_PX * 2, TILE_PX)
        const col = Math.floor(fc)
        const row = Math.floor(fr)
        tile = (col >= 0 && row >= 0 && col < cols && row < rows) ? { col, row } : null
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
        return
      }

      if (ds.tool === 'steps') {
        const newRun: StepRun = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          z: activeZRef.current,
          direction: 'E',
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
    [cols, rows, showIso],
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
      if (showIso) return
      const stage = e.target.getStage()!
      const tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      setHoverTile(tile)
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
        const endWorldX = rEnd.col * TILE_PX + TILE_PX / 2
        const endWorldY = rEnd.row * TILE_PX + TILE_PX / 2
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
  }, [cols, rows])

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
  }, [cols, rows, fitView])

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
        waterColor: WATER_COLOR, lavaColor: LAVA_COLOR, darknessColor: DARKNESS_COLOR,
      })
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
          const sid = shape.stepId
          node.on('mousedown', (e) => {
            e.cancelBubble = true
            if (e.evt.button === 2 && sid === selectedStepId) {
              setHistory(h => push(h, { ...h.present, steps: removeStepRun(h.present.steps, sid) }))
              dispatch({ type: 'SELECT', id: null })
            } else {
              dispatch({ type: 'SET_TOOL', to: { tool: 'steps', selectedId: sid } })
            }
          })
        }
        if (shape.rampId) {
          const rid = shape.rampId
          node.on('mousedown', (e) => {
            e.cancelBubble = true
            if (e.evt.button === 2 && rid === selectedRampId) {
              setHistory(h => push(h, { ...h.present, ramps: removeRampRun(h.present.ramps, rid) }))
              dispatch({ type: 'SELECT', id: null })
            } else {
              dispatch({ type: 'SET_TOOL', to: { tool: 'ramps', selectedId: rid } })
            }
          })
        }
        layer.add(node)
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
      waterColor: WATER_COLOR, lavaColor: LAVA_COLOR, darknessColor: DARKNESS_COLOR,
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

      // Directional shadows — cast only from north/west walls onto floor tiles
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

      // Steps/ramps belong to their level's group so they fade with it and
      // stay under higher-level floors.
      for (const run of level.runs) {
        const runGroup = new Konva.Group()
        if (run.faceRect) {
          runGroup.add(new Konva.Rect({ x: run.faceRect.x, y: run.faceRect.y, width: run.faceRect.w, height: run.faceRect.h, fill: FACE_COLOR }))
        }
        for (const fp of run.footprint) {
          runGroup.add(new Konva.Rect({
            x: fp.x, y: fp.y, width: fp.w, height: fp.h,
            fill: FLOOR_COLOR, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1,
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
            const currentSelectedId = isStep ? selectedStepId : selectedRampId
            if (e.evt.button === 2 && run.id === currentSelectedId) {
              setHistory(h => push(h, isStep
                ? { ...h.present, steps: removeStepRun(h.present.steps, run.id) }
                : { ...h.present, ramps: removeRampRun(h.present.ramps, run.id) }))
              dispatch({ type: 'SELECT', id: null })
            } else {
              dispatch({ type: 'SET_TOOL', to: isStep ? { tool: 'steps', selectedId: run.id } : { tool: 'ramps', selectedId: run.id } })
            }
          })
        }
        group.add(runGroup)
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

      layer.add(group)
    }

    layer.batchDraw()
  }, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle])

  // Stamp layer
  useEffect(() => {
    const layer = stampLayerRef.current
    if (!layer || !stampImages) return
    layer.destroyChildren()

    const items = buildStampScene({ stamps, selectedStampId, stampImages, activeZ, tilePx: TILE_PX, showIso })

    for (const item of items) {
      const stamp = stamps.find(s => s.id === item.id)!
      const imgEl = stampImages.get(stamp.type)!
      const v = item.variant

      const attachDelete = (node: Konva.Node) => {
        node.on('mousedown', (e) => {
          e.cancelBubble = true
          if (e.evt.button === 2 && item.id === selectedStampId) {
            setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, item.id) }))
            dispatch({ type: 'SELECT', id: null })
          } else {
            dispatch({ type: 'SET_TOOL', to: { tool: 'stamp', stampType: stamp.type, selectedId: item.id } })
          }
        })
      }

      if (v.kind === 'isoBillboard') {
        const imgNode = new Konva.Image({
          image: imgEl,
          x: v.x, y: v.y,
          width: v.w, height: v.h,
          offsetX: v.w / 2, offsetY: v.h / 2,
          rotation: v.rotation,
          scaleX: v.mirrored ? -1 : 1,
        })
        attachDelete(imgNode)
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
        group.add(new Konva.Image({ image: imgEl, x: -v.w / 2, y: -v.h / 2, width: v.w, height: v.h }))
        attachDelete(group)
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
          image: imgEl,
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
          attachDelete(node)
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

    if (showIso) {
      layer.batchDraw()
      return
    }

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
              layer.add(new Konva.Circle({
                x: c * TILE_PX + TILE_PX,
                y: r * TILE_PX + TILE_PX,
                radius: DOT_RADIUS,
                fill: dotColor,
              }))
            }
          }
        }
      }
    }

    const ghostFill = selectedPaintState === WATER ? 'rgba(107,174,214,0.45)' : GHOST_COLOR
    for (const t of ghostTiles) {
      if (t.col < 0 || t.row < 0 || t.col >= cols || t.row >= rows) continue
      layer.add(new Konva.Rect({
        x: t.col * TILE_PX, y: t.row * TILE_PX,
        width: TILE_PX, height: TILE_PX,
        fill: ghostFill,
      }))
    }

    // Rough mode: anchor dot + ghost rect preview during placed1
    if (roughStart && roughPhase !== 'idle') {
      layer.add(new Konva.Circle({
        x: roughStart.col * TILE_PX + TILE_PX / 2,
        y: roughStart.row * TILE_PX + TILE_PX / 2,
        radius: 4,
        fill: '#ff8800',
      }))
    }
    if (roughStart && roughEnd && roughPhase === 'placed1') {
      const minC = Math.min(roughStart.col, roughEnd.col)
      const maxC = Math.max(roughStart.col, roughEnd.col)
      const minR = Math.min(roughStart.row, roughEnd.row)
      const maxR = Math.max(roughStart.row, roughEnd.row)
      layer.add(new Konva.Rect({
        x: minC * TILE_PX, y: minR * TILE_PX,
        width: (maxC - minC + 1) * TILE_PX,
        height: (maxR - minR + 1) * TILE_PX,
        fill: GHOST_COLOR,
        listening: false,
      }))
    }

    // Rough mode: noise preview overlay (tiles to be removed)
    for (const flip of roughPreview) {
      if (flip.col < 0 || flip.row < 0 || flip.col >= cols || flip.row >= rows) continue
      layer.add(new Konva.Rect({
        x: flip.col * TILE_PX, y: flip.row * TILE_PX,
        width: TILE_PX, height: TILE_PX,
        fill: 'rgba(255,80,0,0.45)',
      }))
    }

    layer.batchDraw()
  }, [grids, activeZ, activeGrid, ghostTiles, cols, rows, wallColor, wallOpacity, roughStart, roughEnd, roughPhase, roughPreview, showIso, selectedPaintState])

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
        fill: '#000',
        align: 'center',
      })
      textNode.on('mousedown', (e) => {
        e.cancelBubble = true
        const ds = drawingStateRef.current
        if (e.evt.button === 2 && ds.tool === 'label' && ds.phase === 'idle' && ds.selectedId === item.id) {
          setHistory(h => push(h, { ...h.present, labels: removeLabel(h.present.labels, item.id) }))
          dispatch({ type: 'SELECT', id: null })
        } else {
          dispatch({ type: 'SET_TOOL', to: { tool: 'label', phase: 'idle', selectedId: item.id } })
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
  }, [labels, showIso, selectedLabelId])

  useEffect(() => { activeZRef.current = activeZ }, [activeZ])

  useEffect(() => { setShow3D(showIso) }, [showIso])

  const handleWidthChange = (inches: number) => {
    if (!Number.isFinite(inches) || inches < 1 || inches > 36) return
    const newCols = Math.round(inches * TILES_PER_INCH)
    if (newCols === cols) return
    setHistory(h => {
      const newGrids = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        newGrids.set(z, resizeGrid(g, cols, rows, newCols, rows))
      }
      return createHistory({ grids: newGrids, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels })
    })
    setCols(newCols)
  }

  const handleHeightChange = (inches: number) => {
    if (!Number.isFinite(inches) || inches < 1 || inches > 36) return
    const newRows = Math.round(inches * TILES_PER_INCH)
    if (newRows === rows) return
    setHistory(h => {
      const newGrids = new Map<number, Uint8Array>()
      for (const [z, g] of h.present.grids) {
        newGrids.set(z, resizeGrid(g, cols, rows, cols, newRows))
      }
      return createHistory({ grids: newGrids, stamps: h.present.stamps, steps: h.present.steps, ramps: h.present.ramps, labels: h.present.labels })
    })
    setRows(newRows)
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
      exportTile: 60,
      waterColor: WATER_COLOR,
      lavaColor: LAVA_COLOR,
      darknessColor: DARKNESS_COLOR,
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
            group.add(new Konva.Image({ image: imgEl, x: -shape.w / 2, y: -shape.h / 2, width: shape.w, height: shape.h }))
            offLayer.add(group)
          } else {
            offLayer.add(new Konva.Image({
              image: imgEl,
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

    offLayer.batchDraw()
    offStage.toDataURL({
      mimeType: 'image/png',
      callback: (dataUrl: string) => {
        document.body.removeChild(container)
        offStage.destroy()
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const a = document.createElement('a')
        a.download = `dungeon-map-${ts}.png`
        a.href = dataUrl
        a.click()
      },
    })
  }, [activeGrid, activeZ, stamps, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, stampImages, isoFaceColor, showHatching, hatchColor])

  const handleSave = () => {
    const save = serialize({ grids, cols, rows, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, stamps, steps, ramps, labels })
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dungeon-map.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyLoad = (text: string) => {
    try {
      const save = deserialize(JSON.parse(text))
      setHistory(createHistory({ grids: save.grids, stamps: save.stamps, steps: save.steps, ramps: save.ramps, labels: save.labels }))
      setCols(save.cols)
      setRows(save.rows)
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
      setLoadError(null)
      pendingFitRef.current = true
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
      {/* Toolbar */}
      <div className="toolbar" style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, userSelect: 'none' }}>
        <div className="toolbar-title"><IconCompass size={15} /> Map Draw</div>

        <Section title="Level & View" icon={<IconLayers size={14} />} defaultOpen>
          <div className="stepper">
            <button onClick={() => setActiveZ(z => z - 1)}><IconMinus size={13} /></button>
            <span className="z-value">Z{activeZ}</span>
            <button onClick={() => setActiveZ(z => z + 1)}><IconPlus size={13} /></button>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <ToolButton icon={<IconHash size={14} />} label="Grid" active={showGrid} onClick={() => setShowGrid(v => !v)} />
            </div>
            <div style={{ flex: 1 }}>
              <ToolButton icon={<IconCube size={14} />} label="Iso" tone="iso" active={showIso} onClick={() => setShowIso(v => !v)} />
            </div>
          </div>
          {showIso && <div className="hint" style={{ borderLeftColor: 'var(--iso)', color: 'var(--iso)' }}>Preview only — drawing disabled</div>}
        </Section>

        <Section title="Draw" icon={<IconFloor size={14} />} defaultOpen>
          <Segmented
            value={brushShape}
            onChange={(s: BrushShape) => dispatch({ type: 'SET_TOOL', to: { tool: 'paint', phase: 'idle', paintValue: selectedPaintState, brushShape: s } })}
            options={[
              { value: 'square', label: 'Square', icon: <IconSquareBrush size={13} /> },
              { value: 'circle', label: 'Circle', icon: <IconCircleBrush size={13} /> },
            ]}
          />
          <Segmented
            value={selectedPaintState}
            onChange={(v: TileState) => dispatch({ type: 'PAINT_SET_VALUE', paintValue: v })}
            tones={{ [WATER]: 'water', [WALL]: 'erase' } as Partial<Record<TileState, 'water' | 'erase'>>}
            options={[
              { value: FLOOR as TileState, label: 'Floor', icon: <IconFloor size={13} /> },
              { value: WATER as TileState, label: 'Water', icon: <IconDroplet size={13} /> },
              { value: WALL as TileState, label: 'Erase', icon: <IconEraser size={13} /> },
            ]}
          />
          <ToolButton
            icon={<IconCave size={14} />}
            label="Cave"
            active={drawingState.tool === 'rough'}
            onClick={() => {
              const ds = drawingState
              if (ds.tool === 'rough') {
                if (ds.phase === 'placed2') {
                  setHistory(h => ({ ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZ, ds.baseGrid) } }))
                }
                dispatch({ type: 'ESCAPE' })
              } else {
                dispatch({ type: 'SET_TOOL', to: { tool: 'rough', phase: 'idle' } })
              }
            }}
          />
          {drawingState.tool === 'rough' && (
            <div className="hint">
              {roughPhase === 'idle' && 'Click 1: set start corner'}
              {roughPhase === 'placed1' && 'Click 2: set end corner'}
              {roughPhase === 'placed2' && 'Move to adjust edges · Click 3: commit · Esc: cancel'}
            </div>
          )}
        </Section>

        <Section title="Structures" icon={<IconStairs size={14} />}>
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
          {selectedStepId && (
            <>
              <Btn onClick={() => setHistory(h => push(h, { ...h.present, steps: rotateStepRun(h.present.steps, selectedStepId) }))}>
                <IconRotate size={13} /> Rotate Steps
              </Btn>
              <div className="hint">R: rotate · Del: delete · Esc: deselect</div>
            </>
          )}
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
          {selectedRampId && (
            <>
              <Btn onClick={() => setHistory(h => push(h, { ...h.present, ramps: rotateRampRun(h.present.ramps, selectedRampId) }))}>
                <IconRotate size={13} /> Rotate Ramp
              </Btn>
              <div className="hint">R: rotate · Del: delete · Esc: deselect</div>
            </>
          )}
        </Section>

        <Section title="Stamps" icon={<IconStampFloor size={14} />} defaultOpen>
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

        <Section title="Labels" icon={<IconTag size={14} />}>
          <ToolButton
            icon={<IconTag size={14} />}
            label="Add Label"
            active={labelMode === 'place'}
            onClick={() => {
              if (labelMode === 'place') {
                dispatch({ type: 'SET_TOOL', to: { tool: 'label', phase: 'idle', selectedId: null } })
              } else {
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
                  }}>Delete</Btn>
                </div>
              </>
            ) : null
          })()}
        </Section>

        <Section title="Style" icon={<IconHatch size={14} />}>
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

        <Section title="Canvas & File" icon={<IconImage size={14} />} defaultOpen>
          <div className="row">
            <label className="label-dim" style={{ width: 44 }}>Size</label>
            <input
              className="num-field"
              type="number" min={1} max={36} step={0.5}
              value={+(cols / TILES_PER_INCH).toFixed(1)}
              onChange={e => handleWidthChange(Number(e.target.value))}
            />
            <span className="label-dim">×</span>
            <input
              className="num-field"
              type="number" min={1} max={36} step={0.5}
              value={+(rows / TILES_PER_INCH).toFixed(1)}
              onChange={e => handleHeightChange(Number(e.target.value))}
            />
            <span className="label-dim" style={{ fontSize: 10 }}>in</span>
          </div>

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
      </div>

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverTile(null)}
        onWheel={handleWheel}
        onContextMenu={e => e.evt.preventDefault()}
        style={{ cursor: showIso && (drawingState.tool === 'paint' || drawingState.tool === 'rough') ? 'not-allowed' : drawingState.tool === 'paint' ? 'crosshair' : 'cell' }}
      >
        <Layer ref={layerRef} />
        <Layer ref={stampLayerRef} />
        <Layer ref={dotLayerRef} listening={false} />
        <Layer ref={labelsLayerRef} />
      </Stage>
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
