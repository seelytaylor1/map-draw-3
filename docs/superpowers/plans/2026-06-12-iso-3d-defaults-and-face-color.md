# Iso 3D Defaults and Face Color Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D faces always on in iso view, always off in top-down; user picks one base color from which front/east face shades are derived.

**Architecture:** New `faceColors.ts` utility derives two shades from one hex color. `IsoSceneParams` and `BuildExportParams` gain `frontFaceColor`/`eastFaceColor` replacing hardcoded constants. App.tsx adds `isoFaceColor` state, a `useEffect` that syncs `show3D` to `showIso`, and a face color picker in the toolbar.

**Tech Stack:** React, TypeScript, Vitest, Konva/react-konva

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/faceColors.ts` | `deriveFaceColors(hex)` utility |
| Create | `src/faceColors.test.ts` | unit tests for deriveFaceColors |
| Modify | `src/isoScene.ts` | add `frontFaceColor`/`eastFaceColor` to `IsoSceneParams`; replace hardcoded constants |
| Modify | `src/isoScene.test.ts` | update `params()` helper; update color assertions |
| Modify | `src/exportShapes.ts` | add `frontFaceColor`/`eastFaceColor` to `BuildExportParams` + `buildIsoExport` |
| Modify | `src/exportShapes.test.ts` | update `baseParams()` helper |
| Modify | `src/isoStampPlacement.test.ts` | update `baseParams()` helper |
| Modify | `src/constants.ts` | remove `ISO_FRONT_FACE_COLOR`, `ISO_EAST_FACE_COLOR` |
| Modify | `src/serialization.ts` | add `isoFaceColor?: string` to `MapSave`; `isoFaceColor: string` to `DeserializedMap` |
| Modify | `src/serialization.test.ts` | add `isoFaceColor` to `BASE` fixture |
| Modify | `src/App.tsx` | state, effect, toolbar, wire calls, save/load |

---

## Task 1: Create faceColors.ts and its unit test

**Files:**
- Create: `src/faceColors.ts`
- Create: `src/faceColors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/faceColors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveFaceColors } from './faceColors'

describe('deriveFaceColors', () => {
  it('front is base darkened by 15%', () => {
    const { front } = deriveFaceColors('#6a5040')
    expect(front).toBe('#5a4436')
  })

  it('east is base lightened by 15%', () => {
    const { east } = deriveFaceColors('#6a5040')
    expect(east).toBe('#7a5c4a')
  })

  it('east clamps channels to 255', () => {
    const { east } = deriveFaceColors('#ffffff')
    expect(east).toBe('#ffffff')
  })

  it('front clamps channels to 0', () => {
    const { front } = deriveFaceColors('#000000')
    expect(front).toBe('#000000')
  })
})
```

- [ ] **Step 2: Run test, confirm it fails**

```
npx vitest run src/faceColors.test.ts
```
Expected: error `Cannot find module './faceColors'`

- [ ] **Step 3: Create src/faceColors.ts**

```ts
export function deriveFaceColors(baseHex: string): { front: string; east: string } {
  const r = parseInt(baseHex.slice(1, 3), 16)
  const g = parseInt(baseHex.slice(3, 5), 16)
  const b = parseInt(baseHex.slice(5, 7), 16)
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return {
    front: `#${toHex(r * 0.85)}${toHex(g * 0.85)}${toHex(b * 0.85)}`,
    east: `#${toHex(r * 1.15)}${toHex(g * 1.15)}${toHex(b * 1.15)}`,
  }
}
```

- [ ] **Step 4: Run test, confirm it passes**

```
npx vitest run src/faceColors.test.ts
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/faceColors.ts src/faceColors.test.ts
git commit -m "feat: add deriveFaceColors utility"
```

---

## Task 2: Thread face colors through isoScene.ts

**Files:**
- Modify: `src/isoScene.ts`
- Modify: `src/isoScene.test.ts`

- [ ] **Step 1: Update IsoSceneParams to require face colors**

In `src/isoScene.ts`, change line 1 (remove `ISO_EAST_FACE_COLOR`, `ISO_FRONT_FACE_COLOR` from the import):

```ts
import { FACE_PX, FLOOR, FLOOR_COLOR, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT } from './constants'
```

Add two fields to `IsoSceneParams` after `facePx?`:

```ts
export interface IsoSceneParams {
  grids: Map<number, Uint8Array>
  steps: StepRun[]
  ramps: RampRun[]
  cols: number
  rows: number
  show3D: boolean
  wallColor: string
  wallOpacity: number
  selectedStepId?: string | null
  selectedRampId?: string | null
  tileW: number
  tileH: number
  facePx?: number
  frontFaceColor: string
  eastFaceColor: string
}
```

Replace every use of the old constants inside `buildIsoScene`:

| Old | New |
|-----|-----|
| `ISO_FRONT_FACE_COLOR` | `p.frontFaceColor` |
| `ISO_EAST_FACE_COLOR` | `p.eastFaceColor` |

There are five occurrences — lines 86, 89, 112, 116, 135 in the original file. After the replacement the affected sections look like:

```ts
// tile south face (line ~86)
shapes.push({ points: isoFrontFacePoints(c, r, p.tileW, p.tileH, facePx), fill: p.frontFaceColor })
// tile east face (line ~89)
shapes.push({ points: isoEastFacePoints(c, r, p.tileW, p.tileH, facePx), fill: p.eastFaceColor })

