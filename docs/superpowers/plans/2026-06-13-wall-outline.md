# Wall Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a crisp stroke (with soft shadow) along every wall–floor boundary edge, with a user-selectable Clean or Rough style, controllable color.

**Architecture:** New `buildWallOutlineSegments` function in `patterns.ts` collects edge segments; `roughenSegments` (already exported) handles the Rough style; two-pass Konva.Line rendering (shadow then line) lives inside the per-level group in `App.tsx`. Export adds a `LineSpec` shape type so the off-stage Konva layer renders identically to the live view.

**Tech Stack:** TypeScript, React, Konva / react-konva, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/patterns.ts` | Add `OUTLINE_ROUGH_OPTS` constant + `buildWallOutlineSegments` export |
| `src/patterns.test.ts` | Add tests for `buildWallOutlineSegments` |
| `src/App.tsx` | State vars, rendering in layer effect, toolbar UI, serialization call, export call |
| `src/serialization.ts` | Add 3 optional fields to `MapSave` / `DeserializedMap`, update `serialize` / `deserialize` |
| `src/exportShapes.ts` | Add `LineSpec` to `ShapeSpec`, add 3 params to `BuildExportParams`, render outline in `buildTopDownExport` |

---

### Task 1: `buildWallOutlineSegments` + `OUTLINE_ROUGH_OPTS` in patterns.ts

**Files:**
- Modify: `src/patterns.ts`
- Modify: `src/patterns.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the following block to the bottom of `src/patterns.test.ts`, after the `buildHatchPolylines` describe block. Also add `buildWallOutlineSegments` to the import on line 3:

```typescript
// line 3 — update import
import { drawHatching, buildHatchLines, buildHatchPolylines, roughenSegments, buildWallOutlineSegments, HatchOptions, RoughLineOptions } from './patterns'
```

```typescript
// append after the buildHatchPolylines describe block

describe('buildWallOutlineSegments', () => {
  it('returns empty array for all-wall grid', () => {
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    expect(buildWallOutlineSegments(grid, 2, 2, 20)).toHaveLength(0)
  })

  it('returns empty array for all-floor grid', () => {
    const grid = new Uint8Array(9).fill(FLOOR)
    expect(buildWallOutlineSegments(grid, 3, 3, 20)).toHaveLength(0)
  })

  it('returns 4 segments for a single floor tile surrounded by walls', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // center tile (col=1, row=1)
    expect(buildWallOutlineSegments(grid, 3, 3, 20)).toHaveLength(4)
  })

  it('returns correct pixel coordinates for center floor tile', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // (col=1, row=1)
    const T = 10
    const segs = buildWallOutlineSegments(grid, 3, 3, T)
    const flat = segs.map(s => s.flat()).sort((a, b) =>
      a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3],
    )
    // top edge: y=10, x=10→20
    expect(flat).toContainEqual([10, 10, 20, 10])
    // left edge: x=10, y=10→20
    expect(flat).toContainEqual([10, 10, 10, 20])
    // right edge: x=20, y=10→20
    expect(flat).toContainEqual([20, 10, 20, 20])
    // bottom edge: y=20, x=10→20
    expect(flat).toContainEqual([10, 20, 20, 20])
  })

  it('does not emit a segment for the shared edge between two adjacent floor tiles', () => {
    // 3×3 grid: floor at (1,1) and (2,1) — share a vertical edge that must not appear
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR // (1,1)
    grid[5] = FLOOR // (2,1)
    // Each floor tile has 4 edges; two tiles share 1 → 4+4−2 = 6
    expect(buildWallOutlineSegments(grid, 3, 3, 10)).toHaveLength(6)
  })

  it('each segment is a 2-element array of [number, number] pairs', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    for (const seg of buildWallOutlineSegments(grid, 3, 3, 20)) {
      expect(seg).toHaveLength(2)
      for (const pt of seg) {
        expect(pt).toHaveLength(2)
        expect(typeof pt[0]).toBe('number')
        expect(typeof pt[1]).toBe('number')
      }
    }
  })

  it('is deterministic', () => {
    const grid = new Uint8Array(9).fill(WALL)
    grid[4] = FLOOR
    const r1 = buildWallOutlineSegments(grid, 3, 3, 20)
    const r2 = buildWallOutlineSegments(grid, 3, 3, 20)
    expect(r1).toEqual(r2)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run src/patterns.test.ts
```

