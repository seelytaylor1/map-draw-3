# Crisp Hatching at Any Zoom

**Date:** 2026-06-13  
**Status:** Approved

## Problem

Wall hatch lines look pixelated when zoomed in. The live view draws hatching to an off-screen `<canvas>` at `cols × TILE_PX` pixels (e.g. 1100×840px for a default map), then adds that canvas as a `Konva.Image`. When the Konva stage is zoomed (up to 8×), the bitmap is stretched like any raster image. Every other element in the layer — floor tiles, wall rects, stamps — is a Konva primitive that redraws at the actual scale, so only hatching looks blurry.

The export path renders to PNG at a fixed resolution (`exportTile = 60`, 3× display size), so pixelation is not a concern there.

## Goal

Hatch lines stay crisp at every zoom level in the live view.

## Approach

Route the existing `[number, number][][]` polyline data — already produced by `buildHatchLines` + `roughenSegments` — into native `Konva.Line` nodes instead of a canvas context. Konva re-renders line primitives at the current transform on every draw call, so they're always sharp.

The export path keeps using `drawHatching` on a canvas — no change needed there.

## Architecture

All changes are confined to `src/patterns.ts` and `src/App.tsx`. No changes to `exportShapes.ts`, `serialization.ts`, or tests.

## Implementation

### 1. New export in `patterns.ts`

Add `buildHatchPolylines` that wraps `buildHatchLines` + `roughenSegments` with the existing defaults and returns the final polylines:

```typescript
export function buildHatchPolylines(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
): [number, number][][] {
  const segments = buildHatchLines(grid, cols, rows, tileSize, DEFAULT_HATCH_OPTS)
  return roughenSegments(segments, DEFAULT_ROUGH_OPTS, 42)
}
```

`drawHatching` continues to call `buildHatchLines` + `roughenSegments` internally (unchanged) so the export path is unaffected.

### 2. Live view change in `App.tsx`

Replace the bitmap block (currently around line 721–735) with a clipped Konva group:

```typescript
// Before:
if (showHatching) {
  const hatchCanvas = document.createElement('canvas')
  hatchCanvas.width = cols * TILE_PX
  hatchCanvas.height = rows * TILE_PX
  const hatchCtx = hatchCanvas.getContext('2d')!
  drawShadow(hatchCtx, levelGrid, cols, rows, TILE_PX)
  drawHatching(hatchCtx, levelGrid, cols, rows, TILE_PX, hatchColor)
  group.add(new Konva.Image({ ... }))
}

// After:
if (showHatching) {
  const hatchGroup = new Konva.Group({
    clipFunc: (ctx: CanvasRenderingContext2D) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (getTile(levelGrid, cols, c, r) === WALL) {
            ctx.rect(c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
          }
        }
      }
    },
    listening: false,
  })
  const polylines = buildHatchPolylines(levelGrid, cols, rows, TILE_PX)
  for (const polyline of polylines) {
    if (polyline.length < 2) continue
    hatchGroup.add(new Konva.Line({
      points: polyline.flat(),
      stroke: hatchColor,
      strokeWidth: 1,
      lineCap: 'round',
      listening: false,
    }))
  }
  group.add(hatchGroup)
}
```

`drawShadow` is a no-op stub, so dropping the call has no visible effect.

### Import change in `App.tsx`

Add `buildHatchPolylines` to the import from `./patterns`. `drawHatching` can be removed from the import (it's no longer used in App.tsx once the bitmap block is gone).

## Non-goals

- Changing the export path — it renders at 3× tile size to PNG, no zoom concept
- Performance tuning Konva node count — a typical map produces ~500–800 Line nodes, well within Konva's range
- Any change to the hatch geometry, roughening, or visual appearance
