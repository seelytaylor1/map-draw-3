# Directional Run Foundation & Narrow Render Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate two bodies of duplicated code — the shared direction/geometry logic in `steps.ts` and `ramps.ts`, and the reimplemented rendering in `exportShapes.ts`.

**Architecture:** Extract a `directionalRun.ts` foundation module with generic mutations and shared geometry; migrate `steps.ts` and `ramps.ts` to use it. Then create a `topDownScene.ts` pure scene builder and route `exportShapes.ts` through `buildIsoScene` (iso) and `buildTopDownShapes` (top-down). All public APIs preserved — no callers change.

**Tech Stack:** TypeScript, Vitest (`npx vitest run <file>` to run tests)

---

## File Map

| File | Action | Responsibility after |
|------|--------|----------------------|
| `src/directionalRun.ts` | **Create** | Shared `DirectionalRun` interface, direction constants, `uvToGrid`, `runTiles`, `topDownRunFaceRect`, generic `addRun/removeRun/rotateRun/moveRun` |
| `src/directionalRun.test.ts` | **Create** | Tests for all of the above |
| `src/steps.ts` | **Modify** | Step-specific geometry only; all shared logic delegated to `directionalRun` |
| `src/ramps.ts` | **Modify** | Ramp-specific geometry only; all shared logic delegated to `directionalRun` |
| `src/topDownScene.ts` | **Create** | Pure `buildTopDownShapes(grid, cols, rows, show3D)` → `TileShape[]` in tile-unit coordinates |
| `src/topDownScene.test.ts` | **Create** | Tests for `buildTopDownShapes` |
| `src/exportShapes.ts` | **Modify** | Thin coordinator: iso path calls `buildIsoScene`, top-down path calls `buildTopDownShapes`; stamps unchanged |

`steps.test.ts`, `ramps.test.ts`, `exportShapes.test.ts`, `isoScene.test.ts` — **no changes required** (public APIs preserved).

---

## Part 1: Directional Run Foundation

### Task 1: Write failing tests for `directionalRun.ts`