Expected: the new `buildWallOutlineSegments` tests fail with `buildWallOutlineSegments is not a function` (or similar). Existing tests remain green.

- [ ] **Step 3: Add `OUTLINE_ROUGH_OPTS` and `buildWallOutlineSegments` to `src/patterns.ts`**

Insert the following immediately before the `// drawHatching — public canvas API` comment block near the bottom of the file (after `drawShadow`):

```typescript
// ---------------------------------------------------------------------------
// Wall outline segments
// ---------------------------------------------------------------------------

export const OUTLINE_ROUGH_OPTS: RoughLineOptions = {
  segmentSizeMin: 1,
  segmentSizeMax: 1,
  segmentSkipRate: 0,        // never gap the outline
  noDotRate: 0.2,
  scribbleScale: 0.15,
  scribbleAmplitude: 0.6,    // gentle wobble (hatching uses 1)
  shiftRate: 0.05,           // rare mid-segment splits
  shiftAmountMin: 0.5,
  shiftAmountMax: 1.0,
  majorNoiseScale: 0.05,
  majorNoiseAmplitude: 0,
  majorNoiseShift: 0.9,
}

/**
 * Return one line segment for each edge shared between a WALL tile and a
 * FLOOR/WATER tile. Out-of-bounds is treated as WALL (per getTile), so map
 * boundary edges are never emitted. Each interior edge is visited once.
 */
export function buildWallOutlineSegments(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
): [number, number][][] {
  const segs: [number, number][][] = []
  const rows_ = grid.length / cols

  function tile(c: number, r: number): number {
    if (c < 0 || r < 0 || c >= cols || r >= rows_) return WALL
    return grid[r * cols + c]
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tile(c, r)
      const right  = tile(c + 1, r)
      const bottom = tile(c, r + 1)

      // One side WALL, other side non-WALL → boundary
      if ((t === WALL) !== (right === WALL)) {
        segs.push([
          [(c + 1) * tileSize,  r      * tileSize],
          [(c + 1) * tileSize, (r + 1) * tileSize],
        ])
      }
      if ((t === WALL) !== (bottom === WALL)) {
        segs.push([
          [ c      * tileSize, (r + 1) * tileSize],
          [(c + 1) * tileSize, (r + 1) * tileSize],
        ])
      }
    }
  }

  return segs
}
```

- [ ] **Step 4: Run tests — verify they pass**

```
npx vitest run src/patterns.test.ts
```

Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/patterns.ts src/patterns.test.ts
git commit -m "feat: add buildWallOutlineSegments and OUTLINE_ROUGH_OPTS to patterns"
```

---

### Task 2: State vars + outline rendering in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add three new state variables**

After the `showHatching` / `hatchColor` state declarations (around line 107–108), add:

```typescript
const [showWallOutline, setShowWallOutline] = useState(false)
const [wallOutlineColor, setWallOutlineColor] = useState('#000000')
const [wallOutlineStyle, setWallOutlineStyle] = useState<'clean' | 'rough'>('clean')
```

- [ ] **Step 2: Update the patterns import**

The existing import on line 18 is:

```typescript
import { buildHatchPolylines } from './patterns'
```

Replace it with:

```typescript
import { buildHatchPolylines, buildWallOutlineSegments, roughenSegments, OUTLINE_ROUGH_OPTS } from './patterns'
```

- [ ] **Step 3: Add outline rendering inside the per-level group**

In the main `useEffect` (the one that calls `layer.destroyChildren()`), find the hatching block that ends with `group.add(hatchGroup)`. Immediately after that block (before `layer.add(group)`), add:

```typescript
      // Wall outline — two passes: shadow then line
      if (showWallOutline) {
        const outlineSegs = buildWallOutlineSegments(levelGrid, cols, rows, TILE_PX)
        const polylines = wallOutlineStyle === 'rough'
          ? roughenSegments(outlineSegs, OUTLINE_ROUGH_OPTS, 77)
          : outlineSegs
        const outlineGroup = new Konva.Group({ listening: false })
        for (const polyline of polylines) {
          if (polyline.length < 2) continue
          outlineGroup.add(new Konva.Line({
            points: (polyline as [number, number][]).flat(),
            stroke: wallOutlineColor,
            strokeWidth: 6,
            opacity: 0.18,
            lineCap: 'round',
            lineJoin: 'round',
            listening: false,
          }))
        }
        for (const polyline of polylines) {
          if (polyline.length < 2) continue
          outlineGroup.add(new Konva.Line({
            points: (polyline as [number, number][]).flat(),
            stroke: wallOutlineColor,
            strokeWidth: 2,
            lineCap: 'round',
            lineJoin: 'round',
            listening: false,
          }))
        }
        group.add(outlineGroup)
      }
