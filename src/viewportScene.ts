// src/viewportScene.ts
//
// Pure "what to draw" builders for the top-down viewport. Each function takes
// the reactive map state and returns plain shape data in pixel space — no
// Konva, no DOM canvas mutation. The App.tsx layer effects are thin adapters
// that walk this output and create/attach Konva nodes.
//
// Iso-mode tile rendering already has this seam (buildIsoScene in isoScene.ts)
// and is intentionally left alone here. The dot/preview layer (ghost cursor,
// rough-mode preview) is ephemeral cursor feedback, not map content, and stays
// imperative in App.tsx.

import { FACE_COLOR, FLOOR, FLOOR_COLOR, LAVA, DARKNESS, GRASS, ROAD, SAND, MUD, STONE, MOSSY_STONE, RUBBLE, WALL, WATER, getTileColor, type TileState, Z_STEP_HEIGHT } from './constants'
import { createGrid, getTile } from './grid'
import { isoProject, isoStampTransform } from './iso'
import {
  buildHatchPolylines, buildWallOutlineSegments, mergeOutlineSegments,
  roughenSegments, varyWidthsAlongStroke, OUTLINE_ROUGH_OPTS,
} from './patterns'
import { isObjectStamp, stampSize, type Stamp, type StampType, type ObjectStampType } from './stamps'
import { stepRunTiles, topDownStepFaceRect, topDownStepRects, type StepRun } from './steps'
import { rampRunTiles, topDownRampFaceRect, topDownRampRect, type RampRun } from './ramps'
import type { Label } from './labels'

// ---------------------------------------------------------------------------
// Tile scene (top-down)
// ---------------------------------------------------------------------------

export interface PxRect { x: number; y: number; w: number; h: number }

export interface TileFillShape { kind: 'tile'; rect: PxRect; fill: string }

export interface RunShape {
  kind: 'run'
  runType: 'step' | 'ramp'
  id: string
  faceRect: PxRect | null
  footprint: PxRect[]
  selected: boolean
  selectionRect: PxRect | null
}

export interface OutlineSegment { points: number[]; strokeWidth: number }

export interface LevelScene {
  z: number
  opacity: number
  interactive: boolean
  grid: Uint8Array
  tiles: TileFillShape[]
  faces: PxRect[]
  gridLines: PxRect[]
  runs: RunShape[]
  hatchPolylines: [number, number][][] | null
  drawShadow: boolean
  outline: { segments: OutlineSegment[]; color: string } | null
}

export interface TileSceneState {
  grids: Map<number, Uint8Array>
  steps: StepRun[]
  ramps: RampRun[]
  cols: number
  rows: number
  activeZ: number
  tilePx: number
  facePx: number
  show3D: boolean
  showGrid: boolean
  showHatching: boolean
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
  wallColor: string
  wallOpacity: number
  selectedStepId: string | null
  selectedRampId: string | null
  waterColor: string
  lavaColor: string
  darknessColor: string
  environmentalColors: Map<TileState, string>
}

export interface TileScene {
  canvasW: number
  canvasH: number
  wallBackground: { fill: string; opacity: number } | null
  levels: LevelScene[]
}

function rect(col: number, row: number, w: number, h: number, tilePx: number): PxRect {
  return { x: col * tilePx, y: row * tilePx, w: w * tilePx, h: h * tilePx }
}

function selectionBounds(tiles: { col: number; row: number }[], tilePx: number): PxRect {
  const minC = Math.min(...tiles.map(t => t.col))
  const minR = Math.min(...tiles.map(t => t.row))
  const maxC = Math.max(...tiles.map(t => t.col))
  const maxR = Math.max(...tiles.map(t => t.row))
  return {
    x: minC * tilePx - 1, y: minR * tilePx - 1,
    w: (maxC - minC + 1) * tilePx + 2, h: (maxR - minR + 1) * tilePx + 2,
  }
}

