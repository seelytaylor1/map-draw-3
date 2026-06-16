# PRD: Dungeon Scrawl-Style Hatching & Outside Shadow

## Problem Statement

The current hatching system draws parallel lines inside wall tiles that border floor tiles, but it produces a grid-aliased, uniform look that lacks the organic hand-drawn quality of reference tools like Dungeon Scrawl. There is no wall-shadow pass at all. The result feels mechanical rather than like an inked dungeon map.

## Solution

Replace the current single-pass hatching with a two-pass rendering system modelled on Dungeon Scrawl's approach:

1. **Hatching pass** — Voronoi-based organic hatch lines, each cell at an independent random angle, placed within a configurable pixel distance of wall edges (not restricted to tile boundaries).
2. **Outside-shadow pass** — Small filled Voronoi cells clustered against wall edges, rendered as semi-transparent dark shapes to simulate ink wash drop-shadow.
3. **Rough-line post-processing** — A pipeline that makes clean hatch segments wobbly, gappy, and slightly broken to reinforce the hand-drawn feel.

All geometry computation is separated from canvas drawing so it can be tested via canvas snapshot.

## User Stories

1. As a map maker, I want hatch lines to feel organic and hand-drawn, so that my dungeon looks like it was inked rather than computer-generated.
2. As a map maker, I want each cluster of hatch lines to have a slightly different angle, so that the wall fill doesn't look like uniform diagonal stripes.
3. As a map maker, I want hatch lines to follow the actual wall boundary (not grid tile edges), so that the pattern doesn't break at diagonal or irregular wall shapes.
4. As a map maker, I want a soft shadow rendered along wall edges, so that floor areas feel visually recessed against the walls.
5. As a map maker, I want the shadow to look like small irregular ink blobs rather than a smooth gradient, so that it reinforces the hand-drawn aesthetic.
6. As a map maker, I want the hatch lines to be slightly wobbly and occasionally broken, so that they look like they were drawn with a real pen.
7. As a map maker, I want the hatching and shadow to be consistent across redraws of the same map, so that the map doesn't visually jitter when I pan or zoom.
8. As a map maker, I want to toggle hatching on and off, so that I can compare the map with and without the effect.
9. As a map maker, I want to control the hatch line color, so that I can match the style to different map themes.
10. As a map maker, I want the shadow darkness and density to be reasonable defaults that work without manual configuration, so that I don't have to tune parameters to get a good result.
11. As a map maker, I want hatching to render only near walls (not across the entire floor), so that open floor areas remain clean.
12. As a map maker, I want the pattern to tile seamlessly so there are no visible seams or repetition artifacts on large maps.
13. As a map maker, I want hatching to work correctly in isometric view as well as top-down, so that both map styles look polished.

## Implementation Decisions

### Two-Pass Architecture

`patterns.ts` will expose two top-level draw functions:
- `drawHatching(ctx, grid, cols, rows, tileSize, opts)` — hatch lines pass
- `drawShadow(ctx, grid, cols, rows, tileSize, opts)` — outside-shadow pass

Each delegates to a pure geometry builder, then draws the result.

### Pure Geometry Layer

Two pure functions produce geometry without touching canvas:
- `buildHatchLines(grid, cols, rows, tileSize, opts): Segment[][]` — returns arrays of point-pair arrays (one per Voronoi cell)
- `buildShadowCells(grid, cols, rows, tileSize, opts): Point[][]` — returns Voronoi cell polygons near walls

These are the functions under test in snapshot tests.

### Wall-Proximity Detection

Replace the current `isAdjacentToFloor` tile-grid check with a pixel-space distance check. Wall edge pixels are collected by iterating tile boundaries (the four edges of each WALL tile that borders a FLOOR tile). Cell centroids are tested against this set using a flat spatial index (grid bucket or similar). A cell qualifies if any wall-edge pixel is within `wallDistance` pixels of its centroid.

### Tileable Voronoi

Generate a Voronoi over a tile of size `tileSize × tileSize` with Poisson-disc seeding. Replicate seed points in a border ring around the tile to ensure seamless edges. Stamp this tile across the dungeon bounding box. This matches the Dungeon Scrawl `ee` (Tileable) approach and is more performant than one giant Voronoi over the full canvas.

### Per-Cell Line Generation (`addSegments`)

For each Voronoi cell:
- Pick a random angle seeded from the cell index (for redraw stability)
- Step parallel lines across the cell at `spacing` intervals
- Clip each line to the cell polygon boundary
- Keep lines longer than `minDistance / 3`

