import { FLOOR, FLOOR_COLOR, FACE_COLOR, FACE_PX, TILE_PX, WATER_COLOR } from './constants'
import { getTile } from './grid'
import { isoProject, isoStampTransform } from './iso'
import { isObjectStamp, stampSize, type Stamp } from './stamps'
import { buildIsoScene } from './isoScene'
import { buildTopDownShapes } from './topDownScene'
import { deriveFaceColors } from './faceColors'
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
  scaleX?: number
  scaleY?: number
  skewX?: number
  mirrored?: boolean
}

export type ShapeSpec = RectSpec | PolygonSpec | ImageSpec

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
  exportTile: number
}

export function buildExportShapes(params: BuildExportParams): ExportLayout {
  const { grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, exportTile: T } = params

  if (showIso) {
    return buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T })
  }
  return buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T })
}

function buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean; showGrid: boolean
  wallColor: string; wallOpacity: number
  stamps: Stamp[]; T: number
}): ExportLayout {
  const canvasW = cols * T
  const canvasH = rows * T
  const faceT = Math.round(FACE_PX * T / TILE_PX)
  const shapes: ShapeSpec[] = []

  if (wallOpacity > 0) {
    shapes.push({ kind: 'rect', x: 0, y: 0, w: canvasW, h: canvasH, fill: wallColor, opacity: wallOpacity })
  }

  for (const s of buildTopDownShapes(grid, cols, rows, show3D)) {
    switch (s.kind) {
      case 'floor':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: FLOOR_COLOR })
        break
      case 'water':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: WATER_COLOR })
        break
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
    const sz = stampSize(stamp.type)
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
      mirrored: stamp.mirrored,
    })
  }

  return { canvasW, canvasH, offsetX: 0, shapes }
}

function buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean
  wallColor: string; wallOpacity: number
  frontFaceColor: string; eastFaceColor: string
  stamps: Stamp[]; T: number
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
    selectedStepId: null, selectedRampId: null,
    tileW: ITW, tileH: ITH,
    facePx: Math.round(FACE_PX * T / TILE_PX),
  })

  const shapes: ShapeSpec[] = isoShapes.map(s => ({
    kind: 'polygon' as const,
    points: s.points,
    fill: s.fill ?? FLOOR_COLOR,
    opacity: s.opacity,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
  }))

  for (const stamp of stamps) {
    const sz = stampSize(stamp.type)
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
        mirrored: stamp.mirrored,
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
        scaleX: stamp.mirrored ? -t.scaleX : t.scaleX,
        scaleY: t.scaleY,
        skewX: t.skewX,
      })
    }
  }

  return { canvasW, canvasH, offsetX, shapes }
}
