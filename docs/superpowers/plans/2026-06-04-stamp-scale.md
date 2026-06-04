# Stamp Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a uniform scale multiplier (0.5×–4×) to each stamp, controllable via a sidebar slider when a stamp is selected, persisted in the save file, and applied in both the live canvas and PNG export.

**Architecture:** `scale?: number` is added to the `Stamp` interface (absent = 1). A `scaleStamp` pure function joins the other stamp mutators. Rendering in `App.tsx` and `exportShapes.ts` multiplies rendered dimensions by `stamp.scale ?? 1`, and `deserialize` reads the optional field with a safe default.

**Tech Stack:** TypeScript, React, Konva/react-konva, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/stamps.ts` | Add `scale?: number` to `Stamp`; add `scaleStamp()` |
| `src/stamps.test.ts` | Tests for `scaleStamp` |
| `src/serialization.ts` | Read/write `scale` in `serialize`/`deserialize` |
| `src/serialization.test.ts` | Tests for round-trip and missing-field default |
| `src/exportShapes.ts` | Apply scale to `w`/`h` in top-down and iso stamp shapes |
| `src/exportShapes.test.ts` | Tests for scaled stamp export shapes |
| `src/App.tsx` | Apply scale in canvas render; add slider to sidebar |

---

## Task 1: Add `scale` field and `scaleStamp` to stamps.ts

**Files:**
- Modify: `src/stamps.ts`
- Modify: `src/stamps.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/stamps.test.ts`, add after the `moveStamp` describe block:

```typescript
describe('scaleStamp', () => {
  it('sets scale on the target stamp', () => {
    const list = [stamp({ id: 'a' })]
    const result = scaleStamp(list, 'a', 2)
    expect(result[0].scale).toBe(2)
  })

  it('leaves other stamps unchanged', () => {
    const list = [stamp({ id: 'a' }), stamp({ id: 'b' })]
    const result = scaleStamp(list, 'a', 2)
    expect(result[1].scale).toBeUndefined()
  })

  it('is a no-op for unknown id', () => {
    const list = [stamp({ id: 'a' })]
    expect(scaleStamp(list, 'z', 2)).toEqual(list)
  })

  it('does not mutate the original array', () => {
    const list = [stamp({ id: 'a' })]
    scaleStamp(list, 'a', 2)
    expect(list[0].scale).toBeUndefined()
  })
})
```

Also update the import at line 2 of `src/stamps.test.ts` to include `scaleStamp`:

```typescript
import { addStamp, isFloorStamp, isObjectStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize, type Stamp } from './stamps'
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/stamps.test.ts
```

Expected: FAIL — `scaleStamp is not exported`

- [ ] **Step 3: Add `scale` to `Stamp` and implement `scaleStamp`**

In `src/stamps.ts`, update the `Stamp` interface:

```typescript
export interface Stamp {
  id: string
  type: StampType | ObjectStampType
  col: number
  row: number
  rotation: Rotation
  scale?: number
}
```

Add `scaleStamp` after `moveStamp`:

```typescript
export function scaleStamp(stamps: Stamp[], id: string, scale: number): Stamp[] {
  return stamps.map(s => s.id === id ? { ...s, scale } : s)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/stamps.test.ts
```

Expected: PASS (all tests including the new `scaleStamp` block)

- [ ] **Step 5: Commit**

```
git add src/stamps.ts src/stamps.test.ts
git commit -m "feat: add scale field to Stamp and scaleStamp function"
```

---

## Task 2: Serialization — persist `scale`

**Files:**
- Modify: `src/serialization.ts`
- Modify: `src/serialization.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/serialization.test.ts` after the existing `round-trips object stamp` test:

```typescript
describe('scale field', () => {
  it('serialize omits scale when it equals 1', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: 1 }
    const save = serialize({ ...BASE, stamps: [scaledStamp] })
    expect(save.stamps[0]).not.toHaveProperty('scale')
  })

  it('serialize includes scale when not 1', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: 2.5 }
    const save = serialize({ ...BASE, stamps: [scaledStamp] })
    expect(save.stamps[0].scale).toBe(2.5)
  })

  it('deserialize defaults scale to 1 when field is missing', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0 }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })

  it('deserialize round-trips scale: 2', () => {
    const scaledStamp: Stamp = { id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: 2 }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [scaledStamp] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].scale).toBe(2)
  })

  it('deserialize ignores invalid scale (non-finite) and omits it', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: Infinity }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })

  it('deserialize ignores invalid scale (zero) and omits it', () => {
    const raw = { ...serialize(BASE), stamps: [{ id: 'abc', type: 'door', col: 1, row: 2, rotation: 0, scale: 0 }] }
    const restored = deserialize(raw)
    expect(restored.stamps[0].scale).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/serialization.test.ts
```

Expected: FAIL on the new scale tests

- [ ] **Step 3: Update serialize to omit scale when 1**

In `src/serialization.ts`, the `serialize` function's stamp mapping currently passes stamps through as-is. Update it so `scale` is omitted when equal to `1`:

```typescript
export function serialize(params: {
  grid: Uint8Array
  cols: number
  rows: number
  wallColor: string
  wallOpacity: number
  brushShape: 'square' | 'circle'
  showGrid: boolean
  show3D: boolean
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
    show3D: params.show3D,
    stamps: params.stamps.map(s => {
      if (s.scale === undefined || s.scale === 1) {
        const { scale: _, ...rest } = s
        return rest as Stamp
      }
      return s
    }),
  }
}
```

- [ ] **Step 4: Update deserialize to read optional scale**

In `src/serialization.ts`, update the stamp deserialization inside `deserialize`. Replace the return statement of the stamp map callback:

```typescript
const stamps: Stamp[] = rawStamps.map((entry: unknown): Stamp => {
  if (typeof entry !== 'object' || entry === null) throw new Error('Invalid stamp entry')
  const o = entry as Record<string, unknown>
  if (typeof o['id'] !== 'string') throw new Error('Invalid stamp id')
  const allTypes = [...STAMP_TYPES, ...OBJECT_STAMP_TYPES]
  if (!allTypes.includes(o['type'] as StampType | ObjectStampType)) throw new Error('Invalid stamp type')
  if (typeof o['col'] !== 'number') throw new Error('Invalid stamp col')
  if (typeof o['row'] !== 'number') throw new Error('Invalid stamp row')
  if (![0, 90, 180, 270].includes(o['rotation'] as number)) throw new Error('Invalid stamp rotation')

  const rawScale = o['scale']
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
    ? rawScale
    : undefined

  const stamp: Stamp = {
    id: o['id'] as string,
    type: o['type'] as StampType | ObjectStampType,
    col: o['col'] as number,
    row: o['row'] as number,
    rotation: o['rotation'] as Rotation,
  }
  if (scale !== undefined && scale !== 1) stamp.scale = scale
  return stamp
})
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run src/serialization.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```
git add src/serialization.ts src/serialization.test.ts
git commit -m "feat: persist stamp scale in save file"
```

---

## Task 3: Apply scale in exportShapes.ts

**Files:**
- Modify: `src/exportShapes.ts`
- Modify: `src/exportShapes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/exportShapes.test.ts` (find an appropriate place after the existing stamp tests):

```typescript
describe('buildExportShapes – stamp scale', () => {
  it('top-down: a floor stamp at scale 2 doubles its rendered w and h', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const, scale: 2 }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image')
    expect(img).toBeDefined()
    expect(img!.kind).toBe('image')
    if (img!.kind === 'image') {
      expect(img.w).toBe(ET * 2)
      expect(img.h).toBe(ET * 2)
    }
  })

  it('top-down: a floor stamp at scale 0.5 halves its rendered w and h', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const, scale: 0.5 }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image')
    if (img!.kind === 'image') {
      expect(img.w).toBe(ET * 0.5)
      expect(img.h).toBe(ET * 0.5)
    }
  })

  it('top-down: a floor stamp with no scale uses default size', () => {
    const grid = paintTiles(createGrid(4, 4), 4, [{ col: 1, row: 1 }], FLOOR)
    const stamp = { id: 's1', type: 'door' as const, col: 1, row: 1, rotation: 0 as const }
    const { shapes } = buildExportShapes({ ...baseParams(4, 4, grid), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image')
    if (img!.kind === 'image') {
      expect(img.w).toBe(ET)
      expect(img.h).toBe(ET)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/exportShapes.test.ts
```

Expected: FAIL — scaled stamps have the same size as unscaled

- [ ] **Step 3: Apply scale in buildTopDownShapes**

In `src/exportShapes.ts`, find the top-down stamp loop (around line 116) and update it:

```typescript
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
  })
}
```

- [ ] **Step 4: Apply scale in buildIsoShapes**

In `src/exportShapes.ts`, find the iso stamp loop (around line 199) and update it:

```typescript
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
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      skewX: t.skewX,
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run src/exportShapes.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```
git add src/exportShapes.ts src/exportShapes.test.ts
git commit -m "feat: apply stamp scale in export shapes"
```

---

## Task 4: Apply scale in App.tsx canvas render + sidebar slider

**Files:**
- Modify: `src/App.tsx`

This task has no unit tests (Konva canvas rendering isn't unit-tested in this codebase). Manual verification is the test.

- [ ] **Step 1: Import `scaleStamp` at the top of App.tsx**

Update the import from `./stamps` (around line 10):

```typescript
import {
  addStamp, isObjectStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
```

- [ ] **Step 2: Apply scale in the stamp canvas render (non-iso path)**

Find the non-iso stamp rendering block inside the stamp layer `useEffect` (around line 601). Replace the section that computes `x`, `y`, `w`, `h` and creates the `Konva.Image` node:

```typescript
const sc = stamp.scale ?? 1
const effectiveW = w * sc
const effectiveH = h * sc
const x = stamp.col * TILE_PX + w / 2
const y = stamp.row * TILE_PX + h / 2
const isGhost = isObjectStamp(stamp)
const node = new Konva.Image({
  image: imgEl,
  x, y,
  width: effectiveW, height: effectiveH,
  offsetX: effectiveW / 2, offsetY: effectiveH / 2,
  rotation: stamp.rotation,
  draggable: !isGhost,
  opacity: isGhost ? 0.25 : 1,
})
```

Also update the dragend handler to use `effectiveW`/`effectiveH` for snap calculation:

```typescript
node.on('dragend', () => {
  const snappedCol = Math.max(0, Math.min(cols - sz.cols, Math.round((node.x() - effectiveW / 2) / TILE_PX)))
  const snappedRow = Math.max(0, Math.min(rows - sz.rows, Math.round((node.y() - effectiveH / 2) / TILE_PX)))
  setHistory(h => push(h, { ...h.present, stamps: moveStamp(h.present.stamps, stamp.id, snappedCol, snappedRow) }))
})
```

Update the selection highlight rect to use `effectiveW`/`effectiveH`:

```typescript
if (!isGhost && stamp.id === selectedStampId) {
  layer.add(new Konva.Rect({
    x,
    y,
    width: effectiveW + 2,
    height: effectiveH + 2,
    offsetX: (effectiveW + 2) / 2,
    offsetY: (effectiveH + 2) / 2,
    rotation: stamp.rotation,
    stroke: '#ffff00',
    strokeWidth: 2,
    fill: 'transparent',
    listening: false,
  }))
}
```

- [ ] **Step 3: Apply scale in the iso stamp render (object stamps)**

In the iso branch of the stamp layer `useEffect`, find the `isObjectStamp` block (around line 541). Update it to apply scale:

```typescript
if (isObjectStamp(stamp)) {
  const sc = stamp.scale ?? 1
  const bw = sz.cols * TILE_PX * 2 * sc
  const billboardH = imgEl.naturalWidth > 0 ? Math.round(bw * imgEl.naturalHeight / imgEl.naturalWidth) : h * sc
  const pivotX = isoCenter.x
  const pivotY = isoBottom.y - billboardH / 2
  const imgNode = new Konva.Image({
    image: imgEl,
    x: pivotX, y: pivotY,
    width: bw, height: billboardH,
    offsetX: bw / 2, offsetY: billboardH / 2,
    rotation: stamp.rotation,
  })
  // ... event handlers unchanged ...
  layer.add(imgNode)
  if (stamp.id === selectedStampId) {
    layer.add(new Konva.Rect({
      x: pivotX, y: pivotY,
      width: bw + 2, height: billboardH + 2,
      offsetX: (bw + 2) / 2, offsetY: (billboardH + 2) / 2,
      rotation: stamp.rotation,
      stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
    }))
  }
}
```

- [ ] **Step 4: Apply scale in the iso stamp render (floor stamps)**

In the iso branch, find the `else` block for floor stamps (the `isoStampTransform` path, around line 571). Update `w` and `h` to use effective dimensions:

```typescript
} else {
  const sc = stamp.scale ?? 1
  const effectiveW = w * sc
  const effectiveH = h * sc
  const t = isoStampTransform(stamp.rotation)
  const group = new Konva.Group({
    x: isoCenter.x, y: isoCenter.y,
    rotation: t.rotation,
    scaleX: t.scaleX, scaleY: t.scaleY,
    skewX: t.skewX,
  })
  group.add(new Konva.Image({ image: imgEl, x: -effectiveW / 2, y: -effectiveH / 2, width: effectiveW, height: effectiveH }))
  // ... event handlers unchanged ...
  if (stamp.id === selectedStampId) {
    group.add(new Konva.Rect({
      x: -effectiveW / 2 - 1, y: -effectiveH / 2 - 1,
      width: effectiveW + 2, height: effectiveH + 2,
      stroke: '#ffff00', strokeWidth: 2, fill: 'transparent', listening: false,
    }))
  }
  layer.add(group)
}
```

- [ ] **Step 5: Add the scale slider to the sidebar**

Find the `selectedStampId` sidebar block (around line 933) that renders the Rotate button and hint text. Add the scale slider inside the flex column div, below the Rotate button and above the hint text:

```tsx
{selectedStampId && (() => {
  const sel = stamps.find(s => s.id === selectedStampId)
  const currentScale = sel?.scale ?? 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={() => setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, selectedStampId) }))}
        style={{
          padding: '4px 0', fontSize: 11, cursor: 'pointer',
          background: 'transparent', color: '#eee',
          border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
        }}
      >
        ↻ Rotate
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ width: 36, color: '#aaa', fontSize: 11 }}>Scale</label>
        <input
          type="range" min={0.5} max={4} step={0.25} value={currentScale}
          onChange={e => {
            const v = Number(e.target.value)
            setHistory(h => push(h, { ...h.present, stamps: scaleStamp(h.present.stamps, selectedStampId, v) }))
          }}
          style={{ flex: 1 }}
        />
        <span style={{ color: '#aaa', fontSize: 11, width: 28, textAlign: 'right' }}>{currentScale}×</span>
      </div>
      <div style={{ fontSize: 11, color: '#aaa' }}>
        R: rotate · Del: delete · Esc: deselect
      </div>
    </div>
  )
})()}
```

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Start the dev server and manually verify**

```
npm run dev
```

Manual checklist:
- Place a floor stamp (e.g. door), select it → scale slider appears at 1×
- Drag slider to 2× → stamp doubles in size on canvas
- Drag slider to 0.5× → stamp halves in size
- Rotate still works with scaled stamp
- Delete still works
- Undo (Ctrl+Z) reverts scale change
- Switch to Iso view → scaled stamps render larger/smaller correctly
- Place an object stamp (iso mode), scale it → billboard scales
- Save to JSON → reload → scale is preserved
- Export PNG → scaled stamp appears at correct size

- [ ] **Step 8: Commit**

```
git add src/App.tsx
git commit -m "feat: apply stamp scale in canvas render and add scale slider"
```