```

- [ ] **Step 4: Add new state to the useEffect dependency array**

Find the dependency array at the end of the main layer `useEffect` (around line 805):

```typescript
  }, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, isoFaceColor, showHatching, hatchColor])
```

Replace with:

```typescript
  }, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle])
```

- [ ] **Step 5: Verify visually**

Run the dev server:

```
npm run dev
```

Open the app, paint a room, and temporarily force `showWallOutline` to `true` in the initial `useState` call to confirm the outline and shadow appear on wall–floor edges. Then set it back to `false`.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render wall outline strokes in main layer"
```

---

### Task 3: Toolbar UI for wall outline

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the Outline section to the toolbar**

Find the Hatching section in the JSX (search for `{/* ── HATCHING ── */}`). After its closing `</div>` and before the `{/* ── STAMPS ── */}` comment, insert:

```tsx
        {/* ── OUTLINE ── */}
        <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Outline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowWallOutline(v => !v)}
            style={{
              padding: '4px 8px', fontSize: 11, cursor: 'pointer',
              background: showWallOutline ? '#555' : 'transparent',
              color: '#eee',
              border: showWallOutline ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            ◻ Outline
          </button>
          {showWallOutline && (
            <input
              type="color" value={wallOutlineColor}
              onChange={e => setWallOutlineColor(e.target.value)}
              style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
            />
          )}
          {showWallOutline && (
            <span style={{ color: '#aaa', fontSize: 11 }}>{wallOutlineColor}</span>
          )}
        </div>
        {showWallOutline && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['clean', 'rough'] as const).map(s => (
              <button
                key={s}
                onClick={() => setWallOutlineStyle(s)}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                  background: wallOutlineStyle === s ? '#555' : 'transparent',
                  color: '#eee',
                  border: wallOutlineStyle === s ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                }}
              >
                {s === 'clean' ? '— Clean' : '⌇ Rough'}
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 2: Verify in browser**

```
npm run dev
```

- Toggle Outline on/off — stroke should appear/disappear.
- Change color — stroke updates.
- Switch Clean / Rough — style switches (Rough wobbles slightly, Clean is crisp).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Outline toolbar section with color and style toggle"
```

---

### Task 4: Serialization (save / load)

**Files:**
- Modify: `src/serialization.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add fields to `MapSave`**

In `src/serialization.ts`, find the `MapSave` interface and add three optional fields after `hatchColor`:

```typescript
  showWallOutline?: boolean
  wallOutlineColor?: string
  wallOutlineStyle?: 'clean' | 'rough'
```

- [ ] **Step 2: Add fields to `DeserializedMap`**

Find the `DeserializedMap` interface and add (non-optional, with concrete types):

```typescript
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
```

- [ ] **Step 3: Update `serialize`**

Find the `serialize` function. Its `params` destructuring currently includes `hatchColor`. Add the three new params:

```typescript
// In the params type, after hatchColor:
  showWallOutline: boolean
  wallOutlineColor: string
  wallOutlineStyle: 'clean' | 'rough'
```

Add them to the returned object after `hatchColor`:

```typescript
  showWallOutline: params.showWallOutline,
  wallOutlineColor: params.wallOutlineColor,
  wallOutlineStyle: params.wallOutlineStyle,
```

- [ ] **Step 4: Update `deserialize`**

Find the `deserialize` function. After the `hatchColor` line in its return, add:

```typescript
  showWallOutline: save.showWallOutline ?? false,
  wallOutlineColor: save.wallOutlineColor ?? '#000000',
  wallOutlineStyle: save.wallOutlineStyle ?? 'clean',
```

- [ ] **Step 5: Update `handleSave` in `App.tsx`**

Find the `handleSave` function. The `serialize(...)` call currently passes `showHatching, hatchColor`. Add the three new values:

```typescript
const save = serialize({ grids, cols, rows, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, stamps, steps, ramps, labels })
```

- [ ] **Step 6: Update `applyLoad` in `App.tsx`**

Find the `applyLoad` function. After `setHatchColor(save.hatchColor)`, add:

```typescript
      setShowWallOutline(save.showWallOutline)
      setWallOutlineColor(save.wallOutlineColor)
      setWallOutlineStyle(save.wallOutlineStyle)
