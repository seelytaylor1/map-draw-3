import type { Label } from '../labels'
import type { Stamp } from '../stamps'
import type { StepRun } from '../steps'
import type { RampRun } from '../ramps'

/** Shared grid vocabulary used by both the mission-first and legacy Adapters. */
export type Point = { col: number; row: number }
export type Direction = 'N' | 'E' | 'S' | 'W'
export type GeneratedMarkerSemantic = 'key' | 'lock' | 'secret' | 'danger' | 'blocked-return' | 'one-way' | 'hub'

/** The authoritative Map-shaped result produced before the App commits history. */
export interface AppSnapshotShape {
  grids: Map<number, Uint8Array>
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors: Map<number, string>
}
