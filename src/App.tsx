import { useCallback, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { DEFAULT_COLS, DEFAULT_ROWS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, ISO_EAST_FACE_COLOR, ISO_FRONT_FACE_COLOR, TILE_PX, TILES_PER_INCH, WALL, WATER, WATER_COLOR, type TileState } from './constants'
import { isoProject, isoUnproject, isoFloorPoints, isoFrontFacePoints, isoEastFacePoints, isoStampTransform } from './iso'
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles } from './grid'
import { createHistory, push, redo, undo, type History } from './history'
import { serialize, deserialize } from './serialization'
import {
  addStamp, isObjectStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
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

type AppSnapshot = { grid: Uint8Array; stamps: Stamp[] }

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
    createHistory({ grid: createGrid(DEFAULT_COLS, DEFAULT_ROWS), stamps: [] }),
  )
  const { grid, stamps } = history.present
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [rows, setRows] = useState(DEFAULT_ROWS)

  const [mode, setMode] = useState<Mode>('paint')
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null)
  const [hoverTile, setHoverTile] = useState<Tile | null>(null)
  const [brushShape, setBrushShape] = useState<BrushShape>('square')
  const [areaPhase, setAreaPhase] = useState<'idle' | 'selecting'>('idle')
  const [areaStart, setAreaStart] = useState<Tile | null>(null)
  const [areaEnd, setAreaEnd] = useState<Tile | null>(null)

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

  const [wallColor, setWallColor] = useState('#000000')
  const [wallOpacity, setWallOpacity] = useState(1)
  const [showGrid, setShowGrid] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showIso, setShowIso] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const stageRef = useRef<Konva.Stage>(null)
  const pendingFitRef = useRef(false)
  const layerRef = useRef<Konva.Layer>(null)
  const stampLayerRef = useRef<Konva.Layer>(null)
  const dotLayerRef = useRef<Konva.Layer>(null)
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
      if (e.key === 'Escape') {
        setSelectedStampId(null)
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
            setHistory(h => ({ ...h, present: { ...h.present, grid: savedGrid } }))
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
  }, [selectedStampId, roughPhase])

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
          const captured = roughPreviewRef.current
          const savedBase = roughBaseGrid.current
          roughBaseGrid.current = null
          setHistory(h => {
            const originalGrid = savedBase ?? h.present.grid
            const rectTileList: Tile[] = []
            for (let r = minR; r <= maxR; r++)
              for (let c = minC; c <= maxC; c++)
                rectTileList.push({ col: c, row: r })
            let next = paintTiles(originalGrid, cols, rectTileList, FLOOR)
            if (captured.length > 0)
              next = paintTiles(next, cols, captured.map(f => ({ col: f.col, row: f.row })), WALL)
            const baseHistory = { ...h, present: { ...h.present, grid: originalGrid } }
            return push(baseHistory, { ...h.present, grid: next })
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

      if (mode !== 'paint') {
        const newStamp: Stamp = {
          id: crypto.randomUUID(),
          type: mode,
          col: tile.col,
          row: tile.row,
          rotation: 0,
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
    [mode, cols, rows, showIso],
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
        if (roughBaseGrid.current === null) roughBaseGrid.current = h.present.grid
        const next = paintTiles(roughBaseGrid.current, cols, rectTileList, FLOOR)
        return { ...h, present: { ...h.present, grid: next } }
      })
      return
    }

    if (areaPhaseRef.current === 'selecting' && areaStartRef.current && areaEndRef.current) {
      const tiles = getAreaTiles(areaStartRef.current, areaEndRef.current, brushShapeRef.current)
      const tileValue = paintMode.current
      setHistory(h => push(h, { ...h.present, grid: paintTiles(h.present.grid, cols, tiles, tileValue) }))
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
      const ITW = TILE_PX * 2
      const ITH = TILE_PX
      // Iso view: wall background = iso diamond of canvas boundary
      if (wallOpacity > 0) {
        const tl = isoProject(0, 0, ITW, ITH)
        const tr = isoProject(cols, 0, ITW, ITH)
        const br = isoProject(cols, rows, ITW, ITH)
        const bl = isoProject(0, rows, ITW, ITH)
        layer.add(new Konva.Line({
          points: [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y],
          closed: true,
          fill: wallColor,
          opacity: wallOpacity,
        }))
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(grid, cols, c, r) === FLOOR) {
            layer.add(new Konva.Line({
              points: isoFloorPoints(c, r, ITW, ITH),
              closed: true,
              fill: FLOOR_COLOR,
              stroke: 'rgba(0,0,0,0.15)',
              strokeWidth: 0.5,
            }))
          }
        }
        if (show3D) {
          for (let c = 0; c < cols; c++) {
            if (getTile(grid, cols, c, r) !== FLOOR) continue
            const southWall = r + 1 >= rows || getTile(grid, cols, c, r + 1) === WALL
            const eastWall = c + 1 >= cols || getTile(grid, cols, c + 1, r) === WALL
            if (southWall) {
              layer.add(new Konva.Line({
                points: isoFrontFacePoints(c, r, ITW, ITH, FACE_PX),
                closed: true,
                fill: ISO_FRONT_FACE_COLOR,
              }))
            }
            if (eastWall) {
              layer.add(new Konva.Line({
                points: isoEastFacePoints(c, r, ITW, ITH, FACE_PX),
                closed: true,
                fill: ISO_EAST_FACE_COLOR,
              }))
            }
          }
        }
      }
      layer.batchDraw()
      return
    }

    if (wallOpacity > 0) {
      layer.add(new Konva.Rect({
        x: 0, y: 0,
        width: cols * TILE_PX,
        height: rows * TILE_PX,
        fill: wallColor,
        opacity: wallOpacity,
      }))
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (getTile(grid, cols, c, r) === FLOOR) {
          layer.add(new Konva.Rect({
            x: c * TILE_PX, y: r * TILE_PX,
            width: TILE_PX, height: TILE_PX,
            fill: FLOOR_COLOR,
          }))
        } else if (getTile(grid, cols, c, r) === WATER) {
          layer.add(new Konva.Rect({
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
          if (getTile(grid, cols, c, r) !== FLOOR) continue
          const southWall = r + 1 >= rows || getTile(grid, cols, c, r + 1) === WALL
          const eastWall = c + 1 >= cols || getTile(grid, cols, c + 1, r) === WALL
          if (southWall) {
            layer.add(new Konva.Rect({
              x: c * TILE_PX, y: (r + 1) * TILE_PX,
              width: TILE_PX, height: FACE_PX,
              fill: FACE_COLOR,
            }))
          }
          if (eastWall) {
            layer.add(new Konva.Rect({
              x: (c + 1) * TILE_PX, y: r * TILE_PX,
              width: FACE_PX, height: TILE_PX,
              fill: FACE_COLOR,
            }))
          }
        }
      }
    }

    if (showGrid) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(grid, cols, c, r) === FLOOR) {
            layer.add(new Konva.Rect({
              x: c * TILE_PX, y: r * TILE_PX,
              width: TILE_PX, height: TILE_PX,
              stroke: 'rgba(0,0,0,0.2)',
              strokeWidth: 0.5,
            }))
          }
        }
      }
    }

    layer.batchDraw()
  }, [grid, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso])

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
          const pivotY = isoBottom.y - billboardH / 2
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
          // Group positioned at tile iso center; skewX is applied before the translate.
          const group = new Konva.Group({
            x: isoCenter.x, y: isoCenter.y,
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
        draggable: !isGhost,
        opacity: isGhost ? 0.25 : 1,
      })
      if (!isGhost) {
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

      if (!isGhost && stamp.id === selectedStampId) {
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
  }, [stamps, selectedStampId, stampImages, cols, rows, showIso])

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
      const dotColor = isLightColor(wallColor)
        ? `rgba(0,0,0,${0.2 * wallOpacity})`
        : `rgba(255,255,255,${0.2 * wallOpacity})`
      for (let r = 0; r < rows; r += 2) {
        for (let c = 0; c < cols; c += 2) {
          if (getTile(grid, cols, c, r) === WALL) {
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
  }, [grid, ghostTiles, cols, rows, wallColor, wallOpacity, roughStart, roughEnd, roughPhase, roughPreview, showIso, selectedPaintState])

  const handleWidthChange = (inches: number) => {
    if (!Number.isFinite(inches) || inches < 1 || inches > 36) return
    const newCols = Math.round(inches * TILES_PER_INCH)
    if (newCols === cols) return
    setHistory(h => createHistory({ grid: resizeGrid(h.present.grid, cols, rows, newCols, rows), stamps: h.present.stamps }))
    setCols(newCols)
  }

  const handleHeightChange = (inches: number) => {
    if (!Number.isFinite(inches) || inches < 1 || inches > 36) return
    const newRows = Math.round(inches * TILES_PER_INCH)
    if (newRows === rows) return
    setHistory(h => createHistory({ grid: resizeGrid(h.present.grid, cols, rows, cols, newRows), stamps: h.present.stamps }))
    setRows(newRows)
  }

  const handleExport = useCallback(() => {
    if (!stampImages) return

    const layout = buildExportShapes({
      grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, stamps, exportTile: 60,
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
  }, [grid, stamps, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, stampImages])

  const handleSave = () => {
    const save = serialize({ grid, cols, rows, wallColor, wallOpacity, brushShape, showGrid, show3D, stamps })
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
      setHistory(createHistory({ grid: new Uint8Array(save.grid), stamps: save.stamps }))
      setCols(save.cols)
      setRows(save.rows)
      setWallColor(save.wallColor)
      setWallOpacity(save.wallOpacity)
      setBrushShape(save.brushShape)
      brushShapeRef.current = save.brushShape
      setShowGrid(save.showGrid)
      setShow3D(save.show3D)
      setSelectedStampId(null)
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
                setHistory(h => ({ ...h, present: { ...h.present, grid: savedGrid } }))
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
            onClick={() => setShow3D(v => !v)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: show3D ? '#555' : 'transparent',
              color: '#eee',
              border: show3D ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            ◫ 3D
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
