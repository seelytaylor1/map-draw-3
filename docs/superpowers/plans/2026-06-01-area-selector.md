# Area Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace freehand square/circle brush painting with a click-drag area selector that commits a filled rect or inscribed circle on mouseup.

**Architecture:** Keep `brushShape` state; change paint-mode mouse gesture from drag-paint to drag-select. Add `areaPhase/areaStart/areaEnd` state+refs mirroring the rough-mode pattern. On mouseup, compute tile set from bounding box and push a single history entry. Remove `brushSize` and all freehand refs.

**Tech Stack:** React 19, TypeScript, Konva/react-konva, Vitest

---

## File Map

- **Modify:** `src/serialization.ts` — remove `brushSize` from `MapSave`, `serialize`, `deserialize`
- **Modify:** `src/serialization.test.ts` — drop `brushSize` from fixtures and assertions, add backward-compat test
- **Modify:** `src/App.tsx` — add `getAreaTiles` helper; swap freehand state/refs for area-select ones; rewrite mouse handlers and ghost rendering; remove brush size slider; update save/load

---

### Task 1: Update serialization — remove brushSize

**Files:**
- Modify: `src/serialization.ts`
- Modify: `src/serialization.test.ts`

- [ ] **Step 1: Write the updated serialization tests first**

Replace the entire content of `src/serialization.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest'
import { serialize, deserialize } from './serialization'
import { type Stamp } from './stamps'

const BASE = {
  grid: new Uint8Array([1, 0, 1, 1]),
  cols: 2,
  rows: 2,
  wallColor: '#ff0000',
  wallOpacity: 0.5,
  brushShape: 'circle' as const,
  showGrid: true,
  stamps: [] as Stamp[],
}

const STAMP: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 90 }

describe('serialize', () => {
  it('produces a JSON-safe object', () => {
    const save = serialize(BASE)
    expect(save.version).toBe(1)
    expect(save.grid).toEqual([1, 0, 1, 1])
    expect(JSON.parse(JSON.stringify(save))).toEqual(save)
  })

  it('converts Uint8Array to plain array', () => {
    const save = serialize(BASE)
    expect(Array.isArray(save.grid)).toBe(true)
  })

  it('includes stamps in output', () => {
    const save = serialize({ ...BASE, stamps: [STAMP] })
    expect(save.stamps).toEqual([STAMP])
  })

  it('does not include brushSize in output', () => {
    const save = serialize(BASE)
    expect('brushSize' in save).toBe(false)
  })
})

describe('deserialize', () => {
  it('round-trips through JSON', () => {
    const json = JSON.stringify(serialize(BASE))
    const restored = deserialize(JSON.parse(json))
    expect(restored.grid).toEqual([1, 0, 1, 1])
    expect(restored.wallColor).toBe('#ff0000')
    expect(restored.wallOpacity).toBe(0.5)
    expect(restored.brushShape).toBe('circle')
    expect(restored.showGrid).toBe(true)
    expect(restored.cols).toBe(2)
    expect(restored.rows).toBe(2)
    expect(restored.stamps).toEqual([])
  })

  it('round-trips stamps', () => {
    const json = JSON.stringify(serialize({ ...BASE, stamps: [STAMP] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps).toEqual([STAMP])
  })

  it('defaults stamps to [] for old v1 saves without stamps field', () => {
    const old = JSON.stringify({ ...serialize(BASE), stamps: undefined })
    const restored = deserialize(JSON.parse(old))
    expect(restored.stamps).toEqual([])
  })

  it('accepts old saves that include brushSize field', () => {
    const old = { ...serialize(BASE), brushSize: 3 }
    expect(() => deserialize(old)).not.toThrow()
  })

  it('throws on non-object', () => {
    expect(() => deserialize('bad')).toThrow()
    expect(() => deserialize(null)).toThrow()
    expect(() => deserialize(42)).toThrow()
  })

  it('throws on unsupported version', () => {
    const bad = { ...serialize(BASE), version: 2 as unknown as 1 }
    expect(() => deserialize(bad)).toThrow('Unsupported version')
  })

  it('throws on missing grid', () => {
    const { grid: _, ...rest } = serialize(BASE)
    expect(() => deserialize(rest)).toThrow('Invalid grid')
  })

  it('throws on invalid brushShape', () => {
    expect(() => deserialize({ ...serialize(BASE), brushShape: 'triangle' })).toThrow('Invalid brushShape')
  })

  it('throws on invalid cols', () => {
    expect(() => deserialize({ ...serialize(BASE), cols: 0 })).toThrow('Invalid cols')
  })

  it('throws on invalid stamp type', () => {
    const bad = { ...serialize(BASE), stamps: [{ ...STAMP, type: 'ghost' }] }
    expect(() => deserialize(bad)).toThrow('Invalid stamp type')
  })

  it('throws on invalid stamp rotation', () => {
    const bad = { ...serialize(BASE), stamps: [{ ...STAMP, rotation: 45 }] }
    expect(() => deserialize(bad)).toThrow('Invalid stamp rotation')
  })
})
```

