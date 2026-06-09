export const TILE_PX = 20          // screen pixels per tile (display resolution)
export const FACE_PX = 8           // 3D side-face thickness in pixels
export const TILES_PER_INCH = 5
export const DEFAULT_COLS = 55     // 11" × 5
export const DEFAULT_ROWS = 42     // 8.5" × 5 (landscape)
export const WALL = 0 as const
export const FLOOR = 1 as const
export const WATER = 2 as const
export type TileState = typeof WALL | typeof FLOOR | typeof WATER

export const FLOOR_COLOR = '#f5f0e8'
export const WATER_COLOR = '#6baed6'
export const FACE_COLOR = '#6a5040'
export const ISO_FRONT_FACE_COLOR = '#5a4030'
export const ISO_EAST_FACE_COLOR = '#7a5a44'