// step side face (line ~112)
fill: sideFaces[i].side === 'south' ? p.frontFaceColor : p.eastFaceColor,

// step riser (line ~116)
shapes.push({ points: tread.front, fill: p.frontFaceColor, stepId: run.id })

// ramp side face (line ~135)
fill: face.side === 'south' ? p.frontFaceColor : p.eastFaceColor,
```

- [ ] **Step 2: Update isoScene.test.ts**

Replace the imports and `params()` helper at the top of `src/isoScene.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildIsoScene, type IsoSceneParams } from './isoScene'
import { createGrid, paintTiles } from './grid'
import { isoEastFacePoints, isoFloorPoints, isoFrontFacePoints, isoProject, isoWaterPoints } from './iso'
import { FACE_PX, FLOOR, FLOOR_COLOR, WATER, WATER_COLOR, Z_STEP_HEIGHT } from './constants'
import { STEP_TREAD_COUNT, isoStepTreads, type StepRun } from './steps'
import { isoRampSurface, type RampRun } from './ramps'
import { deriveFaceColors } from './faceColors'

const TILE_W = 40
const TILE_H = 20

const { front: FRONT_COLOR, east: EAST_COLOR } = deriveFaceColors('#6a5040')

function offset(points: number[]): number[] {
  return points.map((v, i) => (i % 2 === 1 ? v - Z_STEP_HEIGHT : v))
}

function params(overrides: Partial<IsoSceneParams> = {}): IsoSceneParams {
  return {
    grids: new Map(),
    steps: [] as StepRun[],
    ramps: [] as RampRun[],
    cols: 8,
    rows: 8,
    show3D: false,
    wallColor: '#000000',
    wallOpacity: 0,
    selectedStepId: null,
    selectedRampId: null,
    tileW: TILE_W,
    tileH: TILE_H,
    frontFaceColor: FRONT_COLOR,
    eastFaceColor: EAST_COLOR,
    ...overrides,
  }
}
```

Then update the three assertions that reference the old constants:

```ts
// in 'show3D floor emits its south and east faces immediately after its top'
expect(shapes[1].fill).toBe(FRONT_COLOR)   // was ISO_FRONT_FACE_COLOR
expect(shapes[2].fill).toBe(EAST_COLOR)    // was ISO_EAST_FACE_COLOR