function buildOutline(grid: Uint8Array, cols: number, rows: number, tilePx: number, style: 'clean' | 'rough', color: string): { segments: OutlineSegment[]; color: string } {
  const raw = buildWallOutlineSegments(grid, cols, rows, tilePx)
  const segments: OutlineSegment[] = []
  if (style === 'rough') {
    const polylines = roughenSegments(mergeOutlineSegments(raw), OUTLINE_ROUGH_OPTS, 77)
    const allSegs = polylines.flatMap((pl, i) => varyWidthsAlongStroke(pl, 2, 1, 77 + i))
    for (const { a, b, width } of allSegs) {
      segments.push({ points: [...a, ...b], strokeWidth: width })
    }
  } else {
    for (const polyline of raw) {
      if (polyline.length < 2) continue
      segments.push({ points: (polyline as [number, number][]).flat(), strokeWidth: 2 })
    }
  }
  return { segments, color }
}

function buildRunShapes(steps: StepRun[], ramps: RampRun[], z: number, tilePx: number, facePx: number, show3D: boolean, selectedStepId: string | null, selectedRampId: string | null): RunShape[] {
  const runs: RunShape[] = []
  for (const run of steps) {
    if (run.z !== z) continue
    const footprint = topDownStepRects(run).map(r => rect(r.x, r.y, r.width, r.height, tilePx))
    const faceBand = show3D ? topDownStepFaceRect(run, tilePx, facePx) : null
    const selected = run.id === selectedStepId
    runs.push({
      kind: 'run', runType: 'step', id: run.id,
      faceRect: faceBand ? { x: faceBand.x, y: faceBand.y, w: faceBand.width, h: faceBand.height } : null,
      footprint,
      selected,
      selectionRect: selected ? selectionBounds(stepRunTiles(run), tilePx) : null,
    })
  }
  for (const run of ramps) {
    if (run.z !== z) continue
    const r = topDownRampRect(run)
    const faceBand = show3D ? topDownRampFaceRect(run, tilePx, facePx) : null
    const selected = run.id === selectedRampId
    runs.push({
      kind: 'run', runType: 'ramp', id: run.id,
      faceRect: faceBand ? { x: faceBand.x, y: faceBand.y, w: faceBand.width, h: faceBand.height } : null,
      footprint: [rect(r.x, r.y, r.width, r.height, tilePx)],
      selected,
      selectionRect: selected ? selectionBounds(rampRunTiles(run), tilePx) : null,
    })
  }
  return runs
}

function buildTileFills(grid: Uint8Array, cols: number, rows: number, tilePx: number, waterColor: string, lavaColor: string, darknessColor: string, environmentalColors: Map<TileState, string>): TileFillShape[] {
  const tiles: TileFillShape[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = getTile(grid, cols, c, r) as TileState
      if (t === FLOOR)       tiles.push({ kind: 'tile', rect: rect(c, r, 1, 1, tilePx), fill: FLOOR_COLOR })
      else if (t === WATER)    tiles.push({ kind: 'tile', rect: rect(c, r, 1, 1, tilePx), fill: waterColor })
      else if (t === LAVA)     tiles.push({ kind: 'tile', rect: rect(c, r, 1, 1, tilePx), fill: lavaColor })
      else if (t === DARKNESS) tiles.push({ kind: 'tile', rect: rect(c, r, 1, 1, tilePx), fill: darknessColor })
      else if (t === GRASS || t === ROAD || t === SAND || t === MUD || t === STONE || t === MOSSY_STONE || t === RUBBLE) {
        const color = getTileColor(t, environmentalColors)
        tiles.push({ kind: 'tile', rect: rect(c, r, 1, 1, tilePx), fill: color })
      }
    }
  }
  return tiles
}

