import { WALL } from './constants'
import { isSecretDoorStamp, stampSize, type Stamp } from './stamps'

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
    const size = stampSize(stamp.type)
    for (let row = stamp.row; row < stamp.row + size.rows; row++) {
      for (let col = stamp.col; col < stamp.col + size.cols; col++) {
        if (col >= 0 && row >= 0 && col < cols && row < rows) rendered[row * cols + col] = WALL
      }
    }
  }

  return rendered
}
