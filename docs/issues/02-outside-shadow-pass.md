# Issue 02: Outside shadow pass

**Type:** AFK
**Blocked by:** Issue 01 (organic hatch geometry)

## Parent

[prd-hatching-shadow.md](../prd-hatching-shadow.md)

## What to build

Add a second rendering pass that draws small filled Voronoi cells along wall edges to simulate an ink-wash drop-shadow. This is the `hatchShadeOptions` / `outsideShadow` system from Dungeon Scrawl.

The shadow uses the same tileable Voronoi machinery introduced in Issue 01, but with `disableHatching = true`: instead of generating line segments per cell, qualifying cells are collected as filled polygons. These polygons are rendered as semi-transparent dark fills, clipped to the dungeon interior near wall edges.

**Geometry:**

A new pure function `buildShadowCells` reuses the same wall-edge pixel collection and tile-stamping loop as `buildHatchLines`, but with different defaults (`tileSize` is much smaller — ~200px — giving denser, smaller blobs). For each qualifying Voronoi cell centroid, the entire cell polygon is added to the output instead of line segments.

```ts
buildShadowCells(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  opts: ShadowOptions
): [number, number][][] // array of cell polygons (each a flat list of x,y pairs)
```

**Drawing:**

`drawShadow(ctx, grid, cols, rows, tileSize, opts)` calls `buildShadowCells`, clips the canvas to the dungeon shape (same multipolygon clip as `drawHatching`), and fills each cell polygon with `opts.fillColor` at `opts.fillOpacity`.

**Wiring into App:**

In the `drawHatching`/shadow render block in App.tsx, call `drawShadow` on the same hatch canvas (or a dedicated canvas) before `drawHatching`, so the shadow sits beneath the hatch lines. The existing `showHatching` toggle covers both passes for v1 — no separate toggle is needed.

**Default shadow options** (matching DS "Pen & Ink"):
- `tileSize: 200`
- `wallDistance: 18`
- `fillColor: 'rgba(0,0,0,1)'`
- `fillOpacity: 0.18`

**Tests:** Snapshot tests rendering shadow-only and shadow+hatch combined for the same 3×3 center-floor scenario from Issue 01. Assert that pixels near the wall edges are darker than pixels far from walls.

## Acceptance criteria

- [ ] `buildShadowCells` is a pure function: no canvas, no side effects
- [ ] Shadow cells appear only within `wallDistance` pixels of wall edges
- [ ] Shadow renders beneath hatch lines in the App (draw order: shadow first, hatch on top)
- [ ] Shadow is visible in the running app when `showHatching` is enabled
- [ ] No shadow rendered on all-floor or all-wall grids
- [ ] Snapshot test for shadow-only pass committed and passing
- [ ] Snapshot test for combined shadow + hatch committed and passing
