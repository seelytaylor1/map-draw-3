# Environmental Tiles

**Date:** 2026-06-19

## Goal

Add paintable environmental tile types (Grass, Road, Sand, Mud, Stone, Mossy Stone, Rubble) to complement existing floor, water, lava, and darkness tiles. Each type has a baked-in default color but can be customized per-map. Environmental tiles are purely visual flavor—they don't restrict stamp placement or change game mechanics.

## Problem Statement

Currently, the map editor supports only 5 tile states: WALL, FLOOR, WATER, LAVA, DARKNESS. Maps look uniform when large areas are painted as plain FLOOR. Players want to denote different ground types (forest, road, stone, swamp) to add visual variety and semantic clarity to their maps without placing individual stamps.

## Solution

Extend the tile system to support 7 new environmental tile types. Each type:
- Has a sensible default color matching common dungeon/fantasy aesthetics
- Renders with wall shadows for visual consistency
- Supports user customization via optional color picker
- Works on all z-levels and integrates fully with stamps, steps, and ramps

## Tile Types

| Type | Default Color | Hex | Visual Intent |
|------|---------------|-----|---|
| Grass | Forest green | `#4a7c3c` | Outdoor meadow, overland areas |
| Road | Tan/dirt | `#c4a574` | Worn path, road surface |
| Sand | Light tan | `#e8d4b8` | Desert, beach, sandy floor |
| Mud/Swamp | Dark brown | `#5a4a3a` | Marshland, boggy ground |
| Stone | Light gray | `#b8b8b8` | Worked stone, new pavers |
| Mossy Stone | Gray-green | `#6b8c5a` | Weathered stone, aged floor |
| Rubble | Dark gray | `#6b6b6b` | Ruins, broken stone, debris |

## Data Model

### TileState Enum

Extend `src/constants.ts`:

```ts
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

export type TileState = 
  | typeof WALL
  | typeof FLOOR
  | typeof WATER
  | typeof LAVA
  | typeof DARKNESS
  | typeof GRASS
  | typeof ROAD
  | typeof SAND
  | typeof MUD
  | typeof STONE
  | typeof MOSSY_STONE
  | typeof RUBBLE
```

### Color Storage

Add to `AppSnapshot` type in `src/App.tsx`:

```ts
type AppSnapshot = {
  grids: Map<number, Uint8Array>
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
  labels: Label[]
  environmentalColors: Map<number, string>  // Maps TileState (5-11) to custom color hex
}
```

Defaults (in constants):

```ts
export const ENVIRONMENTAL_DEFAULTS: Record<number, string> = {
  [GRASS]: '#4a7c3c',
  [ROAD]: '#c4a574',
  [SAND]: '#e8d4b8',
  [MUD]: '#5a4a3a',
  [STONE]: '#b8b8b8',
  [MOSSY_STONE]: '#6b8c5a',
  [RUBBLE]: '#6b6b6b',
}
```

## UI

### Paint Tool Selector

Replace the current flat button row with **segmented control with two tabs**:

**Tab 1: "Basic"**
- Floor (with existing color if FLOOR has a color override option, else label only)
- Water
- Lava
- Darkness
- Erase

**Tab 2: "Environments"**
- Grid of 7 buttons, one per type
- Each button shows: type name + small color swatch (the current default or user override)
- Optional: small chevron or "+" icon next to each to open color picker (only visible on hover)

### Color Picker

- Appears when user clicks the color icon next to an environment type
- Allows hex color input or visual color wheel
- Changes are applied immediately and persist in `environmentalColors` map
- "Reset" button reverts to default

## Rendering

### Shadow Pass

Modify `src/patterns.ts`, function `drawShadow`:

**Current behavior:** Shadows only apply to `FLOOR` tiles.

**New behavior:** Shadows apply to all non-WALL tiles (FLOOR, WATER, LAVA, DARKNESS, and all environmental types).

Change line 866 from:
```ts
if (tile(c, r) !== FLOOR) continue
```

To:
```ts
if (tile(c, r) === WALL) continue
```

This ensures visual consistency: all walkable surfaces cast shadows when adjacent to walls.

### Hatching Pass

No change. Hatching already only applies to FLOOR (checked in `buildHatchLines` via `isAdjacentToFloor`). Environmental tiles do not get hatching.

### Color Application

Update tile color lookup in `src/viewportScene.ts` (or equivalent color function):

```ts
function getTileColor(tileState: TileState, customColors: Map<number, string>): string {
  if (tileState === FLOOR) return FLOOR_COLOR
  if (tileState === WATER) return WATER_COLOR
  if (tileState === LAVA) return LAVA_COLOR
  if (tileState === DARKNESS) return DARKNESS_COLOR
  if (tileState >= GRASS && tileState <= RUBBLE) {
    return customColors.get(tileState) ?? ENVIRONMENTAL_DEFAULTS[tileState]
  }
  return FLOOR_COLOR // fallback
}
```

### 3D & Isometric Rendering

- Environmental tiles render at the same height as FLOOR in 3D mode (no special face colors or heights)
- Isometric view treats them identically to FLOOR (same projection, just different base color)

## Serialization

### Save Format

`AppSnapshot` structure:

```json
{
  "grids": {
    "0": [Uint8Array serialized as base64],
    "1": [...]
  },
  "stamps": [...],
  "steps": [...],
  "ramps": [...],
  "labels": [...],
  "environmentalColors": {
    "5": "#custom-grass-color",
    "7": "#custom-sand-color"
  }
}
```

Only non-default colors are stored in `environmentalColors`. If a key is missing, the default is used.

### Load/Migration

- Old maps (no `environmentalColors` key) load fine—defaults apply everywhere
- New tiles (5-11) don't exist in old maps until explicitly painted
- No data loss or compatibility issues

## Behavior

### Painting

- Select an environment type from the "Environments" tab
- Click or drag to paint tiles (same interaction as FLOOR)
- Overwrite any existing tile type (FLOOR, WATER, LAVA, DARKNESS, another environment type, or WALL)

### Stamps, Steps, Ramps

- Fully functional on environmental tiles (no restrictions)
- Stamps render on top of the environmental tile color

### Z-Levels

- Environmental tiles work independently on each z-level
- A cavern floor at z=3 can be sandy while the main dungeon at z=0 is grassy

### Undo/Redo

- Standard history tracking; no special handling needed (grid edits are already tracked)

### Export

- PNG export uses the custom color if overridden, else the default
- High-res export includes environmental tiles at their correct colors

## Not in Scope

- Per-region or per-stamp environmental variations
- Procedural environmental generation (scatter trees, auto-path, etc.) — that's stamps + rivers as a future feature
- Environmental-specific hatching or texture patterns
- Animated or interactive environmental previews
- SVG-specific environmental rendering rules

## Testing

### Unit Tests

- `getTileColor` returns correct default and custom colors
- Environmental tiles serialize and deserialize correctly
- Old maps without `environmentalColors` load and apply defaults

### Manual Testing

- Paint each environment type in both top-down and isometric view
- Verify shadows appear correctly next to walls
- Verify custom colors persist across save/load
- Verify stamps and steps place on environmental tiles
- Verify multi-level painting works
- Verify export shows correct colors

## Implementation Notes

- No new dependencies required
- Changes localized to: `constants.ts`, `App.tsx`, `patterns.ts`, `viewportScene.ts` (or color utility), `serialization.ts`
- Backward compatible: old maps load fine, new feature is opt-in
- Performance: no impact (same grid storage, same rendering pipeline)