**Files:**
- Create: `src/directionalRun.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// src/directionalRun.test.ts
import { describe, expect, it } from 'vitest'
import {
  runTiles, uvToGrid, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
  type DirectionalRun,
} from './directionalRun'

function run(overrides: Partial<DirectionalRun> = {}): DirectionalRun {
  return { id: 'a', col: 3, row: 4, z: 0, direction: 'E', ...overrides }
}

describe('runTiles', () => {
  it('extends east (col increases) for direction E', () => {
    expect(runTiles(run({ direction: 'E' }))).toEqual([
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ])
  })
  it('extends west (col decreases) for direction W', () => {
    expect(runTiles(run({ direction: 'W' }))).toEqual([
      { col: 3, row: 4 },
      { col: 2, row: 4 },
    ])
  })
  it('extends north (row decreases) for direction N', () => {
    expect(runTiles(run({ direction: 'N' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 3 },
    ])
  })
  it('extends south (row increases) for direction S', () => {
    expect(runTiles(run({ direction: 'S' }))).toEqual([
      { col: 3, row: 4 },
      { col: 3, row: 5 },
    ])
  })
})

describe('uvToGrid', () => {
  it('E: u along col, v along row', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'E' }), 1.5, 0.5)).toEqual({ col: 3.5, row: 1.5 })
  })
  it('W: u inverted along col, v along row', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'W' }), 0, 0)).toEqual({ col: 3, row: 1 })
  })
  it('S: u along row, v along col', () => {
    expect(uvToGrid(run({ col: 2, row: 1, direction: 'S' }), 1, 0.5)).toEqual({ col: 2.5, row: 2 })
  })
  it('N: u inverted along row, v along col', () => {
    expect(uvToGrid(run({ col: 2, row: 3, direction: 'N' }), 0, 0)).toEqual({ col: 2, row: 4 })
  })
})

describe('topDownRunFaceRect', () => {
  it('E: face below the run (south), full 2-tile width', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'E' }), 20, 8)).toEqual(
      { x: 60, y: 100, width: 40, height: 8 }
    )
  })
  it('W: face below origin shifted one tile left', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'W' }), 20, 8)).toEqual(
      { x: 40, y: 100, width: 40, height: 8 }
    )
  })
  it('S: face to the right of the run (east), full 2-tile height', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'S' }), 20, 8)).toEqual(
      { x: 80, y: 80, width: 8, height: 40 }
    )
  })
  it('N: face to the right shifted one tile up', () => {
    expect(topDownRunFaceRect(run({ col: 3, row: 4, direction: 'N' }), 20, 8)).toEqual(
      { x: 80, y: 60, width: 8, height: 40 }
    )
  })
})

describe('list mutations', () => {
  it('addRun appends without mutating the original', () => {
    const list: DirectionalRun[] = []
    const result = addRun(list, run())
    expect(result).toEqual([run()])
    expect(list).toEqual([])
  })

  it('removeRun removes by id and leaves others', () => {
    const list = [run({ id: 'a' }), run({ id: 'b' })]
    expect(removeRun(list, 'a')).toEqual([run({ id: 'b' })])
  })

  it('rotateRun cycles direction N→E→S→W→N', () => {
    const list = [run({ id: 'a', direction: 'N' })]
    expect(rotateRun(list, 'a')[0].direction).toBe('E')
    const list2 = [run({ id: 'a', direction: 'W' })]
    expect(rotateRun(list2, 'a')[0].direction).toBe('N')
  })

  it('moveRun updates col/row of the matching id only', () => {
    const list = [run({ id: 'a', col: 0, row: 0 }), run({ id: 'b', col: 5, row: 5 })]
    const result = moveRun(list, 'a', 7, 8)
    expect(result[0]).toEqual({ id: 'a', col: 7, row: 8, z: 0, direction: 'E' })
    expect(result[1]).toEqual(list[1])
  })

  it('rotateRun does not mutate original', () => {
    const list = [run({ id: 'a', direction: 'N' })]
    rotateRun(list, 'a')
    expect(list[0].direction).toBe('N')
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails with "cannot find module"**

```
npx vitest run src/directionalRun.test.ts
```

Expected: FAIL — `Cannot find module './directionalRun'`

---

### Task 2: Implement `directionalRun.ts`

**Files:**
- Create: `src/directionalRun.ts`

- [ ] **Step 1: Write the implementation**

```ts
// src/directionalRun.ts
export type Direction = 'N' | 'E' | 'S' | 'W'

export interface DirectionalRun {
  id: string
  col: number
  row: number
  z: number
  direction: Direction
}

export const RUN_LENGTH = 2  // tiles from top floor to bottom floor

export const DIRECTION_DELTAS: Record<Direction, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
}

export const DIRECTION_CYCLE: Record<Direction, Direction> = { N: 'E', E: 'S', S: 'W', W: 'N' }

// Run-local frame: u runs 0..RUN_LENGTH along the descent, v runs 0..1 across it.
export function uvToGrid(run: DirectionalRun, u: number, v: number): { col: number; row: number } {
  switch (run.direction) {
    case 'E': return { col: run.col + u, row: run.row + v }
    case 'W': return { col: run.col + 1 - u, row: run.row + v }
    case 'S': return { col: run.col + v, row: run.row + u }
    case 'N': return { col: run.col + v, row: run.row + 1 - u }
  }
}

export function runTiles(run: DirectionalRun): { col: number; row: number }[] {
  const { dc, dr } = DIRECTION_DELTAS[run.direction]
  return Array.from({ length: RUN_LENGTH }, (_, i) => ({
    col: run.col + dc * i,
    row: run.row + dr * i,
  }))
}

