import { FLOOR, FLOOR_COLOR, FACE_COLOR, FACE_PX, TILE_PX, getTileColor, type TileState } from './constants'
import { getTile } from './grid'
import { isoProject, isoStampTransform } from './iso'
import { isObjectStamp, stampFootprintSize, type Stamp } from './stamps'
import { buildIsoScene } from './isoScene'
import { buildTopDownShapes } from './topDownScene'
import { drawHatching, drawShadow, buildWallOutlineSegments, mergeOutlineSegments, roughenSegments, varyWidthsAlongStroke, OUTLINE_ROUGH_OPTS } from './patterns'
import { createTextureCanvas } from './texture'
import type { TextureSettings } from './styles'
export type RectSpec = {
  kind: 'rect'
  x: number; y: number; w: number; h: number
  fill: string
  opacity?: number
  stroke?: string
  strokeWidth?: number
}

export type PolygonSpec = {
  kind: 'polygon'
  points: number[]
  fill: string
  opacity?: number
  stroke?: string
  strokeWidth?: number
}

export type ImageSpec = {
  kind: 'image'
  stampType: string
  x: number; y: number; w: number; h: number
  offsetX: number; offsetY: number
  rotation: number
  opacity?: number
  color?: string
  scaleX?: number
  scaleY?: number
  skewX?: number
  mirrored?: boolean
}

export type CanvasSpec = {
  kind: 'canvas'
  canvas: HTMLCanvasElement
  x: number; y: number; w: number; h: number
  opacity?: number
}

export type LineSpec = {
  kind: 'line'
  points: number[]
  stroke: string
  strokeWidth: number
  opacity?: number
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
}

export type ShapeSpec = RectSpec | PolygonSpec | ImageSpec | CanvasSpec | LineSpec

export type ExportLayout = {
  canvasW: number
  canvasH: number
  offsetX: number
  shapes: ShapeSpec[]
}

export type BuildExportParams = {
  grid: Uint8Array
  cols: number
  rows: number
  showIso: boolean
  show3D: boolean
  showGrid: boolean
  wallColor: string
  wallOpacity: number
  frontFaceColor: string
  eastFaceColor: string
  stamps: Stamp[]
  showHatching?: boolean
  hatchColor?: string
  showWallOutline?: boolean
  wallOutlineColor?: string
  wallOutlineStyle?: 'clean' | 'rough'
  exportTile: number
  floorColor?: string
  waterColor: string
  lavaColor: string
  darknessColor: string
  environmentalColors?: Map<TileState, string>
  tileColorOverrides?: ReadonlyMap<number, string>
  layerOpacityById?: ReadonlyMap<string, number>
  textureGrid?: Uint8Array | null
  textureSettings?: TextureSettings
  textureOpacity?: number
  textureZ?: number
}

export function buildExportShapes(params: BuildExportParams): ExportLayout {
  const { grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, exportTile: T, floorColor = FLOOR_COLOR, waterColor, lavaColor, darknessColor, environmentalColors = new Map(), tileColorOverrides, layerOpacityById } = params

  if (showIso) {
    const layout = buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T, floorColor, waterColor, lavaColor, darknessColor, environmentalColors, tileColorOverrides, layerOpacityById })
    addTextureOverlay(layout, params, cols, rows, T, true)
    return layout
  }
  const layout = buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T, floorColor, waterColor, lavaColor, darknessColor, environmentalColors, tileColorOverrides, layerOpacityById })
  addTextureOverlay(layout, params, cols, rows, T, false)
  if (showHatching && hatchColor) {
    const hatchCanvas = document.createElement('canvas')
    hatchCanvas.width = cols * T
    hatchCanvas.height = rows * T
    const hatchCtx = hatchCanvas.getContext('2d')!
    drawHatching(hatchCtx, grid, cols, rows, T, hatchColor)
    layout.shapes.push({ kind: 'canvas', canvas: hatchCanvas, x: 0, y: 0, w: cols * T, h: rows * T })
  }
  if (showWallOutline && wallOutlineColor) {
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = cols * T
    shadowCanvas.height = rows * T
    const shadowCtx = shadowCanvas.getContext('2d')!
    drawShadow(shadowCtx, grid, cols, rows, T)
    layout.shapes.push({ kind: 'canvas', canvas: shadowCanvas, x: 0, y: 0, w: cols * T, h: rows * T })

    const outlineSegs = buildWallOutlineSegments(grid, cols, rows, T)
    const color = wallOutlineColor
    if (wallOutlineStyle === 'rough') {
      const polylines = roughenSegments(mergeOutlineSegments(outlineSegs), OUTLINE_ROUGH_OPTS, 77)
      const allSegs = polylines.flatMap((pl, i) => varyWidthsAlongStroke(pl, 2, 1, 77 + i))
      for (const { a, b, width } of allSegs) {
        layout.shapes.push({ kind: 'line', points: [...a, ...b], stroke: color, strokeWidth: width, lineCap: 'round' })
      }
    } else {
      for (const polyline of outlineSegs) {
        layout.shapes.push({ kind: 'line', points: (polyline as [number, number][]).flat(), stroke: color, strokeWidth: 2, lineCap: 'round', lineJoin: 'round' })
      }
    }
  }
  return layout
}