// in 'with 3D each tread emits side face, riser, then top'
expect(shapes[0].fill).toBe(FRONT_COLOR)   // was ISO_FRONT_FACE_COLOR (side face)
expect(shapes[1].fill).toBe(FRONT_COLOR)   // was ISO_FRONT_FACE_COLOR (riser)

// in 'with 3D emits the wedge side face beneath the surface'
expect(rampShapes[0].fill).toBe(FRONT_COLOR)  // was ISO_FRONT_FACE_COLOR
```

- [ ] **Step 3: Run tests, confirm they pass**

```
npx vitest run src/isoScene.test.ts
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/isoScene.ts src/isoScene.test.ts
git commit -m "refactor: thread frontFaceColor/eastFaceColor through isoScene"
```

---

## Task 3: Thread face colors through exportShapes.ts

**Files:**
- Modify: `src/exportShapes.ts`
- Modify: `src/exportShapes.test.ts`
- Modify: `src/isoStampPlacement.test.ts`

- [ ] **Step 1: Update BuildExportParams and buildExportShapes**

In `src/exportShapes.ts`, add two fields to `BuildExportParams`:

```ts
export type BuildExportParams = {
  grid: Uint8Array
  cols: number
  rows: number
  showIso: boolean
  show3D: boolean
  showGrid: boolean
  wallColor: string
  wallOpacity: number
  frontFaceColor: string
  eastFaceColor: string
  stamps: Stamp[]
  exportTile: number
}
```

Update `buildExportShapes` to destructure and forward them:

```ts
export function buildExportShapes(params: BuildExportParams): ExportLayout {
  const { grid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, exportTile: T } = params

  if (showIso) {
    return buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T })
  }
  return buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T })
}
```

Update `buildIsoExport` signature and its `buildIsoScene` call:

```ts
function buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, frontFaceColor, eastFaceColor, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean
  wallColor: string; wallOpacity: number
  frontFaceColor: string; eastFaceColor: string
  stamps: Stamp[]; T: number
}): ExportLayout {
  const ITW = T * 2
  const ITH = T
  const canvasW = (cols + rows) * T
  const canvasH = (cols + rows) * T / 2
  const offsetX = rows * T

  const isoShapes = buildIsoScene({
    grids: new Map([[0, grid]]),
    steps: [],
    ramps: [],
    cols, rows, show3D, wallColor, wallOpacity,
    frontFaceColor, eastFaceColor,
    selectedStepId: null, selectedRampId: null,
    tileW: ITW, tileH: ITH,
    facePx: Math.round(FACE_PX * T / TILE_PX),
  })
  // rest of function unchanged
```

- [ ] **Step 2: Update exportShapes.test.ts baseParams**

In `src/exportShapes.test.ts`, add the import and update `baseParams`:

```ts
import { deriveFaceColors } from './faceColors'

const { front: FRONT_COLOR, east: EAST_COLOR } = deriveFaceColors('#6a5040')

function baseParams(cols: number, rows: number, grid?: Uint8Array) {
  return {
    grid: grid ?? createGrid(cols, rows),
    cols,
    rows,
    showIso: false,
    show3D: false,
    showGrid: false,
    wallColor: '#000000',
    wallOpacity: 0,
    frontFaceColor: FRONT_COLOR,
    eastFaceColor: EAST_COLOR,
    stamps: [],
    exportTile: ET,
  }
}
```

- [ ] **Step 3: Update isoStampPlacement.test.ts baseParams**

In `src/isoStampPlacement.test.ts`, add the import and update `baseParams`:

```ts
import { deriveFaceColors } from './faceColors'

const { front: FRONT_COLOR, east: EAST_COLOR } = deriveFaceColors('#6a5040')

function baseParams(cols = 4, rows = 4) {
  return {
    grid: createGrid(cols, rows),
    cols, rows,
    showIso: true,
    show3D: false,
    showGrid: false,
    wallColor: '#000000',
    wallOpacity: 0,
    frontFaceColor: FRONT_COLOR,
    eastFaceColor: EAST_COLOR,
    stamps: [] as any[],
    exportTile: T,
  }
}
```

- [ ] **Step 4: Run all tests, confirm they pass**

```
npx vitest run src/exportShapes.test.ts src/isoStampPlacement.test.ts
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/exportShapes.ts src/exportShapes.test.ts src/isoStampPlacement.test.ts
git commit -m "refactor: thread frontFaceColor/eastFaceColor through exportShapes"
```

---

## Task 4: Remove dead constants

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Remove ISO_FRONT_FACE_COLOR and ISO_EAST_FACE_COLOR from constants.ts**

Replace the full file content of `src/constants.ts` with:

```ts
export const TILE_PX = 20          // screen pixels per tile (display resolution)
export const FACE_PX = 8           // 3D side-face thickness in pixels
export const TILES_PER_INCH = 5
export const DEFAULT_COLS = 55     // 11" × 5
export const DEFAULT_ROWS = 42     // 8.5" × 5 (landscape)
export const WALL = 0 as const
export const FLOOR = 1 as const
export const WATER = 2 as const
export type TileState = typeof WALL | typeof FLOOR | typeof WATER

export const FLOOR_COLOR = '#f5f0e8'
export const WATER_COLOR = '#6baed6'
export const FACE_COLOR = '#6a5040'

export const Z_STEP_HEIGHT = TILE_PX / 2 + FACE_PX  // 18px at current constants
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```
npx vitest run
```
Expected: all tests pass (any lingering import of `ISO_FRONT_FACE_COLOR`/`ISO_EAST_FACE_COLOR` will cause a TypeScript compile error here)

- [ ] **Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "refactor: remove ISO_FRONT_FACE_COLOR and ISO_EAST_FACE_COLOR constants"
```

---

## Task 5: Wire isoFaceColor state into App.tsx

**Files:**
- Modify: `src/App.tsx`

This task adds the state and plumbs derived colors into `buildIsoScene` and `buildExportShapes`. No UI changes yet.

- [ ] **Step 1: Update imports**

In `src/App.tsx`, change the constants import to remove `FACE_COLOR` (no longer used for iso) and add the faceColors import. Find this line near the top:

```ts
import { DEFAULT_COLS, DEFAULT_ROWS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, TILE_PX, TILES_PER_INCH, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT, type TileState } from './constants'
```

Replace with:

```ts
import { DEFAULT_COLS, DEFAULT_ROWS, FACE_COLOR, FACE_PX, FLOOR, FLOOR_COLOR, TILE_PX, TILES_PER_INCH, WALL, WATER, WATER_COLOR, Z_STEP_HEIGHT, type TileState } from './constants'
import { deriveFaceColors } from './faceColors'
```

(`FACE_COLOR` stays — it's still used for top-down step/ramp face rects.)

- [ ] **Step 2: Add isoFaceColor state**

After the `show3D` and `showIso` state declarations (around line 103–104):

```ts
const [show3D, setShow3D] = useState(false)
const [showIso, setShowIso] = useState(false)
const [isoFaceColor, setIsoFaceColor] = useState('#6a5040')
```

- [ ] **Step 3: Update the buildIsoScene call in the render useEffect**

Find the `buildIsoScene` call inside the layer render `useEffect` (around line 479). It currently reads:

```ts
const shapes = buildIsoScene({
  grids, steps, ramps, cols, rows, show3D, wallColor, wallOpacity, selectedStepId, selectedRampId,
  tileW: TILE_PX * 2, tileH: TILE_PX,
})
```

Replace with:

```ts
const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
const shapes = buildIsoScene({
  grids, steps, ramps, cols, rows, show3D, wallColor, wallOpacity, selectedStepId, selectedRampId,
  frontFaceColor, eastFaceColor,
  tileW: TILE_PX * 2, tileH: TILE_PX,
})
```

Also add `isoFaceColor` to that `useEffect`'s dependency array. Find the array at the end of the layer render useEffect:

```ts
}, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso])
```

Replace with:

```ts
}, [grids, steps, ramps, selectedStepId, selectedRampId, activeZ, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, isoFaceColor])
```

- [ ] **Step 4: Update the buildExportShapes call in handleExport**

Find the `buildExportShapes` call inside `handleExport` (around line 1011):

```ts
const layout = buildExportShapes({
  grid: activeGrid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity,
  stamps: stamps.filter(s => s.z === activeZ),
  exportTile: 60,
})
```

Replace with:

```ts
const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)
const layout = buildExportShapes({
  grid: activeGrid, cols, rows, showIso, show3D, showGrid, wallColor, wallOpacity,
  frontFaceColor, eastFaceColor,
  stamps: stamps.filter(s => s.z === activeZ),
  exportTile: 60,
})
```

Also add `isoFaceColor` to the `handleExport` `useCallback` dependency array:

```ts
}, [activeGrid, activeZ, stamps, cols, rows, wallColor, wallOpacity, showGrid, show3D, showIso, stampImages, isoFaceColor])
```

- [ ] **Step 5: Confirm TypeScript compiles with no errors**

```
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add isoFaceColor state and wire derived colors to scene/export"
```

---

## Task 6: Add useEffect sync and update toolbar

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the show3D/showIso sync useEffect**

After the existing `useEffect` hooks near the top of the component body, add:

```ts
useEffect(() => { setShow3D(showIso) }, [showIso])
```

- [ ] **Step 2: Remove the ◫ 3D button from the toolbar**

Find the Settings button row in the JSX (around line 1373–1410). It currently renders three buttons: `# Grid`, `◫ 3D`, `⬡ Iso`. Remove the middle button entirely. The row becomes:

