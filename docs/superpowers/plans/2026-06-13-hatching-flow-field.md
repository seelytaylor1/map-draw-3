# Hatching: Flow Field Streamlines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mechanical diagonal-line hatching in `src/patterns.ts` with flow-field streamlines that produce hand-drawn crosshatch strokes only on wall tiles immediately adjacent to floor tiles.

**Architecture:** A pure positional angle field (`sin`/`cos` trig sum) determines stroke direction at every pixel. For each qualifying wall tile, 6 streamlines (3 per family, two families at ~75° to each other) are traced by Euler-integrating the field. The clip region restricts all strokes to qualifying tiles only, so arc length doesn't need precise control.

**Tech Stack:** TypeScript, Canvas 2D API, Vitest

---

## Files

| File | Action | Purpose |
|---|---|---|
| `src/patterns.ts` | Modify | Replace full implementation |
| `src/patterns.test.ts` | Modify | Replace with new behavior tests |

---

## Task 1: Write failing tests

**Files:**
- Modify: `src/patterns.test.ts`

The new tests are behavior-based: they check *which tiles get clipped* and that *strokes are drawn* — not exact call counts from the algorithm internals. Three of these tests will fail against the current implementation (current impl clips all wall tiles, not just floor-adjacent ones).

- [ ] **Step 1: Replace `src/patterns.test.ts` with the following**

```typescript
// src/patterns.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawHatching } from './patterns'
import { FLOOR, WALL } from './constants'

describe('drawHatching', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = {
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  })

  it('sets the stroke color', () => {
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#ff0000')
    expect(ctx.strokeStyle).toBe('#ff0000')
  })

  it('wraps drawing in save/restore', () => {
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('does not clip floor tiles', () => {
    // 1x1 all-floor: no wall tiles exist, nothing to clip
    const grid = new Uint8Array([FLOOR])
    drawHatching(ctx, grid, 1, 1, 20, '#000')
    expect(ctx.rect).not.toHaveBeenCalled()
  })

  it('does not clip walls that have no floor neighbors', () => {
    // 2x2 all-wall: no tile has a floor neighbor, nothing qualifies
    const grid = new Uint8Array([WALL, WALL, WALL, WALL])
    drawHatching(ctx, grid, 2, 2, 20, '#000')
    expect(ctx.rect).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('clips only the wall tile adjacent to floor in a 2x1 grid', () => {
    // [WALL, FLOOR]: wall at (0,0) has floor at (1,0) as east neighbor
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.rect).toHaveBeenCalledTimes(1)
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 20, 20)
  })

  it('clips only the 4 cardinal wall tiles adjacent to a center floor tile', () => {
    // 3x3 with floor at center (1,1):
    // W W W
    // W F W
    // W W W
    // Cardinal neighbors of floor: (1,0) N, (0,1) W, (2,1) E, (1,2) S → 4 tiles
    // Corner walls (0,0),(0,2),(2,0),(2,2) have no floor neighbor → not clipped
    const grid = new Uint8Array([
      WALL, WALL, WALL,
      WALL, FLOOR, WALL,
      WALL, WALL, WALL,
    ])
    drawHatching(ctx, grid, 3, 3, 20, '#000')
    expect(ctx.rect).toHaveBeenCalledTimes(4)
    expect(ctx.rect).toHaveBeenCalledWith(20, 0, 20, 20)  // (1,0)
    expect(ctx.rect).toHaveBeenCalledWith(0, 20, 20, 20)  // (0,1)
    expect(ctx.rect).toHaveBeenCalledWith(40, 20, 20, 20) // (2,1)
    expect(ctx.rect).toHaveBeenCalledWith(20, 40, 20, 20) // (1,2)
  })

  it('draws strokes for a qualifying tile', () => {
    // Wall at (0,0) adjacent to floor at (1,0) → should produce strokes
    const grid = new Uint8Array([WALL, FLOOR])
    drawHatching(ctx, grid, 2, 1, 20, '#000')
    expect(ctx.stroke).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failures**

```
npx vitest run src/patterns.test.ts
```

Expected failures:
- `does not clip walls that have no floor neighbors` — current impl clips all walls
- `clips only the wall tile adjacent to floor in a 2x1 grid` — passes by coincidence (only 1 wall in the grid), verify it's actually passing for wrong reasons by checking rect call count
- `clips only the 4 cardinal wall tiles adjacent to a center floor tile` — current impl calls rect 8 times, test expects 4

At minimum the all-wall and 3x3 tests should FAIL. If any others pass, they pass by coincidence on the current impl and will still pass after the fix.

---

## Task 2: Implement flow field streamlines in `patterns.ts`

**Files:**
- Modify: `src/patterns.ts`

- [ ] **Step 1: Replace `src/patterns.ts` with the new implementation**

```typescript
// src/patterns.ts
import { FLOOR, WALL } from './constants'

