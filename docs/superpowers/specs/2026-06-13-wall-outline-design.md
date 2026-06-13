# Wall Outline Feature Design

**Date:** 2026-06-13

## Overview

Draw a stroke along every edge where a wall tile meets a floor or water tile, simulating the hand-drawn border lines of a classic dungeon map. The stroke includes a soft drop-shadow pass to give the outline depth.

## Feature Summary

- **Toggle:** on/off, default off
- **Style:** Clean (crisp straight segments) or Hand-drawn (roughened via existing pipeline)
- **Color:** single color picker shared by line and shadow; shadow is auto-derived at lower opacity
- **Width:** fixed defaults (2px line, 6px shadow); no user control
- **Scope:** top-down mode only; iso mode unchanged

## Algorithm — `buildWallOutlineSegments`

New export from `src/patterns.ts`.

Walk every tile pair sharing an edge (right neighbor, bottom neighbor). For each pair, if one side is `WALL` and the other is `FLOOR` or `WATER`, emit that shared edge as a 2-point segment in pixel coordinates.

```
for r in 0..rows:
  for c in 0..cols:
    tile     = getTile(grid, cols, c, r)
    right    = getTile(grid, cols, c+1, r)   // out-of-bounds → WALL
    bottom   = getTile(grid, cols, c, r+1)   // out-of-bounds → WALL

    if isWallFloorBoundary(tile, right):
      emit vertical segment: ((c+1)*T, r*T) → ((c+1)*T, (r+1)*T)

    if isWallFloorBoundary(tile, bottom):
      emit horizontal segment: (c*T, (r+1)*T) → ((c+1)*T, (r+1)*T)

isWallFloorBoundary(a, b):
  (a === WALL && (b === FLOOR || b === WATER)) ||
  (b === WALL && (a === FLOOR || a === WATER))
```

Out-of-bounds returns `WALL` (existing `getTile` behavior), so map-boundary edges never qualify. Each interior edge is visited exactly once — no deduplication needed.

Returns `[number, number][][]`, the same shape `roughenSegments` already consumes.

## Rendering

Rendered inside the per-level group in `App.tsx`, after steps/ramps (topmost within the group, below the stamp layer).

**Style resolution:**
- Clean → use segments as-is
- Rough → pipe through `roughenSegments` with lighter options than hatching (lower `scribbleAmplitude`, lower `shiftRate`) so the wobble is gentle

**Two-pass rendering over the resolved polylines:**

| Pass | strokeWidth | opacity | lineCap |
|------|-------------|---------|---------|
| Shadow | 6px | ~0.18 | round |
| Line | 2px | 1.0 (from color) | round |

Both passes rendered as `Konva.Line` nodes — crisp at all zoom levels.

## State (`App.tsx`)

```typescript
const [showWallOutline, setShowWallOutline] = useState(false)
const [wallOutlineColor, setWallOutlineColor] = useState('#000000')
const [wallOutlineStyle, setWallOutlineStyle] = useState<'clean' | 'rough'>('clean')
```

All three are added to the main layer `useEffect` dependency array.

## Toolbar UI

New **Outline** section in the left toolbar, parallel to the existing Hatching section:

```
── OUTLINE ──
[◻ Outline]          ← toggle button, same style as Hatch button
  (when on):
  [color picker] #000000
  [Clean] [Rough]    ← two-button toggle
```

## Serialization

`MapSave` and `DeserializedMap` in `src/serialization.ts` each get three new optional fields:

```typescript
showWallOutline?: boolean    // default false on load
wallOutlineColor?: string    // default '#000000' on load
wallOutlineStyle?: 'clean' | 'rough'  // default 'clean' on load
```

`serialize()` and `deserialize()` updated accordingly. `applyLoad` in `App.tsx` sets the three new state vars from the deserialized values.

## Export

`BuildExportParams` in `src/exportShapes.ts` gains:

```typescript
showWallOutline?: boolean
wallOutlineColor?: string
wallOutlineStyle?: 'clean' | 'rough'
```

`buildTopDownExport` renders the outline into the off-stage Konva layer using the same two-pass approach as the live view.

`handleExport` in `App.tsx` passes the three new values through to `buildExportShapes`.

## Rough Options

A new `OUTLINE_ROUGH_OPTS: RoughLineOptions` constant in `patterns.ts`, distinct from `DEFAULT_ROUGH_OPTS` (used by hatching):

```typescript
const OUTLINE_ROUGH_OPTS: RoughLineOptions = {
  segmentSizeMin: 1,
  segmentSizeMax: 1,       // no subdivision — segments are already one tile-edge long
  segmentSkipRate: 0,      // never skip — outline must be continuous
  noDotRate: 0.2,
  scribbleScale: 0.15,
  scribbleAmplitude: 0.6,  // gentle wobble (hatching uses 1)
  shiftRate: 0.05,         // rare mid-segment splits (hatching uses 0)
  shiftAmountMin: 0.5,
  shiftAmountMax: 1.0,
  majorNoiseScale: 0.05,
  majorNoiseAmplitude: 0,
  majorNoiseShift: 0.9,
}
```