```tsx
<div style={{ display: 'flex', gap: 6 }}>
  <button
    onClick={() => setShowGrid(v => !v)}
    style={{
      flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
      background: showGrid ? '#555' : 'transparent',
      color: '#eee',
      border: showGrid ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
      borderRadius: 4,
    }}
  >
    # Grid
  </button>
  <button
    onClick={() => setShowIso(v => !v)}
    style={{
      flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
      background: showIso ? '#4a3a6a' : 'transparent',
      color: '#eee',
      border: showIso ? '2px solid #bf9fff' : '2px solid rgba(255,255,255,0.2)',
      borderRadius: 4,
    }}
  >
    ⬡ Iso
  </button>
</div>
```

- [ ] **Step 3: Add the face color picker**

Find the Wall color row in the toolbar (around line 1454–1462):

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Wall</label>
  <input
    type="color" value={wallColor}
    onChange={e => setWallColor(e.target.value)}
    style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
  />
  <span style={{ color: '#aaa', fontSize: 11 }}>{wallColor}</span>
</div>
```

Insert this immediately after it (before the Opacity row):

```tsx
{showIso && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <label style={{ width: 52, color: '#aaa', fontSize: 11 }}>Face</label>
    <input
      type="color" value={isoFaceColor}
      onChange={e => setIsoFaceColor(e.target.value)}
      style={{ width: 36, height: 22, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
    />
    <span style={{ color: '#aaa', fontSize: 11 }}>{isoFaceColor}</span>
  </div>
)}
```

- [ ] **Step 4: Run the dev server and verify manually**

```
npm run dev
```

Check:
1. In top-down view: ◫ 3D button is gone. Turning on ⬡ Iso enables 3D faces automatically. No face color picker visible.
2. In iso view: face color picker appears. Changing the color updates face shading in real time. Switching back to top-down hides the picker and removes 3D faces.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: auto-sync 3D to iso view and add face color picker"
```

---

## Task 7: Serialize isoFaceColor

**Files:**
- Modify: `src/serialization.ts`
- Modify: `src/serialization.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update MapSave and DeserializedMap interfaces**

In `src/serialization.ts`, add `isoFaceColor` to both interfaces:

```ts
export interface MapSave {
  version: 1
  cols: number
  rows: number
  grids: Record<string, number[]>
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor?: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}

export interface DeserializedMap {
  version: 1
  cols: number
  rows: number
  grids: Map<number, Uint8Array>
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}
```

- [ ] **Step 2: Update serialize to include isoFaceColor**

The `serialize` function signature gains `isoFaceColor: string` in its params object:

```ts
export function serialize(params: {
  grids: Map<number, Uint8Array>
  cols: number
  rows: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
  isoFaceColor: string
  stamps: Stamp[]
  steps: StepRun[]
  ramps: RampRun[]
}): MapSave {
```

And in the returned object, add `isoFaceColor: params.isoFaceColor` after `show3D`:

```ts
return {
  version: 1,
  cols: params.cols,
  rows: params.rows,
  grids,
  wallColor: params.wallColor,
  wallOpacity: params.wallOpacity,
  brushShape: params.brushShape,
  showGrid: params.showGrid,
  show3D: params.show3D,
  isoFaceColor: params.isoFaceColor,
  stamps: params.stamps.map(s => {
    const { scale, mirrored, z, ...rest } = s
    const out: Partial<Stamp> = { ...rest }
    if (z !== 0) out.z = z
    if (scale !== undefined && scale !== 1) out.scale = scale
    if (mirrored) out.mirrored = mirrored
    return out as Stamp
  }),
  steps: params.steps.map(s => ({ ...s })),
  ramps: params.ramps.map(r => ({ ...r })),
}
```

- [ ] **Step 3: Update deserialize to read isoFaceColor**

In `deserialize`, after the `show3D` line add:

```ts
const isoFaceColor = typeof s['isoFaceColor'] === 'string' ? s['isoFaceColor'] : '#6a5040'
```

And include `isoFaceColor` in the returned object:

```ts
return {
  version: 1,
  cols: s['cols'] as number,
  rows: s['rows'] as number,
  grids,
  wallColor: s['wallColor'] as string,
  wallOpacity: s['wallOpacity'] as number,
  brushShape: s['brushShape'] as 'square' | 'circle',
  showGrid: s['showGrid'] as boolean,
  show3D,
  isoFaceColor,
  stamps,
  steps,
  ramps,
}
```

- [ ] **Step 4: Update serialization.test.ts**

Add `isoFaceColor` to the `BASE` fixture in `src/serialization.test.ts`:

```ts
const BASE = {
  grids: GRIDS,
  cols: 2,
  rows: 2,
  wallColor: '#ff0000',
  wallOpacity: 0.5,
  brushShape: 'circle' as const,
  showGrid: true,
  show3D: false,
  isoFaceColor: '#6a5040',
  stamps: [] as Stamp[],
  steps: [] as StepRun[],
  ramps: [] as RampRun[],
}
```

- [ ] **Step 5: Run serialization tests**

```
npx vitest run src/serialization.test.ts
```
Expected: all tests pass

- [ ] **Step 6: Update App.tsx handleSave and applyLoad**

In `handleSave`, add `isoFaceColor` to the `serialize` call:

```ts
const save = serialize({ grids, cols, rows, wallColor, wallOpacity, brushShape, showGrid, show3D, isoFaceColor, stamps, steps, ramps })
```

In `applyLoad`, add `setIsoFaceColor` after `setShow3D`:

```ts
setShow3D(save.show3D)
setIsoFaceColor(save.isoFaceColor)
```

- [ ] **Step 7: Run full test suite**

```
npx vitest run
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/serialization.ts src/serialization.test.ts src/App.tsx
git commit -m "feat: persist isoFaceColor in save file"
```