export function buildTileScene(state: TileSceneState): TileScene {
  const {
    grids, steps, ramps, cols, rows, activeZ, tilePx, facePx,
    show3D, showGrid, showHatching, showWallOutline, wallOutlineColor, wallOutlineStyle,
    wallColor, wallOpacity, selectedStepId, selectedRampId,
    waterColor, lavaColor, darknessColor, environmentalColors,
  } = state

  const zSet = new Set(grids.keys())
  for (const run of steps) zSet.add(run.z)
  for (const run of ramps) zSet.add(run.z)

  const levels: LevelScene[] = []

  const belowAndActive = [...zSet].filter(z => z <= activeZ).sort((a, b) => a - b)
  for (const z of belowAndActive) {
    const levelGrid = grids.get(z) ?? createGrid(cols, rows)
    const faces: PxRect[] = []
    if (show3D) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(levelGrid, cols, c, r) !== FLOOR) continue
          const southN = r + 1 < rows ? getTile(levelGrid, cols, c, r + 1) : null
          const eastN  = c + 1 < cols ? getTile(levelGrid, cols, c + 1, r) : null
          const southWall = r + 1 >= rows || southN === WALL || southN === WATER || southN === LAVA || southN === DARKNESS
          const eastWall = c + 1 >= cols || eastN === WALL || eastN === WATER || eastN === LAVA || eastN === DARKNESS
          if (southWall) faces.push(rect(c, r + 1, 1, facePx / tilePx, tilePx))
          if (eastWall) faces.push(rect(c + 1, r, facePx / tilePx, 1, tilePx))
        }
      }
    }
    const gridLines: PxRect[] = []
    if (showGrid) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(levelGrid, cols, c, r) === FLOOR) gridLines.push(rect(c, r, 1, 1, tilePx))
        }
      }
    }
    levels.push({
      z,
      opacity: Math.pow(0.5, activeZ - z),
      interactive: true,
      grid: levelGrid,
      tiles: buildTileFills(levelGrid, cols, rows, tilePx, waterColor, lavaColor, darknessColor, environmentalColors),
      faces,
      gridLines,
      runs: buildRunShapes(steps, ramps, z, tilePx, facePx, show3D, selectedStepId, selectedRampId),
      hatchPolylines: showHatching ? buildHatchPolylines(levelGrid, cols, rows, tilePx) : null,
      drawShadow: showWallOutline,
      outline: showWallOutline ? buildOutline(levelGrid, cols, rows, tilePx, wallOutlineStyle, wallOutlineColor) : null,
    })
  }

  const aboveZs = [...zSet].filter(z => z > activeZ).sort((a, b) => a - b)
  for (const z of aboveZs) {
    const levelGrid = grids.get(z) ?? createGrid(cols, rows)
    const runs = buildRunShapes(steps, ramps, z, tilePx, facePx, false, null, null)
    levels.push({
      z,
      opacity: 0.25 * Math.pow(0.6, z - activeZ - 1),
      interactive: false,
      grid: levelGrid,
      tiles: buildTileFills(levelGrid, cols, rows, tilePx, waterColor, lavaColor, darknessColor, environmentalColors),
      faces: [],
      gridLines: [],
      runs: runs.map(r => ({ ...r, selected: false, selectionRect: null })),
      hatchPolylines: null,
      drawShadow: false,
      outline: null,
    })
  }

  return {
    canvasW: cols * tilePx,
    canvasH: rows * tilePx,
    wallBackground: wallOpacity > 0 ? { fill: wallColor, opacity: wallOpacity } : null,
    levels,
  }
}

// ---------------------------------------------------------------------------
// Stamp scene (top-down + iso)
// ---------------------------------------------------------------------------

export type StampVariant =
  | { kind: 'topdown'; x: number; y: number; w: number; h: number; rotation: number; mirrored: boolean; opacity: number; draggable: boolean; listening: boolean }
  | { kind: 'isoBillboard'; x: number; y: number; w: number; h: number; rotation: number; mirrored: boolean }
  | { kind: 'isoFloor'; x: number; y: number; w: number; h: number; rotation: number; scaleX: number; scaleY: number; skewX: number }

export interface StampSceneItem {
  id: string
  stampType: StampType | ObjectStampType
  selected: boolean
  interactive: boolean
  variant: StampVariant
  selectionRect: PxRect | null
}

export interface StampSceneState {
  stamps: Stamp[]
  selectedStampId: string | null
  stampImages: Map<string, HTMLImageElement>
  activeZ: number
  tilePx: number
  showIso: boolean
}

