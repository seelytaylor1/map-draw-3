import { FLOOR, WALL, WATER, type TileState } from '../constants'
import { createGrid } from '../grid'
import type { Direction, FailureReason, Point } from './types'

export interface PlacementFailure { reason: FailureReason; candidate: Point[]; message: string }
export interface PlacementSuccess { grid: Uint8Array; points: Point[] }

const key = (p: Point) => `${p.col},${p.row}`
const neighbors = (p: Point) => { const out: Point[] = []; for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) if (col || row) out.push({ col: p.col + col, row: p.row + row }); return out }

export class PlacementLedger {
  readonly cols: number
  readonly rows: number
  private _grid: Uint8Array
  private occupied = new Set<string>()

  constructor(cols: number, rows: number, initial?: Uint8Array) { this.cols = cols; this.rows = rows; this._grid = initial?.slice() ?? createGrid(cols, rows); for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (this._grid[row * cols + col] !== WALL) this.occupied.add(`${col},${row}`) }
  get grid(): Uint8Array { return this._grid.slice() }
  restore(grid: Uint8Array): void { this._grid = grid.slice(); this.occupied = new Set<string>(); for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) if (this._grid[row * this.cols + col] !== WALL) this.occupied.add(`${col},${row}`) }
  isInside(p: Point): boolean { return p.col >= 0 && p.row >= 0 && p.col < this.cols && p.row < this.rows }
  isTraversable(p: Point): boolean { if (!this.isInside(p)) return false; const state = this._grid[p.row * this.cols + p.col]; return state === FLOOR || state === WATER }
  connectionEntrances(origin: Point): Point[] {
    return [origin, ...neighbors(origin).filter(point => this.occupied.has(key(point)))]
  }

  validate(points: Point[], entrances: Point[] = []): PlacementFailure | null {
    const candidate = [...new Map(points.map(p => [key(p), p])).values()]
    const proposed = new Set(candidate.map(key)); const allowed = new Set(entrances.map(key))
    for (const p of candidate) {
      if (!this.isInside(p) || p.col === 0 || p.row === 0 || p.col === this.cols - 1 || p.row === this.rows - 1) return { reason: 'out-of-bounds', candidate, message: 'Candidate touches or crosses the one-tile Wall border.' }
      if (this.occupied.has(key(p)) && !allowed.has(key(p))) return { reason: 'overlap', candidate, message: `Candidate overlaps existing geometry at ${p.col},${p.row}.` }
    }
    for (const p of candidate) {
      for (const n of neighbors(p)) {
        const nKey = key(n)
        if (proposed.has(nKey) || allowed.has(nKey)) continue
        if (this.occupied.has(nKey)) return { reason: 'lost-buffer', candidate, message: `Candidate loses its one-tile Wall buffer near ${n.col},${n.row}.` }
      }
    }
    return null
  }

  commit(points: Point[], state: TileState = FLOOR, entrances: Point[] = []): PlacementSuccess | PlacementFailure {
    const failure = this.validate(points, entrances); if (failure) return failure
    const next = this._grid.slice(); const accepted = [...new Map(points.map(p => [key(p), p])).values()]
    for (const p of accepted) { next[p.row * this.cols + p.col] = state; this.occupied.add(key(p)) }
    this._grid = next
    return { grid: this.grid, points: accepted }
  }

  commitTransaction(writes: { points: Point[]; state?: TileState; entrances?: Point[] }[]): PlacementSuccess | PlacementFailure {
    const all = writes.flatMap(w => w.points); const entrances = writes.flatMap(w => w.entrances ?? [])
    const failure = this.validate(all, entrances); if (failure) return failure
    const next = this._grid.slice()
    for (const write of writes) for (const p of write.points) { next[p.row * this.cols + p.col] = write.state ?? FLOOR; this.occupied.add(key(p)) }
    this._grid = next
    return { grid: this.grid, points: all }
  }
}

export function validateCandidate(cols: number, rows: number, grid: Uint8Array, points: Point[], entrances: Point[] = []): PlacementFailure | null { return new PlacementLedger(cols, rows, grid).validate(points, entrances) }
export function directionFromVector(direction: Direction): Point { return direction === 'N' ? { col: 0, row: -1 } : direction === 'E' ? { col: 1, row: 0 } : direction === 'S' ? { col: 0, row: 1 } : { col: -1, row: 0 } }
