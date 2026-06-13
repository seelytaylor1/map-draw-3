# Hatching: Flow Field Streamlines

**Date:** 2026-06-13  
**Status:** Approved

## Problem

The current `drawHatching` implementation draws long straight diagonal lines clipped to the full wall region. The result is a mechanical, uniform crosshatch that looks nothing like the hand-drawn dungeon map style (reference: Dungeon Scrawl). The desired effect is organic, curving strokes that vary in direction across the map and never cross within a local bundle.

## Goal

Replace the hatching algorithm in `src/patterns.ts` with a flow-field streamline approach that produces hand-drawn-looking crosshatch strokes on wall tiles adjacent to floor tiles.

## Requirements

- Hatch only wall tiles with at least one cardinal floor neighbor (immediate adjacency)
- Smooth angle variation across the map — no abrupt per-tile jumps
- Two families of strokes per tile for crosshatch effect, at ~75° to each other (not 90°)
- Strokes within each family do not cross each other
- Strokes are gently curved, not straight lines
- Fully deterministic from grid state — regenerates correctly when tiles are added/removed
- Same exported function signature: `drawHatching(ctx, grid, cols, rows, tileSize, color)`

## Architecture

All changes are confined to `src/patterns.ts` and `src/patterns.test.ts`. No changes to `App.tsx`, `exportShapes.ts`, or serialization.

The existing `useEffect` in `App.tsx` already re-calls `drawHatching` whenever the grid changes, so regeneration is free.

## Implementation

### Adjacent wall detection

A tile qualifies for hatching if:
- `grid[r * cols + c] === WALL`
- At least one of its 4 cardinal neighbors is `FLOOR`
- Off-grid neighbors count as WALL (map boundary does not generate hatching)

```typescript
function isAdjacentToFloor(grid, cols, col, row): boolean
```

### Clip region

Before drawing any strokes, clip `ctx` to the union of all qualifying tiles:

```typescript
ctx.save()
ctx.beginPath()
for each qualifying tile (c, r):
  ctx.rect(c * tileSize, r * tileSize, tileSize, tileSize)
ctx.clip()
// ... draw streamlines ...
ctx.restore()
```

This keeps all strokes inside the hatched region regardless of arc length.

### Angle field

A pure function of pixel position — no seed, no random state:

```typescript
function angleField(px: number, py: number, scale: number): number {
  return Math.sin(px / scale) * Math.PI
       + Math.cos(py / (scale * 0.71)) * Math.PI * 0.55
}
```

`scale = tileSize * 4` — angles vary over ~4-tile spans, giving smooth ink-flow variation.

This being a pure positional function means the field is identical across renders; only the set of qualifying tiles changes when the grid changes.

### Cross-hatch families

Each qualifying tile gets two families of streamlines:

- **Family 1:** angle `θ = angleField(cx, cy, scale)` where `(cx, cy)` is the tile center
- **Family 2:** angle `θ + π * 0.42` (~75° offset)

75° instead of 90° avoids the mechanical look of true perpendiculars.

### Seeding

3 seeds per family (6 streamlines per tile). Seeds are spread **perpendicular to the flow direction** so the resulting streamlines fan across the tile evenly:

```
perpDir = (-sin θ, cos θ)
seed_k = tileCenter + k * (tileSize / 3) * perpDir    for k ∈ {-1, 0, +1}
```

This guarantees seeds produce evenly-spaced, parallel-looking streamlines within the tile.

### Streamline tracing (Euler integration)

```typescript
function traceStreamline(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  stepSize: number,
  numSteps: number,
  scale: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  let x = x0, y = y0
  for (let i = 0; i < numSteps; i++) {
    const a = angleField(x, y, scale)
    x += Math.cos(a) * stepSize
    y += Math.sin(a) * stepSize
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}
```

Parameters:
- `stepSize = tileSize / 5` (4px at TILE_PX=20, 12px at export 60px)
- `numSteps = 8` → arc length ≈ 1.6 × tileSize

The gentle curvature from integrating a varying field is what gives the hand-drawn quality. Clipping handles any arc that exits the qualifying region.

### Render style

```typescript
ctx.strokeStyle = color
ctx.lineWidth = Math.max(1, tileSize / 16)   // 1.25px live, 3.75px at export
ctx.lineCap = 'round'
```

## Tests

Replace the current count-based tests with behavior tests:

- Sets stroke color
- Calls `save`/`restore`
- Clips only adjacent-wall tiles (not all walls, not floor tiles)
- Does not clip tiles whose only wall neighbors are other walls (interior walls)
- Does not clip floor tiles
- Calls `stroke` at least once for a grid with adjacent-wall tiles

Tests use the existing mock `ctx` pattern (no real canvas).

## Non-goals

- Dungeon Scrawl pixel-perfect reproduction — we're after the same visual effect, not the same algorithm
- Stroke density controls or per-tile angle overrides — out of scope
- Iso/3D mode integration — hatching is top-down only (unchanged from current behavior)
