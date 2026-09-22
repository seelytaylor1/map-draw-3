import { WALL } from './constants'
import { isChestStamp, isHazardStamp, isLockedDoorStamp, isSecretDoorStamp, stampFootprintSize, type Stamp } from './stamps'

/** Returns a render-only grid with secret-door footprints concealed as walls. */
export function applyPlayerViewSecretDoors(
  grid: Uint8Array,
  cols: number,
  rows: number,
  z: number,
  stamps: readonly Stamp[],
): Uint8Array {
  const secretDoors = stamps.filter(stamp => stamp.z === z && isSecretDoorStamp(stamp))
  if (secretDoors.length === 0) return grid

  const rendered = grid.slice()

  for (const stamp of secretDoors) {
    const size = stampFootprintSize(stamp)
    for (let row = stamp.row; row < stamp.row + size.rows; row++) {
      for (let col = stamp.col; col < stamp.col + size.cols; col++) {
        if (col >= 0 && row >= 0 && col < cols && row < rows) rendered[row * cols + col] = WALL
      }
    }
  }

  return rendered
}

/** Returns the map layers that should be visible in a player-facing export. */
export function buildPlayerViewExport(
  grid: Uint8Array,
  cols: number,
  rows: number,
  z: number,
  stamps: readonly Stamp[],
): { grid: Uint8Array; stamps: Stamp[] } {
  return {
    grid: applyPlayerViewSecretDoors(grid, cols, rows, z, stamps),
    stamps: stamps
      .filter(stamp => !isSecretDoorStamp(stamp) && !isHazardStamp(stamp) && !isChestStamp(stamp))
      .map(stamp => isLockedDoorStamp(stamp) ? { ...stamp, type: 'Door1x1' as const } : stamp),
  }
}