export function topDownRunFaceRect(
  run: DirectionalRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  const len = RUN_LENGTH * tilePx
  switch (run.direction) {
    case 'E': return { x: run.col * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'W': return { x: (run.col - 1) * tilePx, y: (run.row + 1) * tilePx, width: len, height: facePx }
    case 'S': return { x: (run.col + 1) * tilePx, y: run.row * tilePx, width: facePx, height: len }
    case 'N': return { x: (run.col + 1) * tilePx, y: (run.row - 1) * tilePx, width: facePx, height: len }
  }
}

export function addRun<T extends DirectionalRun>(list: T[], run: T): T[] {
  return [...list, run]
}

export function removeRun<T extends DirectionalRun>(list: T[], id: string): T[] {
  return list.filter(r => r.id !== id)
}

export function rotateRun<T extends DirectionalRun>(list: T[], id: string): T[] {
  return list.map(r => r.id === id ? { ...r, direction: DIRECTION_CYCLE[r.direction] } : r)
}

export function moveRun<T extends DirectionalRun>(list: T[], id: string, col: number, row: number): T[] {
  return list.map(r => r.id === id ? { ...r, col, row } : r)
}
```

- [ ] **Step 2: Run the new tests — all should pass**

```
npx vitest run src/directionalRun.test.ts
```

Expected: all PASS

- [ ] **Step 3: Run the full test suite — nothing should have broken**

```
npx vitest run
```

Expected: all PASS (directionalRun.ts is not yet imported by anything)

---

### Task 3: Migrate `steps.ts`

**Files:**
- Modify: `src/steps.ts`

- [ ] **Step 1: Replace the full content of `steps.ts`**

The logic is identical — only the source of `DIRECTION_DELTAS`, `DIRECTION_CYCLE`, `uvToGrid`, and the list mutations changes. All exported names stay the same.

```ts
// src/steps.ts
import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'
import {
  type DirectionalRun, RUN_LENGTH,
  uvToGrid, runTiles, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
} from './directionalRun'

export type StepDirection = 'N' | 'E' | 'S' | 'W'

export interface StepRun extends DirectionalRun {
  direction: StepDirection
}

export const STEP_RUN_LENGTH = RUN_LENGTH

export function stepRunTiles(run: StepRun): { col: number; row: number }[] {
  return runTiles(run)
}

export const STEP_TREAD_COUNT = 6

export interface IsoTread {
  top: number[]   // closed quad, 4 points as flat [x, y, ...]
  front: number[] // vertical riser face at the tread's leading edge
}

// Grid-space center of each tread — painter depth anchors for render sorting.
export function stepTreadCenters(run: StepRun): { col: number; row: number }[] {
  const centers: { col: number; row: number }[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const uMid = ((i + 0.5) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    centers.push(uvToGrid(run, uMid, 0.5))
  }
  return centers
}

export interface StepSideFace {
  points: number[]
  side: 'south' | 'east'
}

export function isoStepSideFaces(run: StepRun, tileW: number, tileH: number, faceH: number): StepSideFace[] {
  const side = run.direction === 'E' || run.direction === 'W' ? 'south' : 'east'
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const faces: StepSideFace[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const d = i * drop
    const bottom = Math.min(d + faceH, Z_STEP_HEIGHT)
    const ga = uvToGrid(run, u0, 1)
    const gb = uvToGrid(run, u1, 1)
    const a = isoProject(ga.col, ga.row, tileW, tileH)
    const b = isoProject(gb.col, gb.row, tileW, tileH)
    faces.push({
      side,
      points: [a.x, a.y + d, b.x, b.y + d, b.x, b.y + bottom, a.x, a.y + bottom],
    })
  }
  return faces
}

export function topDownStepFaceRect(
  run: StepRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  return topDownRunFaceRect(run, tilePx, facePx)
}

export interface TreadRect {
  x: number
  y: number
  width: number
  height: number
}

export function topDownStepRects(run: StepRun): TreadRect[] {
  const rects: TreadRect[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const a = uvToGrid(run, u0, 0)
    const b = uvToGrid(run, u1, 1)
    rects.push({
      x: Math.min(a.col, b.col),
      y: Math.min(a.row, b.row),
      width: Math.abs(b.col - a.col),
      height: Math.abs(b.row - a.row),
    })
  }
  return rects
}

export function isoStepTreads(run: StepRun, tileW: number, tileH: number): IsoTread[] {
  const drop = Z_STEP_HEIGHT / STEP_TREAD_COUNT
  const treads: IsoTread[] = []
  for (let i = 0; i < STEP_TREAD_COUNT; i++) {
    const u0 = (i * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const u1 = ((i + 1) * STEP_RUN_LENGTH) / STEP_TREAD_COUNT
    const d = i * drop
    const corners = [
      uvToGrid(run, u0, 0),
      uvToGrid(run, u1, 0),
      uvToGrid(run, u1, 1),
      uvToGrid(run, u0, 1),
    ].map(g => isoProject(g.col, g.row, tileW, tileH))
    const top = corners.flatMap(p => [p.x, p.y + d])
    const a = corners[1]
    const b = corners[2]
    const front = [a.x, a.y + d, b.x, b.y + d, b.x, b.y + d + drop, a.x, a.y + d + drop]
    treads.push({ top, front })
  }
  return treads
}

export function addStepRun(steps: StepRun[], run: StepRun): StepRun[] { return addRun(steps, run) }
export function removeStepRun(steps: StepRun[], id: string): StepRun[] { return removeRun(steps, id) }
export function moveStepRun(steps: StepRun[], id: string, col: number, row: number): StepRun[] { return moveRun(steps, id, col, row) }
export function rotateStepRun(steps: StepRun[], id: string): StepRun[] { return rotateRun(steps, id) }
```

- [ ] **Step 2: Run the existing step tests — all must pass**

```
npx vitest run src/steps.test.ts
```

Expected: all PASS (same behavior, different implementation)

---

### Task 4: Migrate `ramps.ts`

**Files:**
- Modify: `src/ramps.ts`

- [ ] **Step 1: Replace the full content of `ramps.ts`**

```ts
// src/ramps.ts
import { Z_STEP_HEIGHT } from './constants'
import { isoProject } from './iso'
import {
  type DirectionalRun, RUN_LENGTH,
  uvToGrid, runTiles, topDownRunFaceRect,
  addRun, removeRun, rotateRun, moveRun,
} from './directionalRun'

export type RampDirection = 'N' | 'E' | 'S' | 'W'

export interface RampRun extends DirectionalRun {
  direction: RampDirection
}

export const RAMP_RUN_LENGTH = RUN_LENGTH

export function rampRunTiles(run: RampRun): { col: number; row: number }[] {
  return runTiles(run)
}

// Linear elevation drop at distance u along the descent.
function dropAt(u: number): number {
  return (u / RAMP_RUN_LENGTH) * Z_STEP_HEIGHT
}

export function isoRampSurface(run: RampRun, tileW: number, tileH: number): number[] {
  const L = RAMP_RUN_LENGTH
  const corners: { u: number; v: number }[] = [
    { u: 0, v: 0 },
    { u: L, v: 0 },
    { u: L, v: 1 },
    { u: 0, v: 1 },
  ]
  return corners.flatMap(({ u, v }) => {
    const g = uvToGrid(run, u, v)
    const p = isoProject(g.col, g.row, tileW, tileH)
    return [p.x, p.y + dropAt(u)]
  })
}

export function rampCenter(run: RampRun): { col: number; row: number } {
  return uvToGrid(run, RAMP_RUN_LENGTH / 2, 0.5)
}

export function topDownRampFaceRect(
  run: RampRun,
  tilePx: number,
  facePx: number,
): { x: number; y: number; width: number; height: number } {
  return topDownRunFaceRect(run, tilePx, facePx)
}

export interface RampRect {
  x: number
  y: number
  width: number
  height: number
}

export function topDownRampRect(run: RampRun): RampRect {
  const a = uvToGrid(run, 0, 0)
  const b = uvToGrid(run, RAMP_RUN_LENGTH, 1)
  return {
    x: Math.min(a.col, b.col),
    y: Math.min(a.row, b.row),
    width: Math.abs(b.col - a.col),
    height: Math.abs(b.row - a.row),
  }
}

export interface RampSideFace {
  points: number[]
  side: 'south' | 'east'
}

export function isoRampSideFace(run: RampRun, tileW: number, tileH: number): RampSideFace {
  const side = run.direction === 'E' || run.direction === 'W' ? 'south' : 'east'
  const ga = uvToGrid(run, 0, 1)
  const gb = uvToGrid(run, RAMP_RUN_LENGTH, 1)
  const a = isoProject(ga.col, ga.row, tileW, tileH)
  const b = isoProject(gb.col, gb.row, tileW, tileH)
  return {
    side,
    points: [
      a.x, a.y + dropAt(0),
      b.x, b.y + dropAt(RAMP_RUN_LENGTH),
      b.x, b.y + Z_STEP_HEIGHT,
      a.x, a.y + Z_STEP_HEIGHT,
    ],
  }
}

export function addRampRun(ramps: RampRun[], run: RampRun): RampRun[] { return addRun(ramps, run) }
export function removeRampRun(ramps: RampRun[], id: string): RampRun[] { return removeRun(ramps, id) }
export function moveRampRun(ramps: RampRun[], id: string, col: number, row: number): RampRun[] { return moveRun(ramps, id, col, row) }
export function rotateRampRun(ramps: RampRun[], id: string): RampRun[] { return rotateRun(ramps, id) }
```

- [ ] **Step 2: Run the existing ramp tests — all must pass**

```
npx vitest run src/ramps.test.ts
```

Expected: all PASS

---

### Task 5: Full verification and commit

**Files:** (no changes)

- [ ] **Step 1: Run the complete test suite**

```
npx vitest run
```

Expected: all PASS

- [ ] **Step 2: Commit**

```bash
git add src/directionalRun.ts src/directionalRun.test.ts src/steps.ts src/ramps.ts
git commit -m "refactor: extract directional-run foundation; steps and ramps delegate shared logic"
```

---

## Part 2: Narrow Render Pipeline

### Task 6: Write failing tests for `topDownScene.ts`

**Files:**
- Create: `src/topDownScene.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// src/topDownScene.test.ts
import { describe, expect, it } from 'vitest'
import { buildTopDownShapes } from './topDownScene'
import { createGrid, paintTiles } from './grid'
import { FLOOR, WATER } from './constants'

function grid(cols: number, rows: number, tiles: { col: number; row: number }[], state = FLOOR) {
  return paintTiles(createGrid(cols, rows), cols, tiles, state)
}

describe('buildTopDownShapes: tile emission', () => {
  it('emits a floor shape for each painted floor tile', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes).toContainEqual({ kind: 'floor', col: 1, row: 1 })
  })

  it('emits a water shape for each painted water tile', () => {
    const g = grid(3, 3, [{ col: 0, row: 0 }], WATER)
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes).toContainEqual({ kind: 'water', col: 0, row: 0 })
  })

  it('emits nothing for wall tiles', () => {
    const g = createGrid(3, 3) // all wall
    expect(buildTopDownShapes(g, 3, 3, false)).toEqual([])
  })
})