export function buildStampScene(state: StampSceneState): StampSceneItem[] {
  const { stamps, selectedStampId, stampImages, activeZ, tilePx, showIso } = state
  const items: StampSceneItem[] = []

  for (const stamp of stamps) {
    const sz = stampSize(stamp.type)
    const w = sz.cols * tilePx
    const h = sz.rows * tilePx
    const imgEl = stampImages.get(stamp.type)
    if (!imgEl) continue
    const selected = stamp.id === selectedStampId

    if (showIso) {
      const isoCenter = isoProject(stamp.col + sz.cols / 2, stamp.row + sz.rows / 2, tilePx * 2, tilePx)
      const isoBottom = isoProject(stamp.col + sz.cols, stamp.row + sz.rows, tilePx * 2, tilePx)
      if (isObjectStamp(stamp)) {
        const sc = stamp.scale ?? 1
        const bw = sz.cols * tilePx * 2 * sc
        const billboardH = imgEl.naturalWidth > 0 ? Math.round(bw * imgEl.naturalHeight / imgEl.naturalWidth) : h * sc
        const pivotX = isoCenter.x
        const zOffsetY = -stamp.z * Z_STEP_HEIGHT
        const pivotY = isoBottom.y - billboardH / 2 + zOffsetY
        items.push({
          id: stamp.id, stampType: stamp.type, selected, interactive: true,
          variant: { kind: 'isoBillboard', x: pivotX, y: pivotY, w: bw, h: billboardH, rotation: stamp.rotation, mirrored: !!stamp.mirrored },
          selectionRect: selected ? { x: pivotX - (bw + 2) / 2, y: pivotY - (billboardH + 2) / 2, w: bw + 2, h: billboardH + 2 } : null,
        })
      } else {
        const sc = stamp.scale ?? 1
        const effectiveW = w * sc
        const effectiveH = h * sc
        const t = isoStampTransform(stamp.rotation)
        const zOffsetY = -stamp.z * Z_STEP_HEIGHT
        items.push({
          id: stamp.id, stampType: stamp.type, selected, interactive: true,
          variant: {
            kind: 'isoFloor', x: isoCenter.x, y: isoCenter.y + zOffsetY, w: effectiveW, h: effectiveH,
            rotation: t.rotation, scaleX: stamp.mirrored ? -t.scaleX : t.scaleX, scaleY: t.scaleY, skewX: t.skewX,
          },
          selectionRect: null, // drawn relative to the iso group itself by the adapter
        })
      }
      continue
    }

    const isAbove = stamp.z > activeZ
    const stampOpacity = isAbove
      ? 0.25 * Math.pow(0.6, stamp.z - activeZ - 1)
      : Math.pow(0.5, activeZ - stamp.z)
    const sc = stamp.scale ?? 1
    const effectiveW = w * sc
    const effectiveH = h * sc
    const x = stamp.col * tilePx + w / 2
    const y = stamp.row * tilePx + h / 2
    const interactive = !isAbove
    items.push({
      id: stamp.id, stampType: stamp.type, selected: interactive && selected, interactive,
      variant: {
        kind: 'topdown', x, y, w: effectiveW, h: effectiveH, rotation: stamp.rotation, mirrored: !!stamp.mirrored,
        opacity: stampOpacity,
        draggable: !isAbove,
        listening: !isAbove,
      },
      selectionRect: interactive && selected
        ? { x: x - (effectiveW + 2) / 2, y: y - (effectiveH + 2) / 2, w: effectiveW + 2, h: effectiveH + 2 }
        : null,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Label scene (top-down only — iso shows none)
// ---------------------------------------------------------------------------

export interface LabelSceneItem {
  id: string
  text: string
  x: number; y: number; width: number; fontSize: number
  selected: boolean
  selectionRect: PxRect | null
}

export function buildLabelScene(labels: Label[], selectedLabelId: string | null, tilePx: number): LabelSceneItem[] {
  return labels.map(label => {
    const displayText = label.number !== undefined ? `${label.number}` : label.text
    const textWidth = tilePx * 4
    const fontSize = label.number !== undefined ? 14 : 10
    const x = label.col * tilePx + tilePx / 2 - textWidth / 2
    const y = label.row * tilePx + tilePx / 2 - 7
    const selected = label.id === selectedLabelId
    return {
      id: label.id, text: displayText, x, y, width: textWidth, fontSize, selected,
      selectionRect: selected ? { x: x - 2, y: y - 2, w: textWidth + 4, h: fontSize + 4 } : null,
    }
  })
}