- [ ] **Step 2: Run tests to confirm failures**

```
npx vitest run src/serialization.test.ts
```

Expected: several FAIL — `brushSize` still in MapSave/serialize/deserialize.

- [ ] **Step 3: Update `src/serialization.ts`**

Replace the entire file with:

```typescript
import { STAMP_TYPES, type Stamp, type StampType, type Rotation } from './stamps'

export interface MapSave {
  version: 1
  cols: number
  rows: number
  grid: number[]
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  stamps: Stamp[]
}

export function serialize(params: {
  grid: Uint8Array
  cols: number
  rows: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  stamps: Stamp[]
}): MapSave {
  return {
    version: 1,
    cols: params.cols,
    rows: params.rows,
    grid: Array.from(params.grid),
    wallColor: params.wallColor,
    wallOpacity: params.wallOpacity,
    brushShape: params.brushShape,
    showGrid: params.showGrid,
    stamps: params.stamps,
  }
}

export function deserialize(raw: unknown): MapSave {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid save: not an object')
  const s = raw as Record<string, unknown>
  if (s['version'] !== 1) throw new Error(`Unsupported version: ${s['version']}`)
  if (typeof s['cols'] !== 'number' || s['cols'] < 1) throw new Error('Invalid cols')
  if (typeof s['rows'] !== 'number' || s['rows'] < 1) throw new Error('Invalid rows')
  if (!Array.isArray(s['grid'])) throw new Error('Invalid grid')
  if (typeof s['wallColor'] !== 'string') throw new Error('Invalid wallColor')
  if (typeof s['wallOpacity'] !== 'number') throw new Error('Invalid wallOpacity')
  if (s['brushShape'] !== 'square' && s['brushShape'] !== 'circle') throw new Error('Invalid brushShape')
  if (typeof s['showGrid'] !== 'boolean') throw new Error('Invalid showGrid')

  const rawStamps = Array.isArray(s['stamps']) ? s['stamps'] : []
  const stamps: Stamp[] = rawStamps.map((entry: unknown): Stamp => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid stamp entry')
    const o = entry as Record<string, unknown>
    if (typeof o['id'] !== 'string') throw new Error('Invalid stamp id')
    if (!STAMP_TYPES.includes(o['type'] as StampType)) throw new Error('Invalid stamp type')
    if (typeof o['col'] !== 'number') throw new Error('Invalid stamp col')
    if (typeof o['row'] !== 'number') throw new Error('Invalid stamp row')
    if (![0, 90, 180, 270].includes(o['rotation'] as number)) throw new Error('Invalid stamp rotation')
    return {
      id: o['id'] as string,
      type: o['type'] as StampType,
      col: o['col'] as number,
      row: o['row'] as number,
      rotation: o['rotation'] as Rotation,
    }
  })

  return {
    version: 1,
    cols: s['cols'] as number,
    rows: s['rows'] as number,
    grid: s['grid'] as number[],
    wallColor: s['wallColor'] as string,
    wallOpacity: s['wallOpacity'] as number,
    brushShape: s['brushShape'] as 'square' | 'circle',
    showGrid: s['showGrid'] as boolean,
    stamps,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run src/serialization.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```
