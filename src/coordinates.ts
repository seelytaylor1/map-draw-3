import type { Tile } from './drawingState'

export function formatTileCoordinate(tile: Tile): string {
  return `${tile.col}, ${tile.row}`
}