describe('buildTopDownShapes: 3D faces', () => {
  it('emits no face shapes when show3D is false', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, false)
    expect(shapes.filter(s => s.kind === 'face')).toEqual([])
  })

  it('emits a south face when floor is adjacent to wall at row+1', () => {
    // floor at (1,1); (1,2) is wall by default
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 1, side: 'south' })
  })

  it('emits an east face when floor is adjacent to wall at col+1', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 1, side: 'east' })
  })

  it('does not emit a south face when floor neighbor to the south is also floor', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }, { col: 1, row: 2 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).not.toContainEqual({ kind: 'face', col: 1, row: 1, side: 'south' })
  })

  it('does not emit an east face when floor neighbor to the east is also floor', () => {
    const g = grid(3, 3, [{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).not.toContainEqual({ kind: 'face', col: 1, row: 1, side: 'east' })
  })

  it('emits a south face at the bottom map boundary', () => {
    const g = grid(3, 3, [{ col: 1, row: 2 }]) // bottom row
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 1, row: 2, side: 'south' })
  })

  it('emits an east face at the right map boundary', () => {
    const g = grid(3, 3, [{ col: 2, row: 1 }]) // rightmost col
    const shapes = buildTopDownShapes(g, 3, 3, true)
    expect(shapes).toContainEqual({ kind: 'face', col: 2, row: 1, side: 'east' })
  })
})