git add src/serialization.ts src/serialization.test.ts
git commit -m "refactor: remove brushSize from serialization format"
```

---

### Task 2: Add area-select state and helper to App.tsx

**Files:**
- Modify: `src/App.tsx`

This task wires up the new state and the `getAreaTiles` helper. No behavior changes yet — the old handlers still reference the old refs, so this task introduces TypeScript errors that Task 3 fixes.

- [ ] **Step 1: Add `getAreaTiles` helper above the `App` component**

In `src/App.tsx`, find the `getBrushTiles` function (lines 54–58) and **replace it** with:

```typescript
function getAreaTiles(start: Tile, end: Tile, shape: BrushShape): Tile[] {
  if (shape === 'square') {
    return rectTiles(start.col, start.row, end.col, end.row)
  }
  const minC = Math.min(start.col, end.col)
  const maxC = Math.max(start.col, end.col)
  const minR = Math.min(start.row, end.row)
  const maxR = Math.max(start.row, end.row)
  const radius = Math.floor(Math.min(maxC - minC + 1, maxR - minR + 1) / 2)
  const centerCol = Math.round((minC + maxC) / 2)
  const centerRow = Math.round((minR + maxR) / 2)
  return circleBrushTiles(centerCol, centerRow, radius)
}
```

- [ ] **Step 2: Update the grid import to include `rectTiles`**

Find this import line near the top of `src/App.tsx`:

```typescript
import { createGrid, getTile, paintTiles, resizeGrid, squareBrushTiles, circleBrushTiles } from './grid'
```

Replace with:

```typescript
import { createGrid, getTile, paintTiles, resizeGrid, rectTiles, circleBrushTiles } from './grid'
```

(`squareBrushTiles` is no longer used in App.tsx.)

- [ ] **Step 3: Remove `brushSize` state; add area-select state**

Find these lines inside `App()` (around line 74–75):

```typescript
  const [brushShape, setBrushShape] = useState<BrushShape>('square')
  const [brushSize, setBrushSize] = useState(0)
```

Replace with:

```typescript
  const [brushShape, setBrushShape] = useState<BrushShape>('square')
  const [areaPhase, setAreaPhase] = useState<'idle' | 'selecting'>('idle')
  const [areaStart, setAreaStart] = useState<Tile | null>(null)
  const [areaEnd, setAreaEnd] = useState<Tile | null>(null)
```

- [ ] **Step 4: Remove freehand refs; add area-select refs and brushShape ref**

Find these lines (around lines 84–93):

```typescript
  const hoverTileRef = useRef<Tile | null>(null)
  const roughPhaseRef = useRef<RoughPhase>('idle')
  const roughStartRef = useRef<Tile | null>(null)
  const roughEndRef = useRef<Tile | null>(null)
  const roughPreviewRef = useRef<TileFlip[]>([])
  const roughSeedRef = useRef<number>(0)
  const isPainting = useRef(false)
  const paintMode = useRef<typeof FLOOR | typeof WALL>(FLOOR)
  const pendingGrid = useRef<Uint8Array | null>(null)
  const preDragSnapshot = useRef<AppSnapshot | null>(null)
```

Replace with:

```typescript
  const hoverTileRef = useRef<Tile | null>(null)
  const roughPhaseRef = useRef<RoughPhase>('idle')
  const roughStartRef = useRef<Tile | null>(null)
  const roughEndRef = useRef<Tile | null>(null)
  const roughPreviewRef = useRef<TileFlip[]>([])
  const roughSeedRef = useRef<number>(0)
  const paintMode = useRef<typeof FLOOR | typeof WALL>(FLOOR)
  const areaPhaseRef = useRef<'idle' | 'selecting'>('idle')
  const areaStartRef = useRef<Tile | null>(null)
  const areaEndRef = useRef<Tile | null>(null)
  const brushShapeRef = useRef<BrushShape>('square')
```

- [ ] **Step 5: Keep brushShapeRef in sync with brushShape state**

Find the `setBrushShape` call in the Shape toggle onClick (around line 684):

```typescript
              onClick={() => { setBrushShape(s); setMode('paint') }}
```

Replace with:

```typescript
              onClick={() => { setBrushShape(s); brushShapeRef.current = s; setMode('paint') }}
