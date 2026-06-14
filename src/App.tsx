import { useCallback, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { DEFAULT_COLS, DEFAULT_ROWS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, TILE_PX, TILES_PER_INCH, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT, type TileState } from './constants'
import { isoProject, isoUnproject, isoStampTransform } from './iso'
import { buildIsoScene } from './isoScene'
import { deriveFaceColors } from './faceColors'
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles, getGrid, setGrid } from './grid'
import { createHistory, push, redo, undo, type History } from './history'
import { serialize, deserialize } from './serialization'
import {
  addStamp, isObjectStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
import { addStepRun, removeStepRun, rotateStepRun, stepRunTiles, topDownStepFaceRect, topDownStepRects, type StepRun } from './steps'
import { addRampRun, removeRampRun, rotateRampRun, rampRunTiles, topDownRampFaceRect, topDownRampRect, type RampRun } from './ramps'
import { addLabel, removeLabel, updateLabel, type Label } from './labels'
import { buildHatchPolylines, drawShadow, buildWallOutlineSegments, mergeOutlineSegments, roughenSegments, varyWidthsAlongStroke, OUTLINE_ROUGH_OPTS } from './patterns'
import { useStampImages } from './hooks/useStampImages'
import { buildExportShapes } from './exportShapes'
import { applyTileLevelNoise, type TileFlip } from './noise'
import { StampPicker, type Mode } from './StampPicker'

const GHOST_COLOR = 'rgba(255,255,100,0.45)'
const DOT_RADIUS = 2

const WALL_PRESETS = [
  { label: 'Black', color: '#000000', opacity: 1 },
  { label: 'Repro Blue', color: '#A8C8E8', opacity: 1 },
  { label: 'Transparent', color: '#000000', opacity: 0 },
]

type BrushShape = 'square' | 'circle'
type RoughPhase = 'idle' | 'placed1' | 'placed2'

interface Tile { col: number; row: number }

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

  const [mode, setMode] = useState<Mode>('paint')
  const [labelMode, setLabelMode] = useState<'none' | 'place'>('none')
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const selectedLabelIdRef = useRef<string | null>(null)
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [selectedRampId, setSelectedRampId] = useState<string | null>(null)
  const [hoverTile, setHoverTile] = useState<Tile | null>(null)
  const [brushShape, setBrushShape] = useState<BrushShape>('square')
  const [areaPhase, setAreaPhase] = useState<'idle' | 'selecting'>('idle')
  const [areaStart, setAreaStart] = useState<Tile | null>(null)
  const [areaEnd, setAreaEnd] = useState<Tile | null>(null)
  const [activeZ, setActiveZ] = useState(0)
  const activeZRef = useRef(0)

  const [roughPhase, setRoughPhase] = useState<RoughPhase>('idle')
  const [roughStart, setRoughStart] = useState<Tile | null>(null)
  const [roughEnd, setRoughEnd] = useState<Tile | null>(null)
  const [roughSeed, setRoughSeed] = useState(0)
  const [roughPreview, setRoughPreview] = useState<TileFlip[]>([])
  const roughBaseGrid = useRef<Uint8Array | null>(null)

  const hoverTileRef = useRef<Tile | null>(null)
  const roughPhaseRef = useRef<RoughPhase>('idle')
  const roughStartRef = useRef<Tile | null>(null)
  const roughEndRef = useRef<Tile | null>(null)
  const roughPreviewRef = useRef<TileFlip[]>([])
  const roughSeedRef = useRef<number>(0)
  const [selectedPaintState, setSelectedPaintState] = useState<TileState>(FLOOR)
  const selectedPaintStateRef = useRef<TileState>(FLOOR)
  const paintMode = useRef<TileState>(FLOOR)
  const areaPhaseRef = useRef<'idle' | 'selecting'>('idle')
  const areaStartRef = useRef<Tile | null>(null)
  const areaEndRef = useRef<Tile | null>(null)
  const brushShapeRef = useRef<BrushShape>('square')
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
      if (e.key === 'Delete' && selectedStampId) {
        setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, selectedStampId) }))
        setSelectedStampId(null)
        return
      }
      if ((e.key === 'r' || e.key === 'R') && selectedStampId) {
        setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, selectedStampId) }))
        return
      }
      if ((e.key === 'e' || e.key === 'E') && selectedStampId) {
        setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, selectedStampId) }))
        return
      }
      if (e.key === 'Delete' && selectedStepId) {
        setHistory(h => push(h, { ...h.present, steps: removeStepRun(h.present.steps, selectedStepId) }))
        setSelectedStepId(null)
        return
      }
      if ((e.key === 'r' || e.key === 'R') && selectedStepId) {
        setHistory(h => push(h, { ...h.present, steps: rotateStepRun(h.present.steps, selectedStepId) }))
        return
      }
      if (e.key === 'Delete' && selectedRampId) {
        setHistory(h => push(h, { ...h.present, ramps: removeRampRun(h.present.ramps, selectedRampId) }))
        setSelectedRampId(null)
        return
      }
      if ((e.key === 'r' || e.key === 'R') && selectedRampId) {
        setHistory(h => push(h, { ...h.present, ramps: rotateRampRun(h.present.ramps, selectedRampId) }))
        return
      }
      if (e.key === 'Escape') {
        setSelectedStampId(null)
        setSelectedStepId(null)
        setSelectedRampId(null)
        setSelectedLabelId(null)
        setLabelMode('none')
        if (roughPhase !== 'idle') {
          setRoughPhase('idle')
          roughPhaseRef.current = 'idle'
          setRoughStart(null)
          roughStartRef.current = null
          setRoughEnd(null); roughEndRef.current = null
          setRoughPreview([]); roughPreviewRef.current = []
          if (roughBaseGrid.current !== null) {
            const savedGrid = roughBaseGrid.current
            roughBaseGrid.current = null
            setHistory(h => ({ ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZRef.current, savedGrid) } }))
          }
        }
        if (areaPhaseRef.current === 'selecting') {
          setAreaPhase('idle'); areaPhaseRef.current = 'idle'
          setAreaStart(null); areaStartRef.current = null
          setAreaEnd(null); areaEndRef.current = null
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedStampId, selectedStepId, selectedRampId, selectedLabelId, labelMode, roughPhase])

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
      if (showIso && (mode === 'paint' || mode === 'rough')) return
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

      if (mode === 'rough') {
        if (roughPhaseRef.current === 'idle') {
          setRoughStart(tile)
          roughStartRef.current = tile
          setRoughEnd(tile); roughEndRef.current = tile
          setRoughPhase('placed1')
          roughPhaseRef.current = 'placed1'
        } else if (roughPhaseRef.current === 'placed2' && roughStartRef.current && roughEndRef.current) {
          const start = roughStartRef.current
          const end = roughEndRef.current
          const minC = Math.min(start.col, end.col)
          const maxC = Math.max(start.col, end.col)
          const minR = Math.min(start.row, end.row)
          const maxR = Math.max(start.row, end.row)
          const az = activeZRef.current
          const captured = roughPreviewRef.current
          const savedBase = roughBaseGrid.current
          roughBaseGrid.current = null
          setHistory(h => {
            const originalGrid = savedBase ?? getGrid(h.present.grids, az, cols, rows)
            const rectTileList: Tile[] = []
            for (let r = minR; r <= maxR; r++)
              for (let c = minC; c <= maxC; c++)
                rectTileList.push({ col: c, row: r })
            let next = paintTiles(originalGrid, cols, rectTileList, FLOOR)
            if (captured.length > 0)
              next = paintTiles(next, cols, captured.map(f => ({ col: f.col, row: f.row })), WALL)
            const baseHistory = { ...h, present: { ...h.present, grids: setGrid(h.present.grids, az, originalGrid) } }
            return push(baseHistory, { ...h.present, grids: setGrid(h.present.grids, az, next) })
          })
          setRoughPhase('idle')
          roughPhaseRef.current = 'idle'
          setRoughStart(null)
          roughStartRef.current = null
          setRoughEnd(null); roughEndRef.current = null
          setRoughPreview([]); roughPreviewRef.current = []
        }
        return
      }

      if (labelMode === 'place') {
        const newLabel: Label = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          text: 'New Label',
          number: undefined,
        }
        setHistory(h => push(h, { ...h.present, labels: addLabel(h.present.labels, newLabel) }))
        setSelectedLabelId(newLabel.id)
        setSelectedStampId(null)
        setSelectedStepId(null)
        setSelectedRampId(null)
        return
      }

      if (mode === 'steps') {
        const newRun: StepRun = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          z: activeZRef.current,
          direction: 'E',
        }
        setHistory(h => push(h, { ...h.present, steps: addStepRun(h.present.steps, newRun) }))
        setSelectedStampId(null)
        setSelectedRampId(null)
        setSelectedStepId(newRun.id)
        return
      }

      if (mode === 'ramps') {
        const newRun: RampRun = {
          id: crypto.randomUUID(),
          col: tile.col,
          row: tile.row,
          z: activeZRef.current,
          direction: 'E',
        }
        setHistory(h => push(h, { ...h.present, ramps: addRampRun(h.present.ramps, newRun) }))
        setSelectedStampId(null)
        setSelectedStepId(null)
        setSelectedRampId(newRun.id)
        return
      }

      if (mode !== 'paint') {
        const newStamp: Stamp = {
          id: crypto.randomUUID(),
          type: mode,
          col: tile.col,
          row: tile.row,
          rotation: 0,
          z: activeZRef.current,
        }
        setHistory(h => push(h, { ...h.present, stamps: addStamp(h.present.stamps, newStamp) }))
        setSelectedStampId(newStamp.id)
        return
      }

      // Area select start
      paintMode.current = e.evt.button === 2 ? WALL : selectedPaintStateRef.current
      setAreaStart(tile); areaStartRef.current = tile
      setAreaEnd(tile); areaEndRef.current = tile
      setAreaPhase('selecting'); areaPhaseRef.current = 'selecting'
    },
    [mode, labelMode, cols, rows, showIso],
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

      if (roughPhaseRef.current === 'placed1' && roughStartRef.current && tile) {
        setRoughEnd(tile); roughEndRef.current = tile
        return
      }

      if (roughPhaseRef.current === 'placed2' && roughEndRef.current && roughStartRef.current) {
        const cursorX = e.evt.clientX
        const cursorY = e.evt.clientY
        const stageRect = stage.container().getBoundingClientRect()
        const scale = stage.scaleX()
        const ox = stage.x(); const oy = stage.y()
        const rEnd = roughEndRef.current!
        const rStart = roughStartRef.current!
        const endWorldX = rEnd.col * TILE_PX + TILE_PX / 2
        const endWorldY = rEnd.row * TILE_PX + TILE_PX / 2
        const endScreenX = endWorldX * scale + stageRect.left + ox
        const endScreenY = endWorldY * scale + stageRect.top + oy
        const dx = (cursorX - endScreenX) / scale
        const dy = (cursorY - endScreenY) / scale
        const distTiles = Math.sqrt(dx * dx + dy * dy) / TILE_PX
        const intensity = Math.min(1, distTiles / 10)
        const minC = Math.min(rStart.col, rEnd.col)
        const maxC = Math.max(rStart.col, rEnd.col)
        const minR = Math.min(rStart.row, rEnd.row)
        const maxR = Math.max(rStart.row, rEnd.row)
        const preview = applyTileLevelNoise({ minC, minR, maxC, maxR }, intensity, roughSeedRef.current)
        setRoughPreview(preview); roughPreviewRef.current = preview
        return
      }

      if (areaPhaseRef.current === 'selecting' && tile) {
        setAreaEnd(tile); areaEndRef.current = tile
      }
    },
    [cols, rows, showIso],
  )

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = false
      return
    }
    // Rough mode click 2: drag release commits the base rect
    if (roughPhaseRef.current === 'placed1' && roughStartRef.current) {
      const start = roughStartRef.current
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
      roughSeedRef.current = seed
      setRoughSeed(seed)
      setRoughEnd(end)
      setRoughPhase('placed2')
      roughPhaseRef.current = 'placed2'
      setHistory(h => {
        if (roughBaseGrid.current === null) roughBaseGrid.current = getGrid(h.present.grids, activeZRef.current, cols, rows)
        const next = paintTiles(roughBaseGrid.current, cols, rectTileList, FLOOR)
        return { ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZRef.current, next) } }
      })
      return
    }

    if (areaPhaseRef.current === 'selecting' && areaStartRef.current && areaEndRef.current) {
      const tiles = getAreaTiles(areaStartRef.current, areaEndRef.current, brushShapeRef.current)
      const az = activeZRef.current
      const tileValue = paintMode.current

      setHistory(h => {
        const gridsNext = setGrid(h.present.grids, az, paintTiles(getGrid(h.present.grids, az, cols, rows), cols, tiles, tileValue))

        return push(h, { ...h.present, grids: gridsNext })
      })
      setAreaPhase('idle'); areaPhaseRef.current = 'idle'
      setAreaStart(null); areaStartRef.current = null
      setAreaEnd(null); areaEndRef.current = null
    }
  }, [cols])

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
              setSelectedStepId(null)
            } else {
              setSelectedStampId(null)
              setSelectedRampId(null)
              setSelectedStepId(sid)
            }
          })
        }
        if (shape.rampId) {
          const rid = shape.rampId
          node.on('mousedown', (e) => {
            e.cancelBubble = true
            if (e.evt.button === 2 && rid === selectedRampId) {
              setHistory(h => push(h, { ...h.present, ramps: removeRampRun(h.present.ramps, rid) }))
              setSelectedRampId(null)
            } else {
              setSelectedStampId(null)
              setSelectedStepId(null)
              setSelectedRampId(rid)
            }
          })
        }
        layer.add(node)
      }
      layer.batchDraw()
      return
    }

    // Wall background — full opacity, drawn once
    if (wallOpacity > 0) {
      layer.add(new Konva.Rect({
        x: 0, y: 0,
        width: cols * TILE_PX,
        height: rows * TILE_PX,
        fill: wallColor,
        opacity: wallOpacity,
      }))
    }

    // Render each Z level ≤ activeZ, lowest first, with halving opacity
    const zSet = new Set(grids.keys())
    for (const run of steps) zSet.add(run.z)
    for (const run of ramps) zSet.add(run.z)
    const sortedZs = [...zSet].filter(z => z <= activeZ).sort((a, b) => a - b)
    for (const z of sortedZs) {
      const levelGrid = grids.get(z) ?? createGrid(cols, rows)
      const levelOpacity = Math.pow(0.5, activeZ - z)
      const group = new Konva.Group({ opacity: levelOpacity })

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(levelGrid, cols, c, r) === FLOOR) {
            group.add(new Konva.Rect({
              x: c * TILE_PX, y: r * TILE_PX,
              width: TILE_PX, height: TILE_PX,
              fill: FLOOR_COLOR,
            }))
          } else if (getTile(levelGrid, cols, c, r) === WATER) {
            group.add(new Konva.Rect({
              x: c * TILE_PX, y: r * TILE_PX,
              width: TILE_PX, height: TILE_PX,
              fill: WATER_COLOR,
            }))
          }
        }
      }

      if (show3D) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (getTile(levelGrid, cols, c, r) !== FLOOR) continue
            const southWall = r + 1 >= rows || getTile(levelGrid, cols, c, r + 1) === WALL
            const eastWall = c + 1 >= cols || getTile(levelGrid, cols, c + 1, r) === WALL
            if (southWall) {
              group.add(new Konva.Rect({
                x: c * TILE_PX, y: (r + 1) * TILE_PX,
                width: TILE_PX, height: FACE_PX,
                fill: FACE_COLOR,
              }))
            }
            if (eastWall) {
              group.add(new Konva.Rect({
                x: (c + 1) * TILE_PX, y: r * TILE_PX,
                width: FACE_PX, height: TILE_PX,
                fill: FACE_COLOR,
              }))
            }
          }
        }
      }

      // Directional shadows — cast only from north/west walls onto floor tiles
      if (showWallOutline) {
        const shadowCanvas = document.createElement('canvas')
        shadowCanvas.width = cols * TILE_PX
        shadowCanvas.height = rows * TILE_PX
        drawShadow(shadowCanvas.getContext('2d')!, levelGrid, cols, rows, TILE_PX)
        group.add(new Konva.Image({
          image: shadowCanvas as unknown as HTMLImageElement,
          x: 0, y: 0,
          width: cols * TILE_PX, height: rows * TILE_PX,
          listening: false,
        }))
      }

      if (showGrid) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (getTile(levelGrid, cols, c, r) === FLOOR) {
              group.add(new Konva.Rect({
                x: c * TILE_PX, y: r * TILE_PX,
                width: TILE_PX, height: TILE_PX,
                stroke: 'rgba(0,0,0,0.2)',
                strokeWidth: 0.5,
              }))
            }
          }
        }
      }

      // Steps belong to their level's group so they fade with it and stay
      // under higher-level floors.
      for (const run of steps) {
        if (run.z !== z) continue
        const stepGroup = new Konva.Group()
        if (show3D) {
          const band = topDownStepFaceRect(run, TILE_PX, FACE_PX)
          stepGroup.add(new Konva.Rect({ ...band, fill: FACE_COLOR }))
        }
        for (const rect of topDownStepRects(run)) {
          stepGroup.add(new Konva.Rect({
            x: rect.x * TILE_PX, y: rect.y * TILE_PX,
            width: rect.width * TILE_PX, height: rect.height * TILE_PX,
            fill: FLOOR_COLOR,
            stroke: 'rgba(0,0,0,0.35)',
            strokeWidth: 1,
          }))
        }
        if (run.id === selectedStepId) {
          const tiles = stepRunTiles(run)
          const minC = Math.min(...tiles.map(t => t.col))
          const minR = Math.min(...tiles.map(t => t.row))
          const maxC = Math.max(...tiles.map(t => t.col))
          const maxR = Math.max(...tiles.map(t => t.row))
          stepGroup.add(new Konva.Rect({
            x: minC * TILE_PX - 1, y: minR * TILE_PX - 1,
            width: (maxC - minC + 1) * TILE_PX + 2, height: (maxR - minR + 1) * TILE_PX + 2,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
        stepGroup.on('mousedown', (e) => {
          e.cancelBubble = true
          if (e.evt.button === 2 && run.id === selectedStepId) {
            setHistory(h => push(h, { ...h.present, steps: removeStepRun(h.present.steps, run.id) }))
            setSelectedStepId(null)
          } else {
            setSelectedStampId(null)
            setSelectedRampId(null)
            setSelectedStepId(run.id)
          }
        })
        group.add(stepGroup)
      }

      // Ramps render like steps: a single footprint rect with an exposed-edge face.
      for (const run of ramps) {
        if (run.z !== z) continue
        const rampGroup = new Konva.Group()
        if (show3D) {
          const band = topDownRampFaceRect(run, TILE_PX, FACE_PX)
          rampGroup.add(new Konva.Rect({ ...band, fill: FACE_COLOR }))
        }
        const rect = topDownRampRect(run)
        rampGroup.add(new Konva.Rect({
          x: rect.x * TILE_PX, y: rect.y * TILE_PX,
          width: rect.width * TILE_PX, height: rect.height * TILE_PX,
          fill: FLOOR_COLOR,
          stroke: 'rgba(0,0,0,0.35)',
          strokeWidth: 1,
        }))
        if (run.id === selectedRampId) {
          const tiles = rampRunTiles(run)
          const minC = Math.min(...tiles.map(t => t.col))
          const minR = Math.min(...tiles.map(t => t.row))
          const maxC = Math.max(...tiles.map(t => t.col))
          const maxR = Math.max(...tiles.map(t => t.row))
          rampGroup.add(new Konva.Rect({
            x: minC * TILE_PX - 1, y: minR * TILE_PX - 1,
            width: (maxC - minC + 1) * TILE_PX + 2, height: (maxR - minR + 1) * TILE_PX + 2,
            stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
          }))
        }
        rampGroup.on('mousedown', (e) => {
          e.cancelBubble = true
          if (e.evt.button === 2 && run.id === selectedRampId) {
            setHistory(h => push(h, { ...h.present, ramps: removeRampRun(h.present.ramps, run.id) }))
            setSelectedRampId(null)
          } else {
            setSelectedStampId(null)
            setSelectedStepId(null)
            setSelectedRampId(run.id)
          }
        })
        group.add(rampGroup)
      }

      // Crosshatch overlay — Konva.Line nodes so they stay crisp at any zoom
      if (showHatching) {
        const hatchGroup = new Konva.Group({
          clipFunc: (ctx) => {
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (getTile(levelGrid, cols, c, r) === WALL) {
                  ctx.rect(c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
                }
              }
            }
          },
          listening: false,
        })
        const polylines = buildHatchPolylines(levelGrid, cols, rows, TILE_PX)
        for (const polyline of polylines) {
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
      if (showWallOutline) {
        const outlineSegs = buildWallOutlineSegments(levelGrid, cols, rows, TILE_PX)
        const outlineGroup = new Konva.Group({ listening: false })
        if (wallOutlineStyle === 'rough') {
          const polylines = roughenSegments(mergeOutlineSegments(outlineSegs), OUTLINE_ROUGH_OPTS, 77)
          const allSegs = polylines.flatMap((pl, i) => varyWidthsAlongStroke(pl, 2, 1, 77 + i))
          for (const { a, b, width } of allSegs) {
            outlineGroup.add(new Konva.Line({
              points: [...a, ...b],
              stroke: wallOutlineColor,
              strokeWidth: width,
              lineCap: 'round',
              listening: false,
            }))
          }
        } else {
          for (const polyline of outlineSegs) {
            if (polyline.length < 2) continue
            outlineGroup.add(new Konva.Line({
              points: (polyline as [number, number][]).flat(),
              stroke: wallOutlineColor,
              strokeWidth: 2,
              lineCap: 'round',
              lineJoin: 'round',
              listening: false,
            }))
          }
        }
        group.add(outlineGroup)
      }

      layer.add(group)
    }

    // Render Z levels above activeZ as non-interactive ghosts for cross-level alignment
    const aboveZs = [...zSet].filter(z => z > activeZ).sort((a, b) => a - b)
    for (const z of aboveZs) {
      const levelGrid = grids.get(z) ?? createGrid(cols, rows)
      const ghostOpacity = 0.25 * Math.pow(0.6, z - activeZ - 1)
      const group = new Konva.Group({ opacity: ghostOpacity, listening: false })

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(levelGrid, cols, c, r) === FLOOR) {
            group.add(new Konva.Rect({
              x: c * TILE_PX, y: r * TILE_PX,
              width: TILE_PX, height: TILE_PX,
              fill: FLOOR_COLOR,
            }))
          } else if (getTile(levelGrid, cols, c, r) === WATER) {
            group.add(new Konva.Rect({
              x: c * TILE_PX, y: r * TILE_PX,
              width: TILE_PX, height: TILE_PX,
              fill: WATER_COLOR,
            }))
          }
        }
      }

      for (const run of steps) {
        if (run.z !== z) continue
        for (const rect of topDownStepRects(run)) {
          group.add(new Konva.Rect({
            x: rect.x * TILE_PX, y: rect.y * TILE_PX,
            width: rect.width * TILE_PX, height: rect.height * TILE_PX,
            fill: FLOOR_COLOR,
            stroke: 'rgba(0,0,0,0.35)',
            strokeWidth: 1,
          }))
        }
      }

      for (const run of ramps) {
        if (run.z !== z) continue
        const rect = topDownRampRect(run)
        group.add(new Konva.Rect({
          x: rect.x * TILE_PX, y: rect.y * TILE_PX,
          width: rect.width * TILE_PX, height: rect.height * TILE_PX,
          fill: FLOOR_COLOR,
          stroke: 'rgba(0,0,0,0.35)',
          strokeWidth: 1,
        }))
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

    for (const stamp of stamps) {
      const sz = stampSize(stamp.type)
      const w = sz.cols * TILE_PX
      const h = sz.rows * TILE_PX
      const imgEl = stampImages.get(stamp.type)!

      if (showIso) {
        const isoCenter = isoProject(stamp.col + sz.cols / 2, stamp.row + sz.rows / 2, TILE_PX * 2, TILE_PX)
        const isoBottom = isoProject(stamp.col + sz.cols, stamp.row + sz.rows, TILE_PX * 2, TILE_PX)
        if (isObjectStamp(stamp)) {
          // Billboard: base anchored at tile bottom corner so the object sits on the floor.
          const sc = stamp.scale ?? 1
          const bw = sz.cols * TILE_PX * 2 * sc
          const billboardH = imgEl.naturalWidth > 0 ? Math.round(bw * imgEl.naturalHeight / imgEl.naturalWidth) : h * sc
          const pivotX = isoCenter.x
          const zOffsetY = -stamp.z * Z_STEP_HEIGHT
          const pivotY = isoBottom.y - billboardH / 2 + zOffsetY
          const imgNode = new Konva.Image({
            image: imgEl,
            x: pivotX, y: pivotY,
            width: bw, height: billboardH,
            offsetX: bw / 2, offsetY: billboardH / 2,
            rotation: stamp.rotation,
            scaleX: stamp.mirrored ? -1 : 1,
          })
          imgNode.on('mousedown', (e) => {
            e.cancelBubble = true
            if (e.evt.button === 2 && stamp.id === selectedStampId) {
              setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, stamp.id) }))
              setSelectedStampId(null)
            } else {
              setSelectedStepId(null)
              setSelectedStampId(stamp.id)
            }
          })
          layer.add(imgNode)
          if (stamp.id === selectedStampId) {
            layer.add(new Konva.Rect({
              x: pivotX, y: pivotY,
              width: bw + 2, height: billboardH + 2,
              offsetX: (bw + 2) / 2, offsetY: (billboardH + 2) / 2,
              rotation: stamp.rotation,
              stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
            }))
          }
        } else {
          const sc = stamp.scale ?? 1
          const effectiveW = w * sc
          const effectiveH = h * sc
          const t = isoStampTransform(stamp.rotation)
          const zOffsetY = -stamp.z * Z_STEP_HEIGHT
          // Group positioned at tile iso center; skewX is applied before the translate.
          const group = new Konva.Group({
            x: isoCenter.x, y: isoCenter.y + zOffsetY,
            rotation: t.rotation,
            scaleX: stamp.mirrored ? -t.scaleX : t.scaleX,
            scaleY: t.scaleY,
            skewX: t.skewX,
          })
          group.add(new Konva.Image({ image: imgEl, x: -effectiveW / 2, y: -effectiveH / 2, width: effectiveW, height: effectiveH }))
          group.on('mousedown', (e) => {
            e.cancelBubble = true
            if (e.evt.button === 2 && stamp.id === selectedStampId) {
              setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, stamp.id) }))
              setSelectedStampId(null)
            } else {
              setSelectedStepId(null)
              setSelectedStampId(stamp.id)
            }
          })
          if (stamp.id === selectedStampId) {
            group.add(new Konva.Rect({
              x: -effectiveW / 2 - 1, y: -effectiveH / 2 - 1,
              width: effectiveW + 2, height: effectiveH + 2,
              stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
            }))
          }
          layer.add(group)
        }
        continue
      }

      // Top-down: stamps above activeZ render as non-interactive ghosts for alignment reference
      const isAbove = stamp.z > activeZ
      const stampOpacity = isAbove
        ? 0.25 * Math.pow(0.6, stamp.z - activeZ - 1)
        : Math.pow(0.5, activeZ - stamp.z)
      const sc = stamp.scale ?? 1
      const effectiveW = w * sc
      const effectiveH = h * sc
      const x = stamp.col * TILE_PX + w / 2
      const y = stamp.row * TILE_PX + h / 2
      const isGhost = isObjectStamp(stamp)
      const node = new Konva.Image({
        image: imgEl,
        x, y,
        width: effectiveW, height: effectiveH,
        offsetX: effectiveW / 2, offsetY: effectiveH / 2,
        rotation: stamp.rotation,
        scaleX: stamp.mirrored ? -1 : 1,
        draggable: !isGhost && !isAbove,
        listening: !isAbove,
        opacity: isAbove ? stampOpacity : (isGhost ? 0.25 * stampOpacity : stampOpacity),
      })
      if (!isGhost && !isAbove) {
        node.on('mousedown', (e) => {
          e.cancelBubble = true
          if (e.evt.button === 2 && stamp.id === selectedStampId) {
            setHistory(h => push(h, { ...h.present, stamps: removeStamp(h.present.stamps, stamp.id) }))
            setSelectedStampId(null)
          } else {
            setSelectedStampId(stamp.id)
          }
        })
        node.on('dragend', () => {
          const snappedCol = Math.max(0, Math.min(cols - sz.cols, Math.round((node.x() - effectiveW / 2) / TILE_PX)))
          const snappedRow = Math.max(0, Math.min(rows - sz.rows, Math.round((node.y() - effectiveH / 2) / TILE_PX)))
          setHistory(h => push(h, { ...h.present, stamps: moveStamp(h.present.stamps, stamp.id, snappedCol, snappedRow) }))
        })
      }
      layer.add(node)

      if (!isGhost && !isAbove && stamp.id === selectedStampId) {
        layer.add(new Konva.Rect({
          x,
          y,
          width: effectiveW + 2,
          height: effectiveH + 2,
          offsetX: (effectiveW + 2) / 2,
          offsetY: (effectiveH + 2) / 2,
          rotation: stamp.rotation,
          stroke: '#ffff00',
          strokeWidth: 2,
          fill: 'transparent',
          listening: false,
        }))
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

    if (wallOpacity > 0) {
      const isLight = isLightColor(wallColor)
      const sortedZsForDots = [...grids.keys()].filter(z => z <= activeZ).sort((a, b) => a - b)
      for (const z of sortedZsForDots) {
        const levelOpacity = 0.2 * wallOpacity * Math.pow(0.5, activeZ - z)
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

    for (const label of labels) {
      const displayText = label.number !== undefined ? `${label.number}` : label.text
      const textWidth = TILE_PX * 4
      const textNode = new Konva.Text({
        x: label.col * TILE_PX + TILE_PX / 2 - textWidth / 2,
        y: label.row * TILE_PX + TILE_PX / 2 - 7,
        width: textWidth,
        text: displayText,
        fontSize: label.number !== undefined ? 14 : 10,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'center',
      })
      textNode.on('mousedown', (e) => {
        e.cancelBubble = true
        if (e.evt.button === 2 && label.id === selectedLabelIdRef.current) {
          setHistory(h => push(h, { ...h.present, labels: removeLabel(h.present.labels, label.id) }))
          setSelectedLabelId(null)
        } else {
          setSelectedLabelId(label.id)
        }
      })
      layer.add(textNode)

      if (label.id === selectedLabelId) {
        const textX = label.col * TILE_PX + TILE_PX / 2 - textWidth / 2
        const textY = label.row * TILE_PX + TILE_PX / 2 - 7
        const fontSize = label.number !== undefined ? 14 : 10
        layer.add(new Konva.Rect({
          x: textX - 2,
          y: textY - 2,
          width: textWidth + 4,
          height: fontSize + 4,
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

  useEffect(() => { selectedLabelIdRef.current = selectedLabelId }, [selectedLabelId])

  useEffect(() => { if (mode !== 'paint') setLabelMode('none') }, [mode])

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
      setBrushShape(save.brushShape)
      brushShapeRef.current = save.brushShape
      setShowGrid(save.showGrid)
      setShow3D(save.show3D)
      setIsoFaceColor(save.isoFaceColor)
      setShowHatching(save.showHatching)
      setHatchColor(save.hatchColor)
      setShowWallOutline(save.showWallOutline)
      setWallOutlineColor(save.wallOutlineColor)
      setWallOutlineStyle(save.wallOutlineStyle)
      setSelectedStampId(null)
      setSelectedStepId(null)
      setSelectedRampId(null)
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
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        background: 'rgba(30,30,30,0.9)', color: '#eee',
        borderRadius: 8, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
        fontSize: 12, userSelect: 'none', minWidth: 190,
      }}>

        {/* ── Z LEVEL ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Z Level</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setActiveZ(z => z - 1)}
            style={{
              width: 28, padding: '4px 0', fontSize: 13, cursor: 'pointer',
              background: 'transparent', color: '#eee',
              border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
            }}
          >
            −
          </button>
          <span style={{ flex: 1, textAlign: 'center', color: '#eee', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {activeZ}
          </span>
          <button
            onClick={() => setActiveZ(z => z + 1)}
            style={{
              width: 28, padding: '4px 0', fontSize: 13, cursor: 'pointer',
              background: 'transparent', color: '#eee',
              border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
            }}
          >
            +
          </button>
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '2px 0' }} />

        {/* ── TOOLS ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tools</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['square', 'circle'] as BrushShape[]).map(s => (
            <button
              key={s}
              onClick={() => { setBrushShape(s); brushShapeRef.current = s; setMode('paint') }}
              style={{
                flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                background: mode === 'paint' && brushShape === s ? '#555' : 'transparent',
                color: '#eee',
                border: mode === 'paint' && brushShape === s ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
              }}
            >
              {s === 'square' ? '▪ Square' : '● Circle'}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (mode === 'rough') {
              setMode('paint')
              setRoughPhase('idle')
              roughPhaseRef.current = 'idle'
              setRoughStart(null)
              roughStartRef.current = null
              setRoughEnd(null); roughEndRef.current = null
              setRoughPreview([]); roughPreviewRef.current = []
              if (roughBaseGrid.current !== null) {
                const savedGrid = roughBaseGrid.current
                roughBaseGrid.current = null
                setHistory(h => ({ ...h, present: { ...h.present, grids: setGrid(h.present.grids, activeZ, savedGrid) } }))
              }
            } else {
              setMode('rough')
            }
          }}
          style={{
            padding: '4px 0', fontSize: 11, cursor: 'pointer',
            background: mode === 'rough' ? '#555' : 'transparent',
            color: '#eee',
            border: mode === 'rough' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
          }}
        >
          ⌇ Cave
        </button>
        {mode === 'rough' && (
          <div style={{ fontSize: 11, color: '#aaa' }}>
            {roughPhase === 'idle' && 'Click 1: set start corner'}
            {roughPhase === 'placed1' && 'Click 2: set end corner'}
            {roughPhase === 'placed2' && 'Move to adjust edges · Click 3: commit · Esc: cancel'}
          </div>
        )}
        <button
          onClick={() => setMode(mode === 'steps' ? 'paint' : 'steps')}
          style={{
            padding: '4px 0', fontSize: 11, cursor: 'pointer',
            background: mode === 'steps' ? '#555' : 'transparent',
            color: '#eee',
            border: mode === 'steps' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
          }}
        >
          ≣ Steps
        </button>
        {mode === 'steps' && (
          <div style={{ fontSize: 11, color: '#aaa' }}>
            Click: place steps descending Z{activeZ} → Z{activeZ - 1}
          </div>
        )}
        <button
          onClick={() => setMode(mode === 'ramps' ? 'paint' : 'ramps')}
          style={{
            padding: '4px 0', fontSize: 11, cursor: 'pointer',
            background: mode === 'ramps' ? '#555' : 'transparent',
            color: '#eee',
            border: mode === 'ramps' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
          }}
        >
          ◣ Ramp
        </button>
        {mode === 'ramps' && (
          <div style={{ fontSize: 11, color: '#aaa' }}>
            Click: place ramp descending Z{activeZ} → Z{activeZ - 1}
          </div>
        )}

        {/* Paint state selector: Floor | Water | Erase */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { label: '▫ Floor', value: FLOOR as TileState },
            { label: '~ Water', value: WATER as TileState },
            { label: '✕ Erase', value: WALL as TileState },
          ] as { label: string; value: TileState }[]).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setSelectedPaintState(value); selectedPaintStateRef.current = value }}
              style={{
                flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                background: selectedPaintState === value ? '#555' : 'transparent',
                color: '#eee',
                border: selectedPaintState === value ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '2px 0' }} />

        {/* ── LABELS ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Labels</div>
        <button
          onClick={() => {
            if (labelMode === 'place') {
              setLabelMode('none')
            } else {
              setLabelMode('place')
              setSelectedLabelId(null)
              setMode('paint')
            }
          }}
          style={{
            width: '100%', padding: '4px 0', fontSize: 11, cursor: 'pointer',
            background: labelMode === 'place' ? '#555' : 'transparent',
            color: '#eee',
            border: labelMode === 'place' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
          }}
        >
          + Label
        </button>
        {selectedLabelId && (() => {
          const label = labels.find(l => l.id === selectedLabelId)
          return label ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                type="text"
                value={label.text}
                onChange={e => setHistory(h => push(h, { ...h.present, labels: updateLabel(h.present.labels, selectedLabelId, { text: e.target.value }) }))}
                placeholder="Label text"
                style={{ background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 3, padding: '4px', fontSize: 11 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  value={label.number ?? ''}
                  onChange={e => {
                    const parsed = parseInt(e.target.value, 10)
                    const num = e.target.value === '' || isNaN(parsed) ? undefined : parsed
                    setHistory(h => push(h, { ...h.present, labels: updateLabel(h.present.labels, selectedLabelId, { number: num }) }))
                  }}
                  placeholder="Number"
                  style={{ width: 50, background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 3, padding: '4px', fontSize: 11 }}
                />
                <button
                  onClick={() => {
                    setHistory(h => push(h, { ...h.present, labels: removeLabel(h.present.labels, selectedLabelId) }))
                    setSelectedLabelId(null)
                  }}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                    background: 'transparent', color: '#eee',
                    border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null
        })()}

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '2px 0' }} />

        {/* ── HATCHING ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hatching</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowHatching(v => !v)}
            style={{
              padding: '4px 8px', fontSize: 11, cursor: 'pointer',
              background: showHatching ? '#555' : 'transparent',
              color: '#eee',
              border: showHatching ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            ⌇ Hatch
          </button>
          {showHatching && (
            <input
              type="color" value={hatchColor}
              onChange={e => setHatchColor(e.target.value)}
              style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
            />
          )}
          {showHatching && (
            <span style={{ color: '#aaa', fontSize: 11 }}>{hatchColor}</span>
          )}
        </div>

        {/* ── OUTLINE ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Outline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowWallOutline(v => !v)}
            style={{
              padding: '4px 8px', fontSize: 11, cursor: 'pointer',
              background: showWallOutline ? '#555' : 'transparent',
              color: '#eee',
              border: showWallOutline ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            ◻ Outline
          </button>
          {showWallOutline && (
            <input
              type="color" value={wallOutlineColor}
              onChange={e => setWallOutlineColor(e.target.value)}
              style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
            />
          )}
          {showWallOutline && (
            <span style={{ color: '#aaa', fontSize: 11 }}>{wallOutlineColor}</span>
          )}
        </div>
        {showWallOutline && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['clean', 'rough'] as const).map(s => (
              <button
                key={s}
                onClick={() => setWallOutlineStyle(s)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                  background: wallOutlineStyle === s ? '#555' : 'transparent',
                  color: '#eee',
                  border: wallOutlineStyle === s ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                }}
              >
                {s === 'clean' ? '— Clean' : '⌇ Rough'}
              </button>
            ))}
          </div>
        )}

        {/* ── STAMPS ── */}
        <StampPicker mode={mode} showIso={showIso} onModeChange={setMode} />
        {selectedStampId && (() => {
          const sel = stamps.find(s => s.id === selectedStampId)
          const currentScale = sel?.scale ?? 1
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={() => setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, selectedStampId) }))}
                style={{
                  padding: '4px 0', fontSize: 11, cursor: 'pointer',
                  background: 'transparent', color: '#eee',
                  border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
                }}
              >
                ↻ Rotate
              </button>
              <button
                onClick={() => setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, selectedStampId) }))}
                style={{
                  padding: '4px 0', fontSize: 11, cursor: 'pointer',
                  background: 'transparent', color: '#eee',
                  border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
                }}
              >
                ⇔ Mirror
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ width: 36, color: '#aaa', fontSize: 11 }}>Scale</label>
                <input
                  type="range" min={0.5} max={4} step={0.25} value={currentScale}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setHistory(h => push(h, { ...h.present, stamps: scaleStamp(h.present.stamps, selectedStampId, v) }))
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ color: '#aaa', fontSize: 11, width: 28, textAlign: 'right' }}>{currentScale}×</span>
              </div>
              <div style={{ fontSize: 11, color: '#aaa' }}>
                R: rotate · E: mirror · Del: delete · Esc: deselect
              </div>
            </div>
          )
        })()}
        {selectedStepId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={() => setHistory(h => push(h, { ...h.present, steps: rotateStepRun(h.present.steps, selectedStepId) }))}
              style={{
                padding: '4px 0', fontSize: 11, cursor: 'pointer',
                background: 'transparent', color: '#eee',
                border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
              }}
            >
              ↻ Rotate Steps
            </button>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              R: rotate · Del: delete · Esc: deselect
            </div>
          </div>
        )}
        {selectedRampId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={() => setHistory(h => push(h, { ...h.present, ramps: rotateRampRun(h.present.ramps, selectedRampId) }))}
              style={{
                padding: '4px 0', fontSize: 11, cursor: 'pointer',
                background: 'transparent', color: '#eee',
                border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
              }}
            >
              ↻ Rotate Ramp
            </button>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              R: rotate · Del: delete · Esc: deselect
            </div>
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '2px 0' }} />

        {/* ── SETTINGS ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Settings</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowGrid(v => !v)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: showGrid ? '#555' : 'transparent',
              color: '#eee',
              border: showGrid ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            # Grid
          </button>
          <button
            onClick={() => setShowIso(v => !v)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: showIso ? '#4a3a6a' : 'transparent',
              color: '#eee',
              border: showIso ? '2px solid #bf9fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            ⬡ Iso
          </button>
        </div>
        {showIso && (
          <div style={{ fontSize: 11, color: '#bf9fff' }}>Preview only — drawing disabled</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Canvas</label>
          <input
            type="number" min={1} max={36} step={0.5}
            value={+(cols / TILES_PER_INCH).toFixed(1)}
            onChange={e => handleWidthChange(Number(e.target.value))}
            style={{ width: 42, background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 3, padding: '2px 4px' }}
          />
          <span style={{ color: '#666' }}>×</span>
          <input
            type="number" min={1} max={36} step={0.5}
            value={+(rows / TILES_PER_INCH).toFixed(1)}
            onChange={e => handleHeightChange(Number(e.target.value))}
            style={{ width: 42, background: '#222', color: '#eee', border: '1px solid #555', borderRadius: 3, padding: '2px 4px' }}
          />
          <span style={{ color: '#666', fontSize: 10 }}>in</span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {WALL_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              title={p.label}
              style={{
                flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                background: p.opacity === 0 ? 'transparent' : p.color,
                color: p.color === '#000000' ? '#fff' : '#222',
                border: wallColor === p.color && wallOpacity === p.opacity
                  ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                outline: p.opacity === 0 ? '1px dashed #888' : 'none',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Wall</label>
          <input
            type="color" value={wallColor}
            onChange={e => setWallColor(e.target.value)}
            style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
          />
          <span style={{ color: '#aaa', fontSize: 11 }}>{wallColor}</span>
        </div>

        {showIso && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Face</label>
            <input
              type="color" value={isoFaceColor}
              onChange={e => setIsoFaceColor(e.target.value)}
              style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
            />
            <span style={{ color: '#aaa', fontSize: 11 }}>{isoFaceColor}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Opacity</label>
          <input
            type="range" min={0} max={1} step={0.01} value={wallOpacity}
            onChange={e => setWallOpacity(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: '#aaa', fontSize: 11, width: 28, textAlign: 'right' }}>{Math.round(wallOpacity * 100)}%</span>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '2px 0' }} />

        {/* ── EXPORT ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Export</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#eee',
              border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
            }}
          >
            Save
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#eee',
              border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
            }}
          >
            Load
          </button>
          <button
            onClick={handleExport}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#eee',
              border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
            }}
          >
            PNG
          </button>
        </div>

        {loadError && (
          <div style={{ color: '#f88', fontSize: 11, wordBreak: 'break-word' }}>
            {loadError}
          </div>
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
        style={{ cursor: showIso && (mode === 'paint' || mode === 'rough') ? 'not-allowed' : mode === 'paint' ? 'crosshair' : 'cell' }}
      >
        <Layer ref={layerRef} />
        <Layer ref={stampLayerRef} />
        <Layer ref={dotLayerRef} listening={false} />
        <Layer ref={labelsLayerRef} />
      </Stage>
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