```

- [ ] **Step 7: Verify round-trip**

```
npm run dev
```

1. Enable outline, set color, pick Rough style.
2. Click Save → downloads `dungeon-map.json`.
3. Open the JSON and confirm it contains `showWallOutline: true`, `wallOutlineColor`, `wallOutlineStyle: "rough"`.
4. Reload the page, drag the JSON onto the canvas → outline settings restore correctly.

- [ ] **Step 8: Commit**

```bash
git add src/serialization.ts src/App.tsx
git commit -m "feat: serialize wall outline settings to save file"
```

---

### Task 5: PNG Export

**Files:**
- Modify: `src/exportShapes.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `LineSpec` to `exportShapes.ts`**

After the `CanvasSpec` type declaration, add:

```typescript
export type LineSpec = {
  kind: 'line'
  points: number[]
  stroke: string
  strokeWidth: number
  opacity?: number
}
```

Update the `ShapeSpec` union:

```typescript
export type ShapeSpec = RectSpec | PolygonSpec | ImageSpec | CanvasSpec | LineSpec
```

- [ ] **Step 2: Update the patterns import in `exportShapes.ts`**

The existing import is:

```typescript
import { drawHatching } from './patterns'
```

Replace with:

```typescript
import { drawHatching, buildWallOutlineSegments, roughenSegments, OUTLINE_ROUGH_OPTS } from './patterns'
```

- [ ] **Step 3: Add outline params to `BuildExportParams`**

Find the `BuildExportParams` type. After `hatchColor?: string`, add:

```typescript
  showWallOutline?: boolean
  wallOutlineColor?: string
  wallOutlineStyle?: 'clean' | 'rough'
```

- [ ] **Step 4: Destructure and render outline in `buildExportShapes`**

Find the top of `buildExportShapes`. Replace the existing destructuring with:

```typescript
const { grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, showHatching, hatchColor, showWallOutline, wallOutlineColor, wallOutlineStyle, exportTile: T } = params
```

Then after the hatching block (the `if (showHatching && hatchColor)` block), add:

```typescript
  if (showWallOutline && wallOutlineColor) {
    const outlineSegs = buildWallOutlineSegments(grid, cols, rows, T)
    const polylines = wallOutlineStyle === 'rough'
      ? roughenSegments(outlineSegs, OUTLINE_ROUGH_OPTS, 77)
      : outlineSegs
    for (const polyline of polylines) {
      if (polyline.length < 2) continue
      layout.shapes.push({
        kind: 'line',
        points: (polyline as [number, number][]).flat(),
        stroke: wallOutlineColor,
        strokeWidth: Math.round(6 * T / TILE_PX),
        opacity: 0.18,
      })
      layout.shapes.push({
        kind: 'line',
        points: (polyline as [number, number][]).flat(),
        stroke: wallOutlineColor,
        strokeWidth: Math.round(2 * T / TILE_PX),
        opacity: 1,
      })
    }
  }
```

- [ ] **Step 5: Handle `LineSpec` in the off-stage renderer in `App.tsx`**

Find the export renderer loop in `handleExport` (the `for (const shape of layout.shapes)` block). After the `'canvas'` case, add:

```typescript
      } else if (shape.kind === 'line') {
        offLayer.add(new Konva.Line({
          points: shape.points,
          stroke: shape.stroke,
          strokeWidth: shape.strokeWidth,
          opacity: shape.opacity,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
        }))
```

- [ ] **Step 6: Pass outline params from `handleExport`**

Find the `buildExportShapes({ ... })` call in `handleExport`. After `hatchColor`, add:

```typescript
      showWallOutline,
      wallOutlineColor,
      wallOutlineStyle,
```

- [ ] **Step 7: Verify PNG export**

```
npm run dev
```

1. Paint a room, enable outline with a visible color.
2. Click PNG — download opens.
3. Open the downloaded image — outline stroke and shadow should appear on wall–floor edges.
4. Repeat with Rough style selected.

- [ ] **Step 8: Commit**

```bash
git add src/exportShapes.ts src/App.tsx
git commit -m "feat: include wall outline in PNG export"
```