```

- [ ] **Step 6: Delete the `paintAt` useCallback**

Find and delete the entire `paintAt` useCallback block (lines 164–170):

```typescript
  const paintAt = useCallback(
    (tile: Tile, base: Uint8Array): Uint8Array => {
      const tiles = getBrushTiles(tile.col, tile.row, brushSize, brushShape)
      return paintTiles(base, cols, tiles, paintMode.current)
    },
    [brushSize, brushShape, cols],
  )
```

Delete it entirely.

- [ ] **Step 7: Commit checkpoint**

```
git add src/App.tsx
git commit -m "refactor: replace freehand refs with area-select state in App"
```

(TypeScript will error until Task 3 finishes — that's expected.)

---

### Task 3: Rewrite mouse event handlers

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite `handleMouseDown`**

Find the entire `handleMouseDown` useCallback. Replace the paint-mode block (the `if (mode !== 'paint')` / stamp block and everything after through the end of the callback) with:

The full new `handleMouseDown`:

```typescript
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1) return
      const stage = e.target.getStage()!
      const tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      if (!tile) return

      if (mode === 'rough') {
        if (roughPhaseRef.current === 'idle') {
          setRoughStart(tile)
          roughStartRef.current = tile
          setRoughEnd(tile); roughEndRef.current = tile
          setRoughPhase('placed1')
          roughPhaseRef.current = 'placed1'
        } else if (roughPhaseRef.current === 'placed2' && roughStartRef.current && roughEndRef.current) {
          const start = roughStartRef.current
          const end = roughEndRef.current
          const minC = Math.min(start.col, end.col)
          const maxC = Math.max(start.col, end.col)
          const minR = Math.min(start.row, end.row)
          const maxR = Math.max(start.row, end.row)
          const captured = roughPreviewRef.current
          const savedBase = roughBaseGrid.current
          roughBaseGrid.current = null
          setHistory(h => {
            const originalGrid = savedBase ?? h.present.grid
            const rectTileList: Tile[] = []
            for (let r = minR; r <= maxR; r++)
              for (let c = minC; c <= maxC; c++)
                rectTileList.push({ col: c, row: r })
            let next = paintTiles(originalGrid, cols, rectTileList, FLOOR)
            if (captured.length > 0)
              next = paintTiles(next, cols, captured.map(f => ({ col: f.col, row: f.row })), WALL)
            const baseHistory = { ...h, present: { ...h.present, grid: originalGrid } }
            return push(baseHistory, { ...h.present, grid: next })
          })
          setRoughPhase('idle')
          roughPhaseRef.current = 'idle'
          setRoughStart(null)
          roughStartRef.current = null
          setRoughEnd(null); roughEndRef.current = null
          setRoughPreview([]); roughPreviewRef.current = []
        }
        return
      }

      if (mode !== 'paint') {
        const newStamp: Stamp = {
          id: crypto.randomUUID(),
          type: mode,
          col: tile.col,
          row: tile.row,
          rotation: 0,
        }
        setHistory(h => push(h, { ...h.present, stamps: addStamp(h.present.stamps, newStamp) }))
        setSelectedStampId(newStamp.id)
        return
      }

      // Area select start
      paintMode.current = e.evt.button === 2 ? WALL : FLOOR
      setAreaStart(tile); areaStartRef.current = tile
      setAreaEnd(tile); areaEndRef.current = tile
      setAreaPhase('selecting'); areaPhaseRef.current = 'selecting'
    },
    [mode, cols, rows],
  )
