# Stamps — place, select, rotate, delete (issue 0010)

**Date:** 2026-05-31
**Status:** approved

## Problem

The map has no way to mark dungeon features (doors, traps, stairs, etc.). Stamps are SVG icons that snap to the tile grid and are placed, selected, rotated, and deleted as discrete objects — separate from the painted tile layer.

## Data model

```typescript
export type StampType = 'door' | 'trap' | 'star' | 'bars' | 'stairs'
export type Rotation = 0 | 90 | 180 | 270

export interface Stamp {
  id: string          // crypto.randomUUID()
  type: StampType
  col: number
  row: number
  rotation: Rotation
}
```

Tile footprints:
- Door, Trap, Star, Bars: 1×1
- Stairs: 2×1

## Undo/redo architecture

`history.ts` is made generic with a default type parameter that preserves existing behaviour:

```typescript
export interface History<T = Uint8Array> { past: T[]; present: T; future: T[] }
export function createHistory<T>(initial: T): History<T>
export function push<T>(h: History<T>, snapshot: T): History<T>
export function undo<T>(h: History<T>): History<T>
export function redo<T>(h: History<T>): History<T>
```

All existing `history.test.ts` tests pass with zero changes (the default `T = Uint8Array` keeps them valid).

App state switches to `History<AppSnapshot>`:

```typescript
type AppSnapshot = { grid: Uint8Array; stamps: Stamp[] }
```

Every undoable action (paint stroke, stamp place, stamp delete, stamp rotate) atomically snapshots both `grid` and `stamps`. Ctrl+Z is a single chronological timeline — no parallel stacks, no ordering surprises.

## Mode switching

```typescript
type Mode = 'paint' | StampType
const [mode, setMode] = useState<Mode>('paint')
const [selectedStampId, setSelectedStampId] = useState<string | null>(null)
```

Transitions:
- Clicking a stamp type button → enters that stamp mode (button highlights)
- Clicking the active stamp type button again → returns to `'paint'`
- Clicking the square or circle brush shape button → returns to `'paint'`

## Interactions

**Placing:** In stamp mode, `handleMouseDown` on the Stage calls `stageToTile`, creates a new `Stamp` via `crypto.randomUUID()`, pushes `{ grid, stamps: addStamp(stamps, newStamp) }` to history. Clears `selectedStampId`.

**Selecting:** Each rendered stamp node has an `onClick` that sets `selectedStampId`. Clicking the canvas background in stamp mode places a new stamp — to deselect without placing, press Escape.

**Keyboard** (all in the existing `keydown` useEffect):
- `Delete` — remove selected stamp, push to history, clear selection
- `r` / `R` — rotate selected stamp 90° clockwise, push to history
- `Escape` — clear selection

## SVG assets

Five files in `src/stamps/`. Each is black stroke on transparent background — works over any wall colour. ViewBox `0 0 20 20` (1×1 stamps) or `0 0 40 20` (Stairs, 2×1).

| File | Symbol |
|------|--------|
| `door.svg` | Line gap with perpendicular arc (standard dungeon door) |
| `trap.svg` | Circle with X (pressure plate) |
| `star.svg` | 5-pointed star outline |
| `bars.svg` | Three evenly-spaced vertical lines (portcullis) |
| `stairs.svg` | Parallel diagonal lines across 2×1 footprint |

Imported in Vite via `?url`: `import doorUrl from './stamps/door.svg?url'`

## Image preloading

`useStampImages()` hook creates one `HTMLImageElement` per stamp type, loads all five, and returns `Map<StampType, HTMLImageElement> | null` (null until all loaded). StampLayer waits for non-null before rendering.

## Rendering

**StampLayer** — a new `<Layer>` between `layerRef` (tiles) and `dotLayerRef` (dots/ghost cursor). For each stamp:
- `Konva.Image` at `col * TILE_PX, row * TILE_PX`
- Size: `stampCols * TILE_PX × stampRows * TILE_PX`
- Rotation in degrees; `offsetX`/`offsetY` set to stamp center so it rotates in place
- When selected: a `Konva.Rect` overlay with yellow stroke and no fill

**PNG export** — stamps rendered into the off-screen stage at `EXPORT_TILE` (60px) scale using the same preloaded image elements.

## Serialization

`MapSave` version stays at `1`. Stamps added as an optional field so old saves load cleanly:

```typescript
export interface MapSave {
  version: 1
  // ...existing fields unchanged...
  stamps?: StampSave[]
}

export interface StampSave {
  id: string
  type: StampType
  col: number
  row: number
  rotation: Rotation
}
```

`serialize` always writes `stamps`. `deserialize` reads `stamps ?? []` — v1 files without the field load with no stamps.

## Pure module: `src/stamps.ts`

```typescript
addStamp(stamps: Stamp[], stamp: Stamp): Stamp[]
removeStamp(stamps: Stamp[], id: string): Stamp[]
rotateStamp(stamps: Stamp[], id: string): Stamp[]   // +90° mod 360, 270 → 0
stampSize(type: StampType): { cols: number; rows: number }
```

All functions return new arrays — no mutation.

## New files

| File | Purpose |
|------|---------|
| `src/stamps.ts` | Pure stamp state functions |
| `src/stamps.test.ts` | Unit tests for all four functions |
| `src/hooks/useStampImages.ts` | SVG preload hook |
| `src/stamps/door.svg` | Door symbol |
| `src/stamps/trap.svg` | Trap symbol |
| `src/stamps/star.svg` | Star symbol |
| `src/stamps/bars.svg` | Bars symbol |
| `src/stamps/stairs.svg` | Stairs symbol |

## Modified files

| File | Change |
|------|--------|
| `src/history.ts` | Generics (`History<T>`, default `T = Uint8Array`) |
| `src/serialization.ts` | Optional `stamps` field, `StampSave` type |
| `src/serialization.test.ts` | Round-trip with stamps; v1 compat (no stamps → []) |
| `src/App.tsx` | `mode`, `selectedStampId`, `History<AppSnapshot>`, StampLayer, keyboard handlers, toolbar stamps section |

## Acceptance criteria

- [ ] Toolbar shows all five stamp types with distinct icons
- [ ] Clicking the canvas in stamp mode places the selected stamp snapped to the nearest tile
- [ ] Placed stamps render as SVG icons scaled to their tile footprint
- [ ] Clicking a placed stamp selects it (yellow stroke indicator)
- [ ] Delete key removes the selected stamp
- [ ] R key rotates the selected stamp 90° clockwise (270° wraps to 0°)
- [ ] Place, delete, and rotate are each a single undo step (Ctrl+Z reverses them)
- [ ] Stamp list is included in save/load JSON; old v1 saves without stamps load cleanly
- [ ] Stamps appear in PNG export