describe('buildTopDownShapes: shape ordering', () => {
  it('face shapes come after floor shape for the same tile (so they draw on top)', () => {
    const g = grid(3, 3, [{ col: 0, row: 0 }])
    const shapes = buildTopDownShapes(g, 3, 3, true)
    const floorIdx = shapes.findIndex(s => s.kind === 'floor' && s.col === 0 && s.row === 0)
    const faceIdx = shapes.findIndex(s => s.kind === 'face' && s.col === 0 && s.row === 0)
    expect(floorIdx).toBeLessThan(faceIdx)
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails with "cannot find module"**

```
npx vitest run src/topDownScene.test.ts
```

Expected: FAIL — `Cannot find module './topDownScene'`

---

### Task 7: Implement `topDownScene.ts`

**Files:**
- Create: `src/topDownScene.ts`

- [ ] **Step 1: Write the implementation**

All coordinates are in tile units. The caller (exportShapes.ts) multiplies by the tile pixel size.

```ts
// src/topDownScene.ts
import { FLOOR, WALL, WATER } from './constants'
import { getTile } from './grid'

export type TileShape =
  | { kind: 'floor'; col: number; row: number }
  | { kind: 'water'; col: number; row: number }
  | { kind: 'face'; col: number; row: number; side: 'south' | 'east' }

export function buildTopDownShapes(
  grid: Uint8Array,
  cols: number,
  rows: number,
  show3D: boolean,
): TileShape[] {
  const out: TileShape[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const state = getTile(grid, cols, c, r)
      if (state === FLOOR) {
        out.push({ kind: 'floor', col: c, row: r })
        if (show3D) {
          const southNeighbor = r + 1 < rows ? getTile(grid, cols, c, r + 1) : null
          const eastNeighbor  = c + 1 < cols ? getTile(grid, cols, c + 1, r) : null
          if (r + 1 >= rows || southNeighbor === WALL) {
            out.push({ kind: 'face', col: c, row: r, side: 'south' })
          }
          if (c + 1 >= cols || eastNeighbor === WALL) {
            out.push({ kind: 'face', col: c, row: r, side: 'east' })
          }
        }
      } else if (state === WATER) {
        out.push({ kind: 'water', col: c, row: r })
      }
    }
  }

  return out
}
```

- [ ] **Step 2: Run the new tests — all should pass**

```
npx vitest run src/topDownScene.test.ts
```

Expected: all PASS

- [ ] **Step 3: Run the full test suite — nothing broken**

```
npx vitest run
```

Expected: all PASS

---

### Task 8: Update `exportShapes.ts` iso path to call `buildIsoScene`

**Files:**
- Modify: `src/exportShapes.ts`

The private `buildIsoShapes` function is replaced. Its public surface (`ExportLayout`, `ShapeSpec` types, `buildExportShapes` function) stays identical — no test changes needed.

- [ ] **Step 1: Add the `buildIsoScene` import at the top of `exportShapes.ts`**

Find the existing import block (top of file) and add one line:

```ts
import { buildIsoScene } from './isoScene'
```

The full import section becomes:

```ts
import { FLOOR, FLOOR_COLOR, FACE_COLOR, ISO_FRONT_FACE_COLOR, ISO_EAST_FACE_COLOR, FACE_PX, TILE_PX, WALL, WATER, WATER_COLOR } from './constants'
import { getTile } from './grid'
import { isoFloorPoints, isoFrontFacePoints, isoEastFacePoints, isoWaterPoints, isoProject, isoStampTransform } from './iso'
import { isObjectStamp, stampSize, type Stamp } from './stamps'
import { buildIsoScene } from './isoScene'
```

- [ ] **Step 2: Replace the private `buildIsoShapes` function (lines 140–252)**

Delete the entire `buildIsoShapes` function and replace it with:

```ts
function buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean
  wallColor: string; wallOpacity: number
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
    selectedStepId: null, selectedRampId: null,
    tileW: ITW, tileH: ITH,
  })

  const shapes: ShapeSpec[] = isoShapes.map(s => ({
    kind: 'polygon' as const,
    points: s.points,
    fill: s.fill ?? FLOOR_COLOR,
    opacity: s.opacity,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
  }))

  for (const stamp of stamps) {
    const sz = stampSize(stamp.type)
    const sc = stamp.scale ?? 1
    const w = sz.cols * T * sc
    const h = sz.rows * T * sc
    const isoCenter = isoProject(stamp.col + sz.cols / 2, stamp.row + sz.rows / 2, ITW, ITH)
    const isoBottom = isoProject(stamp.col + sz.cols, stamp.row + sz.rows, ITW, ITH)
    if (isObjectStamp(stamp)) {
      shapes.push({
        kind: 'image',
        stampType: stamp.type,
        x: isoCenter.x,
        y: isoBottom.y,
        w: sz.cols * T * 2 * sc,
        h,
        offsetX: sz.cols * T * sc,
        offsetY: h,
        rotation: 0,
        mirrored: stamp.mirrored,
      })
    } else {
      const t = isoStampTransform(stamp.rotation)
      shapes.push({
        kind: 'image',
        stampType: stamp.type,
        x: isoCenter.x,
        y: isoCenter.y,
        w, h,
        offsetX: w / 2,
        offsetY: h / 2,
        rotation: t.rotation,
        scaleX: stamp.mirrored ? -t.scaleX : t.scaleX,
        scaleY: t.scaleY,
        skewX: t.skewX,
      })
    }
  }

  return { canvasW, canvasH, offsetX, shapes }
}
```

- [ ] **Step 3: Update the `buildExportShapes` dispatcher** to call `buildIsoExport` instead of `buildIsoShapes`

Find (line ~61):
```ts
  if (showIso) {
    return buildIsoShapes({ grid, cols, rows, show3D, wallColor, wallOpacity, stamps, T })
  }
```

Replace with:
```ts
  if (showIso) {
    return buildIsoExport({ grid, cols, rows, show3D, wallColor, wallOpacity, stamps, T })
  }
```

- [ ] **Step 4: Run the iso export tests**

```
npx vitest run src/exportShapes.test.ts
```

Expected: all PASS

---

### Task 9: Update `exportShapes.ts` top-down path to call `buildTopDownShapes`

**Files:**
- Modify: `src/exportShapes.ts`

- [ ] **Step 1: Add the `buildTopDownShapes` import**

Update the import block to add:
```ts
import { buildTopDownShapes } from './topDownScene'
```

- [ ] **Step 2: Replace the private `buildTopDownShapes` function (lines 66–138)**

Delete the entire old `buildTopDownShapes` function and replace it with `buildTopDownExport`:

```ts
function buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T }: {
  grid: Uint8Array; cols: number; rows: number
  show3D: boolean; showGrid: boolean
  wallColor: string; wallOpacity: number
  stamps: Stamp[]; T: number
}): ExportLayout {
  const canvasW = cols * T
  const canvasH = rows * T
  const faceT = Math.round(FACE_PX * T / TILE_PX)
  const shapes: ShapeSpec[] = []

  if (wallOpacity > 0) {
    shapes.push({ kind: 'rect', x: 0, y: 0, w: canvasW, h: canvasH, fill: wallColor, opacity: wallOpacity })
  }

  for (const s of buildTopDownShapes(grid, cols, rows, show3D)) {
    switch (s.kind) {
      case 'floor':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: FLOOR_COLOR })
        break
      case 'water':
        shapes.push({ kind: 'rect', x: s.col * T, y: s.row * T, w: T, h: T, fill: WATER_COLOR })
        break
      case 'face':
        if (s.side === 'south') {
          shapes.push({ kind: 'rect', x: s.col * T, y: (s.row + 1) * T, w: T, h: faceT, fill: FACE_COLOR })
        } else {
          shapes.push({ kind: 'rect', x: (s.col + 1) * T, y: s.row * T, w: faceT, h: T, fill: FACE_COLOR })
        }
        break
    }
  }

  if (showGrid) {
    const sw = 0.5 * (T / TILE_PX)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (getTile(grid, cols, c, r) === FLOOR) {
          shapes.push({ kind: 'rect', x: c * T, y: r * T, w: T, h: T, fill: 'transparent', stroke: 'rgba(0,0,0,0.2)', strokeWidth: sw })
        }
      }
    }
  }

  for (const stamp of stamps) {
    if (isObjectStamp(stamp)) continue
    const sz = stampSize(stamp.type)
    const sc = stamp.scale ?? 1
    const w = sz.cols * T * sc
    const h = sz.rows * T * sc
    shapes.push({
      kind: 'image',
      stampType: stamp.type,
      x: stamp.col * T + sz.cols * T / 2,
      y: stamp.row * T + sz.rows * T / 2,
      w, h,
      offsetX: w / 2,
      offsetY: h / 2,
      rotation: stamp.rotation,
      mirrored: stamp.mirrored,
    })
  }

  return { canvasW, canvasH, offsetX: 0, shapes }
}
```

- [ ] **Step 3: Update the `buildExportShapes` dispatcher** to call `buildTopDownExport` instead of `buildTopDownShapes`

Find (line ~63):
```ts
  return buildTopDownShapes({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T })
```

Replace with:
```ts
  return buildTopDownExport({ grid, cols, rows, show3D, showGrid, wallColor, wallOpacity, stamps, T })
```

- [ ] **Step 4: Remove the now-unused imports from `exportShapes.ts`**

`isoFloorPoints`, `isoFrontFacePoints`, `isoEastFacePoints`, `isoWaterPoints` were used only by the deleted `buildIsoShapes` logic. Remove them from the iso import line. Also remove `WALL` from the constants import since `buildTopDownShapes` now handles the wall check. The updated imports are:

```ts
import { FLOOR, FLOOR_COLOR, FACE_COLOR, FACE_PX, TILE_PX, WATER_COLOR } from './constants'
import { getTile } from './grid'
import { isoProject, isoStampTransform } from './iso'
import { isObjectStamp, stampSize, type Stamp } from './stamps'
import { buildIsoScene } from './isoScene'
import { buildTopDownShapes } from './topDownScene'
```

Removed from original imports: `ISO_FRONT_FACE_COLOR`, `ISO_EAST_FACE_COLOR`, `WALL`, `WATER` (tile rendering now happens inside the scene builders), and `isoFloorPoints`, `isoFrontFacePoints`, `isoEastFacePoints`, `isoWaterPoints` (deleted with `buildIsoShapes`).

---

### Task 10: Full verification and commit

**Files:** (no changes)

- [ ] **Step 1: Run the complete test suite**

```
npx vitest run
```

Expected: all PASS

- [ ] **Step 2: Check for TypeScript errors**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/topDownScene.ts src/topDownScene.test.ts src/exportShapes.ts
git commit -m "refactor: route export shapes through buildIsoScene and buildTopDownShapes"
```
