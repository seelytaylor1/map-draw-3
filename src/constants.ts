export const TILE_PX = 20          // screen pixels per tile (display resolution)
export const FACE_PX = 8           // 3D side-face thickness in pixels
export const TILES_PER_INCH = 5
export const DEFAULT_COLS = 55     // 11" × 5
export const DEFAULT_ROWS = 42     // 8.5" × 5 (landscape)
export const WALL = 0 as const
export const FLOOR = 1 as const
export const WATER = 2 as const
export const LAVA = 3 as const
export const DARKNESS = 4 as const
export type TileState = typeof WALL | typeof FLOOR | typeof WATER | typeof LAVA | typeof DARKNESS

export const FLOOR_COLOR = '#f5f0e8'
export const WATER_COLOR = '#6baed6'
export const LAVA_COLOR = '#c1440e'
export const DARKNESS_COLOR = '#1a0a2e'
export const FACE_COLOR = '#6a5040'

export const Z_STEP_HEIGHT = TILE_PX / 2 + FACE_PX  // 18px at current constants
export const WATER_OFFSET_Y = 4