function getLocalTile(grid: Uint8Array, cols: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= grid.length) return WALL
  return grid[row * cols + col]
}

function isAdjacentToFloor(grid: Uint8Array, cols: number, col: number, row: number): boolean {
  return (
    getLocalTile(grid, cols, col, row - 1) === FLOOR ||
    getLocalTile(grid, cols, col, row + 1) === FLOOR ||
    getLocalTile(grid, cols, col - 1, row) === FLOOR ||
    getLocalTile(grid, cols, col + 1, row) === FLOOR
  )
}

function angleField(px: number, py: number, scale: number): number {
  return Math.sin(px / scale) * Math.PI
       + Math.cos(py / (scale * 0.71)) * Math.PI * 0.55
}

function traceStreamline(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  stepSize: number,
  numSteps: number,
  scale: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  let x = x0
  let y = y0
  for (let i = 0; i < numSteps; i++) {
    const a = angleField(x, y, scale)
    x += Math.cos(a) * stepSize
    y += Math.sin(a) * stepSize
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

export function drawHatching(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  color: string,
): void {
  const scale = tileSize * 4
  const stepSize = tileSize / 5
  const numSteps = 8

  ctx.save()

  // Clip to adjacent-wall tiles only
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) === WALL && isAdjacentToFloor(grid, cols, c, r)) {
        ctx.rect(c * tileSize, r * tileSize, tileSize, tileSize)
      }
    }
  }
  ctx.clip()

  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, tileSize / 16)
  ctx.lineCap = 'round'

  // Two families of streamlines per qualifying tile
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) !== WALL || !isAdjacentToFloor(grid, cols, c, r)) continue

      const cx = c * tileSize + tileSize / 2
      const cy = r * tileSize + tileSize / 2
      const theta = angleField(cx, cy, scale)

      for (let family = 0; family < 2; family++) {
        const a = theta + family * Math.PI * 0.42
        const perpX = -Math.sin(a)
        const perpY = Math.cos(a)
        const spread = tileSize / 3

        for (const k of [-1, 0, 1]) {
          const sx = cx + k * spread * perpX
          const sy = cy + k * spread * perpY
          traceStreamline(ctx, sx, sy, stepSize, numSteps, scale)
        }
      }
    }
  }

  ctx.restore()
}
```

- [ ] **Step 2: Run tests — all 7 should pass**

```
npx vitest run src/patterns.test.ts
```

Expected output:
```
✓ src/patterns.test.ts (7 tests)
Test Files  1 passed (1)
      Tests  7 passed (7)
```

- [ ] **Step 3: Run full test suite to check for regressions**

```
npx vitest run
```

Expected: all tests pass.

---

## Task 3: Commit

- [ ] **Step 1: Commit**

```
git add src/patterns.ts src/patterns.test.ts
git commit -m "feat: replace diagonal-line hatching with flow field streamlines"
```

---

## Visual verification (manual)

After committing, open the app at `http://localhost:5173`, draw a room (paint some floor tiles), and enable the Hatch toggle. You should see:

- Crosshatch strokes only on wall tiles immediately touching the floor region
- Stroke direction varies smoothly from one side of the room to another
- No strokes on walls further from the floor, or on floor tiles themselves
- Strokes are gently curved, not straight lines
- Two stroke families per tile crossing at ~75°

If strokes look too sparse, reduce `numSteps` to 6. If they look too dense, increase `spread` to `tileSize / 2.5`.
