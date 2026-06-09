import { FLOOR, FLOOR_COLOR, FACE_COLOR, ISO_FRONT_FACE_COLOR, ISO_EAST_FACE_COLOR, FACE_PX, TILE_PX, WALL, WATER, WATER_COLOR } from './constants'
import { getTile } from './grid'
import { isoFloorPoints, isoFrontFacePoints, isoEastFacePoints, isoWaterPoints, isoProject, isoStampTransform } from './iso'
import { isObjectStamp, stampSize, type Stamp } from './stamps'

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
  stamps: Stamp[]
  exportTile: number
}

export function buildExportShapes(params: BuildExportParams): ExportLayout {
  const { grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, stamps, exportTile: T } = params

  if (showIso) {
    return buildIsoShapes({ grid, cols, rows, show3D, wallColor, wallOpacity, stamps, T })
  }
  return buildTopDownShapes({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T })
}

function buildTopDownShapes({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean; showGrid: boolean
  wallColor: string; wallOpacity: number
  stamps: Stamp[]; T: number
}): ExportLayout {
  const canvasW = cols * T
  const canvasH = rows * T
  const shapes: ShapeSpec[] = []

  if (wallOpacity > 0) {
    shapes.push({ kind: 'rect', x: 0, y: 0, w: canvasW, h: canvasH, fill: wallColor, opacity: wallOpacity })
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getTile(grid, cols, c, r) === FLOOR) {
        shapes.push({ kind: 'rect', x: c * T, y: r * T, w: T, h: T, fill: FLOOR_COLOR })
      } else if (getTile(grid, cols, c, r) === WATER) {
        shapes.push({ kind: 'rect', x: c * T, y: r * T, w: T, h: T, fill: WATER_COLOR })
      }
    }
  }

  if (show3D) {
    const faceT = Math.round(FACE_PX * T / TILE_PX)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (getTile(grid, cols, c, r) !== FLOOR) continue
        const southWall = r + 1 >= rows || getTile(grid, cols, c, r + 1) === WALL
        const eastWall = c + 1 >= cols || getTile(grid, cols, c + 1, r) === WALL
        if (southWall) {
          shapes.push({ kind: 'rect', x: c * T, y: (r + 1) * T, w: T, h: faceT, fill: FACE_COLOR })
        }
        if (eastWall) {
          shapes.push({ kind: 'rect', x: (c + 1) * T, y: r * T, w: faceT, h: T, fill: FACE_COLOR })
        }
      }
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

function buildIsoShapes({ grid, cols, rows, show3D, wallColor, wallOpacity, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean
  wallColor: string; wallOpacity: number
  stamps: Stamp[]; T: number
}): ExportLayout {
  const ITW = T * 2
  const ITH = T
  const canvasW = (cols + rows) * T
  const canvasH = (cols + rows) * T / 2
  const offsetX = rows * T
  const shapes: ShapeSpec[] = []

  if (wallOpacity > 0) {
    const tl = isoProject(0, 0, ITW, ITH)
    const tr = isoProject(cols, 0, ITW, ITH)
    const br = isoProject(cols, rows, ITW, ITH)
    const bl = isoProject(0, rows, ITW, ITH)
    shapes.push({
      kind: 'polygon',
      points: [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y],
      fill: wallColor,
      opacity: wallOpacity,
    })
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getTile(grid, cols, c, r) === FLOOR) {
        shapes.push({
          kind: 'polygon',
          points: isoFloorPoints(c, r, ITW, ITH),
          fill: FLOOR_COLOR,
          stroke: 'rgba(0,0,0,0.15)',
          strokeWidth: 0.5,
        })
      } else if (getTile(grid, cols, c, r) === WATER) {
        shapes.push({
          kind: 'polygon',
          points: isoWaterPoints(c, r, ITW, ITH),
          fill: WATER_COLOR,
        })
      }
    }

    if (show3D) {
      const faceT = Math.round(FACE_PX * T / TILE_PX)
      for (let c = 0; c < cols; c++) {
        if (getTile(grid, cols, c, r) !== FLOOR) continue
        const southNeighbor = r + 1 < rows ? getTile(grid, cols, c, r + 1) : null
        const eastNeighbor = c + 1 < cols ? getTile(grid, cols, c + 1, r) : null
        const southWall = r + 1 >= rows || southNeighbor === WALL || southNeighbor === WATER
        const eastWall = c + 1 >= cols || eastNeighbor === WALL || eastNeighbor === WATER
        if (southWall) {
          shapes.push({
            kind: 'polygon',
            points: isoFrontFacePoints(c, r, ITW, ITH, faceT),
            fill: ISO_FRONT_FACE_COLOR,
          })
        }
        if (eastWall) {
          shapes.push({
            kind: 'polygon',
            points: isoEastFacePoints(c, r, ITW, ITH, faceT),
            fill: ISO_EAST_FACE_COLOR,
          })
        }
      }
    }
  }

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
