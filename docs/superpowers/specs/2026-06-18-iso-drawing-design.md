# Iso Mode Drawing

**Date:** 2026-06-18

## Goal

Enable the paint and cave (rough) tools in isometric view mode. Currently iso mode is preview-only; this removes that restriction so users can draw directly on the iso canvas with full ghost-cursor feedback.

## Scope

- Paint tool (floor/water/lava/darkness/erase) — single click and area drag
- Cave/rough tool — 3-step click interaction (start corner → end corner → noise commit)
- Ghost preview tiles rendered as iso diamonds
- Wall dots rendered in iso space
- No changes to stamps, steps, ramps, labels (already work in iso mode)

## Architecture

All changes are in `src/App.tsx`. No new files. No changes to scene builders, grid logic, or serialization.

### 1. `stageToIsoTile` helper

New function alongside `stageToTile`:

```ts
const stageToIsoTile = (stage, clientX, clientY): Tile | null => {
  const rect = stage.container().getBoundingClientRect()
  const scale = stage.scaleX()
  const worldX = (clientX - rect.left - stage.x()) / scale
  const worldY = (clientY - rect.top - stage.y()) / scale
  const { col: fc, row: fr } = isoUnproject(worldX, worldY, TILE_PX * 2, TILE_PX)
  const col = Math.floor(fc)
  const row = Math.floor(fr)
  return (col >= 0 && row >= 0 && col < cols && row < rows) ? { col, row } : null
}
```

### 2. `handleMouseDown`

- Remove `if (showIso && (ds.tool === 'paint' || ds.tool === 'rough')) return`
- Replace the inline iso-unproject block (stamps/steps/ramps path) with `stageToIsoTile`
- Non-iso path uses existing `stageToTile`

### 3. `handleMouseMove`

- Remove `if (showIso) return`
- Branch on `showIso` to compute tile via `stageToIsoTile` vs `stageToTile`
- Drives `hoverTile`, `PAINT_UPDATE`, `ROUGH_UPDATE_RECT` as in top-down mode
- Rough `placed2` noise phase: end-tile screen center uses `isoProject(end.col+0.5, end.row+0.5, TILE_PX*2, TILE_PX)` in iso mode instead of `col*TILE_PX`

### 4. Dot layer

**Wall dots** — rendered in both modes. In iso mode, position at:
```ts
const { x, y } = isoProject(c + 0.5, r + 0.5, TILE_PX * 2, TILE_PX)
```
Every-other-tile pattern and light/dark color logic unchanged.

**Ghost tiles** — in iso mode, each tile becomes a closed `Konva.Line` polygon:
```ts
isoFloorPoints(t.col, t.row, TILE_PX * 2, TILE_PX)
```
Same fill color logic (water/lava/darkness tints, yellow fallback).

**Rough anchor dot** — positioned at `isoProject(col+0.5, row+0.5, ...)` in iso mode.

**Rough ghost rect** (`placed1`) — draw one diamond per tile in the rect instead of one big `Konva.Rect`.

**Rough noise preview** (`placed2`) — each flip tile is a diamond instead of a rect.

### 5. Toolbar + cursor

- Remove the `showIso && "Preview only — drawing disabled"` hint
- Remove `not-allowed` cursor for iso + paint/rough; iso paint/rough gets `crosshair` like top-down

## Data flow

The grid (`Uint8Array`) is view-agnostic. `paintTiles` and the rough commit logic write tile state independently of view mode. Only hit detection and ghost rendering are view-dependent — both isolated to `handleMouseDown`, `handleMouseMove`, and the dot layer effect.

## Non-goals

- No changes to export, serialization, or the iso scene builder
- No multi-level drawing in iso mode (activeZ logic unchanged)
- No touch/pointer event support beyond what already exists