### Shadow Pass Difference

Shadow uses the same tileable Voronoi but with a smaller `tileSize` (denser cells) and `disableHatching = true`: instead of adding line segments to output, it adds the entire Voronoi polygon to the shadow cell list. These cells are rendered as filled semi-transparent polygons, clipped to the dungeon shape region near walls.

### Rough-Line Post-Processing

A `roughenSegments(segments, opts): Segment[][]` pure function applies:
1. **`shiftSegment`** — occasionally splits a line into two offset halves (broken-line look)
2. **`subdivide`** — splits each segment into small sub-segments
3. **`scribble`** — adds perpendicular Perlin-noise displacement (wobbly lines)
4. **`addBlemishes`** — adds a slow-wavelength lateral drift
5. **`addSkips`** — randomly removes sub-segments (gaps and micro-dots)

This function is toggled on/off and only runs when `roughness > 0`.

### Configuration Options

```ts
interface HatchOptions {
  wallDistance: number   // pixels; cell must be within this distance of a wall edge
  tileSize: number       // Voronoi tile size in pixels
  minDistance: number    // min Poisson-disc separation (controls cell density)
  maxDistance: number    // max Poisson-disc separation
  spacing: number        // distance between parallel lines within a cell
}

interface ShadowOptions {
  wallDistance: number
  tileSize: number       // smaller than hatch tileSize for denser blobs
  minDistance: number
  maxDistance: number
  fillColor: string
  fillOpacity: number
}
```

Sensible defaults matching Dungeon Scrawl's "Pen & Ink" preset are provided; no user-facing controls beyond existing hatch color and toggle are required for v1.

### Clipping Strategy

Both passes clip the canvas to the union of dungeon floor shape outlines (not tile-by-tile rectangles). This lets hatch lines fall naturally across irregular wall shapes.

### Seed Stability

A deterministic seed derived from `(col, row, tileIndex)` is used for per-cell angle assignment so the pattern is stable across redraws without storing any state.

## Testing Decisions

### What Makes a Good Test

Tests should assert on output geometry or rendered pixels — not on implementation internals like call counts to specific canvas methods. A good test says "shadow cells appear within N pixels of wall edges" or "a rendered canvas region near a wall is darker than a region far from a wall."

### Canvas Snapshot Tests

Render `buildHatchLines` and `buildShadowCells` output to an `OffscreenCanvas` (or node-canvas in Vitest), then compare the pixel buffer to a committed snapshot. These catch visual regressions without coupling to internal structure.

Key snapshot scenarios:
- 3×3 grid with floor at center — hatch and shadow appear in the 4 cardinal wall tiles only, not in corners or open floor
- Single-tile floor in a large wall field — hatch density and shadow blob count are within expected ranges
- All-floor grid — no hatch or shadow rendered
- All-wall grid — no hatch or shadow rendered

### Pure Geometry Unit Tests

`buildHatchLines` and `buildShadowCells` can also be tested without canvas by asserting structural properties:
- Output segments have `length > minDistance / 3`
- Shadow cell centroids are within `wallDistance` pixels of a wall edge
- No output for all-floor or all-wall grids

### Prior Art

`patterns.test.ts` — existing canvas-mock approach for `drawHatching`. The new snapshot tests replace and extend this.

## Out of Scope

- User-facing sliders for `wallDistance`, `spacing`, `tileSize` — defaults are sufficient for v1
- SVG export of rough lines (SVG path generation for roughened segments)
- Per-layer or per-region hatch style variation
- Isometric-specific hatching geometry (isometric view uses the same top-down hatch layer composited on top)
- Animated or interactive hatch preview

## Further Notes

- The `roughenSegments` function is the most subjectively tuned part. Starting with Dungeon Scrawl's default `hatchlineRoughOptions` values (`scribbleAmplitude: 1`, `segmentSkipRate: 0`, `noDotRate: 0.2`, `shiftRate: 0`) gives a good baseline.
- The shadow pass uses `hatchShadingStyle.fillColour` in Dungeon Scrawl — a dark semi-transparent color (e.g., `rgba(0,0,0,0.18)`) works well as a default.
- `d3-delaunay` is already in the project (`Delaunay` imported in `patterns.ts`), so no new dependencies are needed for Voronoi generation.
- Poisson-disc sampling is already implemented in `patterns.ts` as `poissonDisk`. The tileable variant needs an additional "border ring" replication step.
