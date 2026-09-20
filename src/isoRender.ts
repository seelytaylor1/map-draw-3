import type { Context } from 'konva/lib/Context'
import type { IsoShape } from './isoScene'

export type IsoShapeGroup =
  | { kind: 'batch'; shapes: IsoShape[] }
  | { kind: 'shape'; shape: IsoShape }

export interface IsoShapeBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Ordinary iso polygons have no interaction handlers of their own. Keep them
 * in painter order, but draw consecutive runs with one Konva Shape so a map
 * with many levels does not create one scene node per tile face.
 *
 * Structure polygons stay as individual nodes because App attaches selection
 * and drag handlers to those nodes. Opacity-bearing polygons also stay
 * separate because opacity is a node property in Konva.
 */
export function groupIsoShapes(shapes: IsoShape[]): IsoShapeGroup[] {
  const groups: IsoShapeGroup[] = []
  let batch: IsoShape[] = []

  const flush = () => {
    if (batch.length > 0) groups.push({ kind: 'batch', shapes: batch })
    batch = []
  }

  for (const shape of shapes) {
    const canBatch = shape.stepId === undefined
      && shape.rampId === undefined
      && shape.opacity === undefined
    if (canBatch) {
      batch.push(shape)
    } else {
      flush()
      groups.push({ kind: 'shape', shape })
    }
  }
  flush()
  return groups
}

export function getIsoShapeBounds(shapes: IsoShape[]): IsoShapeBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const shape of shapes) {
    for (let i = 0; i + 1 < shape.points.length; i += 2) {
      minX = Math.min(minX, shape.points[i])
      minY = Math.min(minY, shape.points[i + 1])
      maxX = Math.max(maxX, shape.points[i])
      maxY = Math.max(maxY, shape.points[i + 1])
    }
  }

  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function drawPolygon(context: Context, shape: IsoShape): void {
  const { points } = shape
  if (points.length < 4) return

  context.beginPath()
  context.moveTo(points[0], points[1])
  for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1])
  context.closePath()

  if (shape.fill !== undefined) {
    context.fillStyle = shape.fill
    context.fill()
  }
  if (shape.stroke !== undefined) {
    context.strokeStyle = shape.stroke
    context.lineWidth = shape.strokeWidth ?? 1
    context.stroke()
  }
}

export function drawIsoBatch(context: Context, shapes: IsoShape[]): void {
  for (const shape of shapes) drawPolygon(context, shape)
}