function addTextureOverlay(layout: ExportLayout, params: BuildExportParams, cols: number, rows: number, tileSize: number, isometric: boolean): void {
  if (!params.textureSettings || !params.textureGrid) return
  const generated = createTextureCanvas(params.textureGrid, cols, rows, tileSize, params.textureSettings, isometric, params.textureZ ?? 0)
  if (!generated) return
  const shape: CanvasSpec = {
    kind: 'canvas', canvas: generated.canvas, x: generated.x, y: generated.y,
    w: generated.canvas.width, h: generated.canvas.height,
    opacity: params.textureOpacity ?? 1,
  }
  const firstImage = layout.shapes.findIndex(item => item.kind === 'image')
  layout.shapes.splice(firstImage < 0 ? layout.shapes.length : firstImage, 0, shape)
}

function buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T, floorColor, waterColor, lavaColor, darknessColor, environmentalColors, tileColorOverrides, layerOpacityById }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean; showGrid: boolean
  wallColor: string; wallOpacity: number
  stamps: Stamp[]; T: number; floorColor: string
  waterColor: string; lavaColor: string; darknessColor: string
  environmentalColors: Map<TileState, string>
  tileColorOverrides?: ReadonlyMap<number, string>
  layerOpacityById?: ReadonlyMap<string, number>
}): ExportLayout {
  const canvasW = cols * T
  const canvasH = rows * T
  const faceT = Math.round(FACE_PX * T / TILE_PX)
  const shapes: ShapeSpec[] = []

  if (wallOpacity > 0) {
    shapes.push({ kind: 'rect', x: 0, y: 0, w: canvasW, h: canvasH, fill: wallColor, opacity: wallOpacity })
  }

  for (const s of buildTopDownShapes(grid, cols, rows, show3D)) {
    const composedColor = tileColorOverrides?.get(s.row * cols + s.col)
    switch (s.kind) {
      case 'floor':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: composedColor ?? floorColor })
        break
      case 'water':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: composedColor ?? waterColor })
        break
      case 'lava':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: composedColor ?? lavaColor })
        break
      case 'darkness':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: composedColor ?? darknessColor })
        break
      case 'environmental': {
        const color = composedColor ?? getTileColor(s.tileState as TileState, environmentalColors)
        if (color !== 'transparent') {
          shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: color })
        }
        break
      }
      case 'face':
        if (s.side === 'south') {
          shapes.push({ kind: 'rect', x: s.col * T, y: (s.row + 1) * T, w: T, h: faceT, fill: FACE_COLOR })
        } else {
          shapes.push({ kind: 'rect', x: (s.col + 1) * T, y: s.row * T, w: faceT, h: T, fill: FACE_COLOR })
        }
        break
    }
  }

  if (showGrid) {
    const sw = 0.5 * (T / TILE_PX)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (getTile(grid, cols, c, r) === FLOOR) {
          shapes.push({ kind: 'rect', x: c * T, y: r * T, w: T, h: T, fill: 'transparent', stroke: 'rgba(0,0,0,0.2)', strokeWidth: sw })
        }
      }
    }
  }

  for (const stamp of stamps) {
    if (isObjectStamp(stamp)) continue
    const sz = stampFootprintSize(stamp)
    const sc = stamp.scale ?? 1
    const w = sz.cols * T * sc
    const h = sz.rows * T * sc
    shapes.push({
      kind: 'image',
      stampType: stamp.type,
      x: stamp.col * T + sz.cols * T / 2,
      y: stamp.row * T + sz.rows * T / 2,
      w, h,
      offsetX: w / 2,
      offsetY: h / 2,
      rotation: stamp.rotation,
      opacity: layerOpacityById?.get(stamp.layerId ?? 'map') ?? 1,
      mirrored: stamp.mirrored,
      ...(stamp.color ? { color: stamp.color } : {}),
    })
  }

  return { canvasW, canvasH, offsetX: 0, shapes }
}

function buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T, floorColor, waterColor, lavaColor, darknessColor, environmentalColors, tileColorOverrides, layerOpacityById }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean
  wallColor: string; wallOpacity: number
  frontFaceColor: string; eastFaceColor: string
  stamps: Stamp[]; T: number; floorColor: string
  waterColor: string; lavaColor: string; darknessColor: string
  environmentalColors?: Map<number, string>
  tileColorOverrides?: ReadonlyMap<number, string>
  layerOpacityById?: ReadonlyMap<string, number>
}): ExportLayout {
  const ITW = T * 2
  const ITH = T
  const canvasW = (cols + rows) * T
  const canvasH = (cols + rows) * T / 2
  const offsetX = rows * T

  const isoShapes = buildIsoScene({
    grids: new Map([[0, grid]]),
    steps: [],
    ramps: [],
    cols, rows, show3D, wallColor, wallOpacity,
    frontFaceColor, eastFaceColor,
    floorColor,
    waterColor, lavaColor, darknessColor,
    environmentalColors: environmentalColors ?? new Map(),
    tileColorOverrides: new Map([[0, tileColorOverrides ?? new Map()]]),
    selectedStepId: null, selectedRampId: null,
    tileW: ITW, tileH: ITH,
    facePx: Math.round(FACE_PX * T / TILE_PX),
  })

  const shapes: ShapeSpec[] = isoShapes.map(s => ({
    kind: 'polygon' as const,
    points: s.points,
    fill: s.fill ?? floorColor,
    opacity: s.opacity,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
  }))

  for (const stamp of stamps) {
    const sz = stampFootprintSize(stamp)
    const sc = stamp.scale ?? 1
    const w = sz.cols * T * sc
    const h = sz.rows * T * sc
    const isoCenter = isoProject(stamp.col + sz.cols / 2, stamp.row + sz.rows / 2, ITW, ITH)
    const isoBottom = isoProject(stamp.col + sz.cols, stamp.row + sz.rows, ITW, ITH)
    if (isObjectStamp(stamp)) {
      shapes.push({
        kind: 'image',
        stampType: stamp.type,
        x: isoCenter.x,
        y: isoBottom.y,
        w: sz.cols * T * 2 * sc,
        h,
        offsetX: sz.cols * T * sc,
        offsetY: h,
        rotation: 0,
        opacity: layerOpacityById?.get(stamp.layerId ?? 'map') ?? 1,
        mirrored: stamp.mirrored,
        ...(stamp.color ? { color: stamp.color } : {}),
      })
    } else {
      const t = isoStampTransform(stamp.rotation)
      shapes.push({
        kind: 'image',
        stampType: stamp.type,
        x: isoCenter.x,
        y: isoCenter.y,
        w, h,
        offsetX: w / 2,
        offsetY: h / 2,
        rotation: t.rotation,
        opacity: layerOpacityById?.get(stamp.layerId ?? 'map') ?? 1,
        scaleX: stamp.mirrored ? -t.scaleX : t.scaleX,
        scaleY: t.scaleY,
        skewX: t.skewX,
        ...(stamp.color ? { color: stamp.color } : {}),
      })
    }
  }

  return { canvasW, canvasH, offsetX, shapes }
}
