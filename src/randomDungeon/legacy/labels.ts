import { WALL } from '../../constants'
import type { Label } from '../../labels'
import { directionVector, turnLeft, turnRight } from './geometry'
import type { Direction, GeneratedLabelRecord, Point } from './types'

export const CONDITION_LABELS = { locked: 'Locked', trapped: 'Trapped', secret: 'Secret', flooded: 'Flooded', collapsed: 'Collapsed', converted: 'Converted', hazard: 'Hazard', 'locked + trapped': 'Locked + Trapped' } as const
export function conditionLabelText(condition: keyof typeof CONDITION_LABELS | string): string { return CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS] ?? condition }
const add = (a: Point, b: Point): Point => ({ col: a.col + b.col, row: a.row + b.row })

export function clockwiseAdjacentPositions(anchor: Point, facing: Direction): Point[] {
  const left = directionVector[turnLeft[facing]], forward = directionVector[facing], right = directionVector[turnRight[facing]], back = directionVector[turnRight[turnRight[facing]]]
  return [add(anchor, forward), add(anchor, right), add(anchor, back), add(anchor, left)]
}

export function placeGeneratedLabel(id: string, text: string, anchor: Point, facing: Direction, cols: number, rows: number, grid: Uint8Array, occupied: readonly Point[] = []): { label: Label; record: GeneratedLabelRecord } | null {
  const blocked = new Set(occupied.map(p => `${p.col},${p.row}`))
  for (const position of clockwiseAdjacentPositions(anchor, facing)) {
    if (position.col < 0 || position.row < 0 || position.col >= cols || position.row >= rows) continue
    const index = position.row * cols + position.col
    if (grid[index] !== WALL || blocked.has(`${position.col},${position.row}`)) continue
    const label = { id, col: position.col, row: position.row, text }
    return { label, record: { id, text, col: position.col, row: position.row, anchor, anchorKind: 'stamp' } }
  }
  return null
}
