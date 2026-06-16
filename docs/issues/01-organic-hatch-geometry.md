# Issue 01: Organic hatch geometry

**Type:** AFK
**Blocked by:** None — can start immediately

## Parent

[prd-hatching-shadow.md](../prd-hatching-shadow.md)

## What to build

Replace the current `drawHatching` implementation — which clips to grid tile rectangles and uses a single canvas-spanning Voronoi — with a proper organic hatching system that matches the Dungeon Scrawl approach end-to-end.

The core change is splitting geometry from drawing. A new pure function `buildHatchLines` computes all hatch segment geometry (no canvas touches) and `drawHatching` becomes a thin wrapper that clips to the dungeon shape and strokes the result.

**Geometry changes:**

- **Wall-proximity detection:** Collect all wall-edge pixels by walking tile boundaries (the shared edge between each WALL tile and its FLOOR neighbour). A Voronoi cell qualifies for hatching if its centroid is within `wallDistance` pixels of any wall-edge point. Replace the current `isAdjacentToFloor` tile-level check with this pixel-space distance check.

- **Tileable Voronoi:** Generate the Voronoi over a tile of size `tileSize × tileSize` using Poisson-disc seeding. Before computing the Voronoi, replicate seed points into a border ring around the tile so cell edges are seamless when the tile is stamped across the map. The existing `poissonDisk` function and `d3-delaunay` import cover these steps — only the tiling wrapper is new.

- **Per-cell angle:** Assign each Voronoi cell a random angle using the existing `cellAngle(i)` seeded hash (already in patterns.ts). This gives each cell independent parallel-line direction and is stable across redraws.

- **Line generation:** For each qualifying cell, step parallel lines across it at `spacing` intervals using the cell angle, clip each line to the cell polygon boundary, and keep lines longer than `minDistance / 3`. This is the same `addSegments` logic from the DS source.

**Signature to expose:**

```ts
buildHatchLines(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  opts: HatchOptions
): [number, number][][] // array of polylines (each a flat list of x,y pairs)
```

`drawHatching` remains the public canvas-drawing entry point and calls `buildHatchLines` internally.

**Tests:** `OffscreenCanvas` snapshot tests in `patterns.test.ts` (or a new `patterns.snapshot.test.ts`). Render `buildHatchLines` output to a small canvas and compare pixel buffer to a committed snapshot for:
- 3×3 grid, floor at center — hatch only in the 4 cardinal wall tiles
- Single floor tile, large wall field — hatch density in expected range
- All-floor grid — empty output
- All-wall grid — empty output

## Acceptance criteria

- [ ] `buildHatchLines` is a pure function: no canvas, no side effects
- [ ] Voronoi tiles seamlessly — no visible seam when the tile boundary is crossed on a large map
- [ ] Each Voronoi cell has an independently-oriented set of parallel lines
- [ ] Hatch lines appear only within `wallDistance` pixels of wall edges, not across open floor
- [ ] Pattern is visually stable: same grid produces identical hatch lines on every redraw
- [ ] All four snapshot scenarios pass
- [ ] Existing canvas-mock tests in `patterns.test.ts` are updated or replaced as needed
