# Lava, Darkness, and Water Color Picker

## Overview

Add two new fluid tile types — Lava and Darkness — that behave identically to Water in all rendering logic but use distinct default colors. Retroactively make Water's color configurable. All three fluids get contextual color pickers in the Draw section.

## Tile Constants (`constants.ts`)

Add:
```ts
export const LAVA     = 3 as const
export const DARKNESS = 4 as const
export type TileState = typeof WALL | typeof FLOOR | typeof WATER | typeof LAVA | typeof DARKNESS

export const LAVA_COLOR     = '#c1440e'
export const DARKNESS_COLOR = '#1a0a2e'
```

`WATER_COLOR` stays as-is and becomes the default for `waterColor` state.

## New Icon (`ui/icons.tsx`)

Add `IconFlame` with an SVG flame path. Used for the Lava button in the segmented control.

## CSS (`ui/theme.css`)

Add two new tone classes for segmented buttons, parallel to existing `.tone-water`:
- `.tone-lava` — warm red tint
- `.tone-darkness` — dark purple tint

## Scene Builders

Four files are updated: `isoScene.ts`, `viewportScene.ts`, `topDownScene.ts`, `exportShapes.ts`.

**Pattern for each:**
- Add `waterColor: string`, `lavaColor: string`, `darknessColor: string` to the params type/interface.
- Remove the `WATER_COLOR` constant import; use the param instead.
- Wherever `WATER` is handled, add identical `LAVA` and `DARKNESS` cases using their respective color params.

**`topDownScene.ts` `TileShape` type** gains two new variants:
```ts
| { kind: 'lava';     col: number; row: number }
| { kind: 'darkness'; col: number; row: number }
```

## Serialization (`serialization.ts`)

`MapSave` gains optional fields:
```ts
waterColor?:    string
lavaColor?:     string
darknessColor?: string
```

`DeserializedMap` has them required. On `deserialize`, default to `WATER_COLOR`, `LAVA_COLOR`, `DARKNESS_COLOR` respectively when absent (backward compat with old saves).

`serialize` writes all three fields.

## App State (`App.tsx`)

Three new state fields:
```ts
const [waterColor,    setWaterColor]    = useState(WATER_COLOR)
const [lavaColor,     setLavaColor]     = useState(LAVA_COLOR)
const [darknessColor, setDarknessColor] = useState(DARKNESS_COLOR)
```

All three are:
- Passed into every scene builder call (`buildTileScene`, `buildIsoScene`, `buildExportShapes`)
- Added to all relevant `useEffect` dependency arrays
- Included in `serialize()`/loaded from `deserialize()` on file open

## Draw Section UI (`App.tsx`)

**Segmented control** gains two new options:
```ts
{ value: LAVA as TileState,     label: 'Lava',     icon: <IconFlame size={13} /> }
{ value: DARKNESS as TileState, label: 'Darkness', icon: <IconCave  size={13} /> }
```

`tones` map extends to:
```ts
{ [WATER]: 'water', [LAVA]: 'lava', [DARKNESS]: 'darkness', [WALL]: 'erase' }
```

**Contextual color picker** renders immediately below the segmented control when `selectedPaintState` is `WATER`, `LAVA`, or `DARKNESS`:
```tsx
{selectedPaintState === WATER    && <ColorField label="Water color"    value={waterColor}    onChange={setWaterColor} />}
{selectedPaintState === LAVA     && <ColorField label="Lava color"     value={lavaColor}     onChange={setLavaColor} />}
{selectedPaintState === DARKNESS && <ColorField label="Darkness color" value={darknessColor} onChange={setDarknessColor} />}
```

## Ghost Color

The paint-preview ghost color (currently hardcoded check for `WATER`) extends to Lava and Darkness:
```ts
const ghostFill =
  selectedPaintState === WATER    ? hexToRgba(waterColor,    0.45) :
  selectedPaintState === LAVA     ? hexToRgba(lavaColor,     0.45) :
  selectedPaintState === DARKNESS ? hexToRgba(darknessColor, 0.45) :
  GHOST_COLOR
```

Since the color values are already hex strings, implement a small inline `hexToRgba` helper in App.tsx (3-line function, no import needed).

## Constraints / Non-goals

- No change to grid storage format (Uint8Array values 3 and 4 are valid).
- Lava and Darkness are visually identical to Water — no special shimmering, animation, or depth effects.
- No new grid format version bump; the new color fields are optional in MapSave and default gracefully.
