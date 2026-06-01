# Area Selector: Square & Circle

**Date:** 2026-06-01
**Status:** Approved

## Summary

Replace the freehand brush (square/circle paint mode) with a click-drag area selector. Square fills a rectangle, circle fills an inscribed circle within the dragged bounding box. No noise phase — commit is immediate on mouseup. Right-click selects erase (WALL) rather than fill (FLOOR).

## Gesture

1. **Mousedown** — record `areaStart` tile. Set `areaPhase = 'selecting'`. Record `paintMode` (left = FLOOR, right = WALL).
2. **Mousemove** — update `areaEnd`. Render ghost overlay showing tiles that will be committed.
3. **Mouseup** — commit `paintTiles` over selected tiles as `paintMode`. Push single history entry. Reset `areaStart`, `areaEnd`, `areaPhase = 'idle'`.

Escape cancels mid-drag (reset to idle, no history push).

## Shape Logic

**Square:** all tiles within the bounding box `[minC..maxC] × [minR..maxR]`.

**Circle:** inscribed circle within the bounding box.
- Center: `{ col: (minC + maxC) / 2, row: (minR + maxR) / 2 }`
- Radius: `Math.floor(Math.min((maxC - minC + 1), (maxR - minR + 1)) / 2)`
- Tile set: reuse existing `circleBrushTiles(centerCol, centerRow, radius)`

## State Changes

**Removed:**
- `brushSize` state + brush size slider UI
- `getBrushTiles()` helper (was only used for freehand)
- `isPainting` ref, `pendingGrid` ref, `preDragSnapshot` ref (freehand undo pattern)

**Added:**
- `areaPhase: 'idle' | 'selecting'` state + ref
- `areaStart: Tile | null` state + ref
- `areaEnd: Tile | null` state + ref

`brushShape` and `paintMode` refs are retained unchanged.

## Ghost Preview

During `areaPhase === 'selecting'`:
- Compute tile set (rect or circle) from current `areaStart`/`areaEnd`
- Render each tile as `GHOST_COLOR` overlay (same yellow ghost used by old brush)
- Ghost recomputed on every mousemove

## History

Single `push()` on mouseup — same as the rough tool's commit step. No intermediate history entries during drag.

## Serialization

`brushSize` is currently saved and strictly validated in `deserialize` (throws if missing/wrong type). Changes:
- Remove `brushSize` from `MapSave` interface and `serialize` output
- Change `deserialize` to accept `brushSize` as optional and skip validation — old saves that include it load fine, new saves that omit it also load fine
- `brushShape` stays (user still toggles square vs circle)

## UI

- Square/Circle buttons remain; clicking one sets `brushShape` and ensures `mode === 'paint'`
- Brush size slider (`Size N×N` / `r=N`) is removed
- No new UI elements needed
- Hint text not needed (gesture is self-evident)

## Out of Scope

- Touch/pointer events
- Ellipse (non-square bounding box circle)
- Multi-area selection