```

- [ ] **Step 2: Rewrite `handleMouseMove`**

Find the entire `handleMouseMove` useCallback. Replace the freehand paint section (the `if (!isPainting.current || !tile) return` block and the `setHistory` paint-on-move call) with area-end update.

The full new `handleMouseMove`:

```typescript
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage()!
      const tile = stageToTile(stage, e.evt.clientX, e.evt.clientY)
      setHoverTile(tile)
      hoverTileRef.current = tile

      if (roughPhaseRef.current === 'placed1' && roughStartRef.current && tile) {
        setRoughEnd(tile); roughEndRef.current = tile
        return
      }

      if (roughPhaseRef.current === 'placed2' && roughEndRef.current && roughStartRef.current) {
        const cursorX = e.evt.clientX
        const cursorY = e.evt.clientY
        const stageRect = stage.container().getBoundingClientRect()
        const scale = stage.scaleX()
        const ox = stage.x(); const oy = stage.y()
        const rEnd = roughEndRef.current!
        const rStart = roughStartRef.current!
        const endWorldX = rEnd.col * TILE_PX + TILE_PX / 2
        const endWorldY = rEnd.row * TILE_PX + TILE_PX / 2
        const endScreenX = endWorldX * scale + stageRect.left + ox
        const endScreenY = endWorldY * scale + stageRect.top + oy
        const dx = (cursorX - endScreenX) / scale
        const dy = (cursorY - endScreenY) / scale
        const distTiles = Math.sqrt(dx * dx + dy * dy) / TILE_PX
        const intensity = Math.min(1, distTiles / 10)
        const minC = Math.min(rStart.col, rEnd.col)
        const maxC = Math.max(rStart.col, rEnd.col)
        const minR = Math.min(rStart.row, rEnd.row)
        const maxR = Math.max(rStart.row, rEnd.row)
        const preview = applyTileLevelNoise({ minC, minR, maxC, maxR }, intensity, roughSeedRef.current)
        setRoughPreview(preview); roughPreviewRef.current = preview
        return
      }

      if (areaPhaseRef.current === 'selecting' && tile) {
        setAreaEnd(tile); areaEndRef.current = tile
      }
    },
    [cols, rows],
  )
```

- [ ] **Step 3: Rewrite `handleMouseUp`**

Find the entire `handleMouseUp` useCallback. Replace it with:

```typescript
  const handleMouseUp = useCallback(() => {
    if (roughPhaseRef.current === 'placed1' && roughStartRef.current) {
      const start = roughStartRef.current
      const end = hoverTileRef.current ?? start
      const minC = Math.min(start.col, end.col)
      const maxC = Math.max(start.col, end.col)
      const minR = Math.min(start.row, end.row)
      const maxR = Math.max(start.row, end.row)
      const rectTileList: Tile[] = []
      for (let r = minR; r <= maxR; r++)
        for (let c = minC; c <= maxC; c++)
          rectTileList.push({ col: c, row: r })
      const seed = Math.floor(Math.random() * 2 ** 32)
      roughSeedRef.current = seed
      setRoughSeed(seed)
      setRoughEnd(end)
      setRoughPhase('placed2')
      roughPhaseRef.current = 'placed2'
      setHistory(h => {
        if (roughBaseGrid.current === null) roughBaseGrid.current = h.present.grid
        const next = paintTiles(roughBaseGrid.current, cols, rectTileList, FLOOR)
        return { ...h, present: { ...h.present, grid: next } }
      })
      return
    }

    if (areaPhaseRef.current === 'selecting' && areaStartRef.current && areaEndRef.current) {
      const tiles = getAreaTiles(areaStartRef.current, areaEndRef.current, brushShapeRef.current)
      const tileValue = paintMode.current
      setHistory(h => push(h, { ...h.present, grid: paintTiles(h.present.grid, cols, tiles, tileValue) }))
      setAreaPhase('idle'); areaPhaseRef.current = 'idle'
      setAreaStart(null); areaStartRef.current = null
      setAreaEnd(null); areaEndRef.current = null
    }
  }, [cols])
```

- [ ] **Step 4: Run type-check to verify no TS errors**

```
npx tsc --noEmit
```

Expected: 0 errors. If there are errors they will be in App.tsx from the Tasks 4 still to do — check that they are only about `brushSize` in `handleSave`/`applyLoad` and the ghost tile computation. That's expected.

- [ ] **Step 5: Commit**

```
git add src/App.tsx
git commit -m "feat: rewrite mouse handlers for area-select gesture"
```

---

### Task 4: Update UI — ghost, escape, save/load, remove slider

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update ghost tile computation**

Find this block (around line 347):

```typescript
  const ghostTiles: Tile[] = hoverTile && mode === 'paint'
    ? getBrushTiles(hoverTile.col, hoverTile.row, brushSize, brushShape)
    : []
```

Replace with:

```typescript
  const ghostTiles: Tile[] = areaStart && areaEnd && areaPhase === 'selecting'
    ? getAreaTiles(areaStart, areaEnd, brushShape)
    : []
