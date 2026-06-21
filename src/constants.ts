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
export const GRASS = 5 as const
export const ROAD = 6 as const
export const SAND = 7 as const
export const MUD = 8 as const
export const STONE = 9 as const
export const MOSSY_STONE = 10 as const
export const RUBBLE = 11 as const
export type TileState = typeof WALL | typeof FLOOR | typeof WATER | typeof LAVA | typeof DARKNESS | typeof GRASS | typeof ROAD | typeof SAND | typeof MUD | typeof STONE | typeof MOSSY_STONE | typeof RUBBLE

export const FLOOR_COLOR = '#f5f0e8'
export const WATER_COLOR = '#6baed6'
export const LAVA_COLOR = '#c1440e'
export const DARKNESS_COLOR = '#1a0a2e'
export const FACE_COLOR = '#6a5040'

export const ENVIRONMENTAL_DEFAULTS: Partial<Record<TileState, string>> = {
  [GRASS]: '#4a7c3c',
  [ROAD]: '#c4a574',
  [SAND]: '#e8d4b8',
  [MUD]: '#5a4a3a',
  [STONE]: '#b8b8b8',
  [MOSSY_STONE]: '#6b8c5a',
  [RUBBLE]: '#6b6b6b',
}

export function getTileColor(
  tileState: TileState,
  customColors: Map<TileState, string>,
): string {
  switch (tileState) {
    case WALL: return 'transparent'
    case FLOOR: return FLOOR_COLOR
    case WATER: return WATER_COLOR
    case LAVA: return LAVA_COLOR
    case DARKNESS: return DARKNESS_COLOR
    case GRASS:
    case ROAD:
    case SAND:
    case MUD:
    case STONE:
    case MOSSY_STONE:
    case RUBBLE:
      return customColors.get(tileState) ?? ENVIRONMENTAL_DEFAULTS[tileState] ?? FLOOR_COLOR
    default: {
      const _exhaustive: never = tileState
      return FLOOR_COLOR
    }
  }
}

export const Z_STEP_HEIGHT = TILE_PX / 2 + FACE_PX  // 18px at current constants
export const WATER_OFFSET_Y = 4