```

- [ ] **Step 2: Update Escape key handler to cancel area-select**

Find the `if (e.key === 'Escape')` block in the keyboard handler (around line 130). It currently only handles rough phase. Replace it with:

```typescript
      if (e.key === 'Escape') {
        setSelectedStampId(null)
        if (roughPhase !== 'idle') {
          setRoughPhase('idle')
          roughPhaseRef.current = 'idle'
          setRoughStart(null)
          roughStartRef.current = null
          setRoughEnd(null); roughEndRef.current = null
          setRoughPreview([]); roughPreviewRef.current = []
          if (roughBaseGrid.current !== null) {
            const savedGrid = roughBaseGrid.current
            roughBaseGrid.current = null
            setHistory(h => ({ ...h, present: { ...h.present, grid: savedGrid } }))
          }
        }
        if (areaPhaseRef.current === 'selecting') {
          setAreaPhase('idle'); areaPhaseRef.current = 'idle'
          setAreaStart(null); areaStartRef.current = null
          setAreaEnd(null); areaEndRef.current = null
        }
      }
```

- [ ] **Step 3: Update `handleSave` — remove `brushSize`**

Find in `handleSave` (around line 616):

```typescript
    const save = serialize({ grid, cols, rows, wallColor, wallOpacity, brushShape, brushSize, showGrid, stamps })
```

Replace with:

```typescript
    const save = serialize({ grid, cols, rows, wallColor, wallOpacity, brushShape, showGrid, stamps })
```

- [ ] **Step 4: Update `applyLoad` — remove `setBrushSize`**

Find in `applyLoad` (around line 633):

```typescript
      setBrushShape(save.brushShape)
      setBrushSize(save.brushSize)
```

Replace with:

```typescript
      setBrushShape(save.brushShape)
      brushShapeRef.current = save.brushShape
```

- [ ] **Step 5: Remove brush size slider from toolbar**

Find the brush size slider block in the JSX (around lines 698–705):

```typescript
        {/* Brush size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ width: 72 }}>Size {sizeLabel}</label>
          <input
            type="range" min={0} max={6} step={1} value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
```

Delete the entire block.

- [ ] **Step 6: Remove `sizeLabel` computation**

Find these lines (around line 655):

```typescript
  const sizeLabel = brushShape === 'circle'
    ? `r=${brushSize}`
    : `${brushSize * 2 + 1}×${brushSize * 2 + 1}`
```

Delete them.

- [ ] **Step 7: Run type-check**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Run all tests**

```
npx vitest run
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```
git add src/App.tsx
git commit -m "feat: area-select UI — ghost preview, escape cancel, remove brush size slider"
```

---

### Task 5: Manual smoke test

**Files:** none

- [ ] **Step 1: Start dev server**

```
npm run dev
```

- [ ] **Step 2: Test square area selector**
  - Click Square button in toolbar
  - Left-click and drag a rectangle on the canvas
  - Release — the dragged area should fill with floor tiles (cream color)
  - Verify the yellow ghost preview shows the exact rect during drag

- [ ] **Step 3: Test circle area selector**
  - Click Circle button in toolbar
  - Drag a bounding box on the canvas
  - Release — a circle inscribed in the bounding box should appear as floor tiles
  - Verify ghost shows the inscribed circle during drag

- [ ] **Step 4: Test right-click erase**
  - Right-click drag over an existing floor area
  - Release — selected area should revert to wall (solid color)

- [ ] **Step 5: Test undo**
  - Place a floor area
  - Ctrl+Z — area should disappear in a single undo step

- [ ] **Step 6: Test Escape cancel**
  - Start a drag, press Escape before releasing
  - No tiles should be committed

- [ ] **Step 7: Test Rough (cave) mode still works**
  - Click Rough (cave) button
  - Drag to set rect, release, move mouse for noise, click to commit
  - Verify cave walls appear correctly

- [ ] **Step 8: Test save/load round-trip**
  - Place some tiles, click Save
  - Reload page, click Load, select the saved file
  - Map should restore without errors

- [ ] **Step 9: Final commit if any fixes were needed**

```
git add -p
git commit -m "fix: <describe any fixes from smoke test>"
```
