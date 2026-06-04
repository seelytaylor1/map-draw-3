# Stamp Horizontal Mirror — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-right (horizontal) flip to stamps, toggled with `E` key or a Mirror button, persisted in save files, applied across all three render paths (flat, iso floor, iso billboard) and the PNG export.

**Architecture:** Add `mirrored?: boolean` to the `Stamp` type and a `mirrorStamp` toggle function. Thread it through serialization, then apply `scaleX: -1` (or `-ISO_SX`) in each of the three Konva render paths and the matching export shapes path.

**Tech Stack:** TypeScript, React, Konva / react-konva, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/stamps.ts` | Add `mirrored?: boolean` to `Stamp`; add `mirrorStamp` |
| `src/stamps.test.ts` | Tests for `mirrorStamp` |
| `src/serialization.ts` | Persist/restore `mirrored` |
| `src/serialization.test.ts` | Round-trip tests for `mirrored` |
| `src/exportShapes.ts` | Add `mirrored?: boolean` to `ImageSpec`; pass through in both build paths |
| `src/exportShapes.test.ts` | Test that mirrored stamp produces negated scaleX |
| `src/App.tsx` | Three canvas render paths + export render path + E key + Mirror button |

---

## Task 1 — Data model: `mirrored` field and `mirrorStamp`

**Files:**
- Modify: `src/stamps.ts`
- Modify: `src/stamps.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/stamps.test.ts` (after the existing `scaleStamp` describe block):

```ts
describe('mirrorStamp', () => {
  it('sets mirrored to true on an un-mirrored stamp', () => {
    const list = [stamp({ id: 'a' })]
    const result = mirrorStamp(list, 'a')
    expect(result[0].mirrored).toBe(true)
  })

  it('toggles mirrored back to false when already true', () => {
    const list = [stamp({ id: 'a', mirrored: true })]
    const result = mirrorStamp(list, 'a')
    expect(result[0].mirrored).toBe(false)
  })

  it('leaves other stamps unchanged', () => {
    const list = [stamp({ id: 'a' }), stamp({ id: 'b' })]
    const result = mirrorStamp(list, 'a')
    expect(result[1].mirrored).toBeUndefined()
  })

  it('is a no-op for unknown id', () => {
    const list = [stamp({ id: 'a' })]
    expect(mirrorStamp(list, 'z')).toEqual(list)
  })

  it('does not mutate the original array', () => {
    const list = [stamp({ id: 'a' })]
    mirrorStamp(list, 'a')
    expect(list[0].mirrored).toBeUndefined()
  })
})
```

Also update the import at the top of `src/stamps.test.ts` to include `mirrorStamp`:

```ts
import { addStamp, isFloorStamp, isObjectStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize, type Stamp } from './stamps'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stamps.test.ts`

Expected: FAIL — `mirrorStamp is not a function` (or similar import error)

- [ ] **Step 3: Add `mirrored` to the `Stamp` interface and implement `mirrorStamp`**

In `src/stamps.ts`, update the `Stamp` interface:

```ts
export interface Stamp {
  id: string
  type: StampType | ObjectStampType
  col: number
  row: number
  rotation: Rotation
  scale?: number
  mirrored?: boolean
}
```

Add `mirrorStamp` after `scaleStamp`:

```ts
export function mirrorStamp(stamps: Stamp[], id: string): Stamp[] {
  return stamps.map(s => s.id === id ? { ...s, mirrored: !s.mirrored } : s)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stamps.test.ts`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/stamps.ts src/stamps.test.ts
git commit -m "feat: add mirrored field and mirrorStamp to stamps"
```

---

## Task 2 — Serialization: persist and restore `mirrored`

**Files:**
- Modify: `src/serialization.ts`
- Modify: `src/serialization.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/serialization.test.ts` (after the existing tests, inside the `deserialize` describe or as a new describe block):

```ts
describe('stamp mirrored field', () => {
  it('serialize strips mirrored when false', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, mirrored: false }
    const save = serialize({ ...BASE, stamps: [s] })
    expect(save.stamps[0]).not.toHaveProperty('mirrored')
  })

  it('serialize preserves mirrored: true', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, mirrored: true }
    const save = serialize({ ...BASE, stamps: [s] })
    expect(save.stamps[0].mirrored).toBe(true)
  })

  it('deserialize round-trips mirrored: true', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0, mirrored: true }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [s] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].mirrored).toBe(true)
  })

  it('deserialize treats missing mirrored as undefined', () => {
    const s: Stamp = { id: 'x', type: 'door', col: 0, row: 0, rotation: 0 }
    const json = JSON.stringify(serialize({ ...BASE, stamps: [s] }))
    const restored = deserialize(JSON.parse(json))
    expect(restored.stamps[0].mirrored).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/serialization.test.ts`

Expected: the new tests FAIL (mirrored not yet handled in serialize/deserialize)

- [ ] **Step 3: Update `serialize` to strip `mirrored` when falsy**

In `src/serialization.ts`, replace the `stamps` map in `serialize`:

```ts
stamps: params.stamps.map(s => {
  const { scale, mirrored, ...rest } = s
  const out: Partial<Stamp> = { ...rest }
  if (scale !== undefined && scale !== 1) out.scale = scale
  if (mirrored) out.mirrored = mirrored
  return out as Stamp
}),
```

- [ ] **Step 4: Update `deserialize` to restore `mirrored`**

In `src/serialization.ts`, inside the `rawStamps.map` callback, after the `scale` block:

```ts
const stamp: Stamp = {
  id: o['id'] as string,
  type: o['type'] as StampType | ObjectStampType,
  col: o['col'] as number,
  row: o['row'] as number,
  rotation: o['rotation'] as Rotation,
}
if (scale !== undefined && scale !== 1) stamp.scale = scale
if (o['mirrored'] === true) stamp.mirrored = true
return stamp
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/serialization.test.ts`

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/serialization.ts src/serialization.test.ts
git commit -m "feat: persist and restore stamp mirrored field"
```

---

## Task 3 — Export shapes: thread `mirrored` through `ImageSpec`

**Files:**
- Modify: `src/exportShapes.ts`
- Modify: `src/exportShapes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/exportShapes.test.ts` (after the existing stamp tests):

```ts
describe('buildExportShapes – stamp mirrored', () => {
  it('top-down mirrored stamp has mirrored: true in image spec', () => {
    const stamp: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0, mirrored: true }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec | undefined
    expect(img?.mirrored).toBe(true)
  })

  it('top-down un-mirrored stamp has mirrored falsy', () => {
    const stamp: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0 }
    const { shapes } = buildExportShapes({ ...baseParams(3, 3), stamps: [stamp] })
    const img = shapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec | undefined
    expect(img?.mirrored).toBeFalsy()
  })

  it('iso floor mirrored stamp has negated scaleX vs un-mirrored', () => {
    const base: Stamp = { id: 'a', type: 'door', col: 0, row: 0, rotation: 0 }
    const mirrored: Stamp = { ...base, mirrored: true }
    const normalShapes = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [base] }).shapes
    const mirroredShapes = buildExportShapes({ ...baseParams(3, 3), showIso: true, stamps: [mirrored] }).shapes
    const normalImg = normalShapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec
    const mirroredImg = mirroredShapes.find(s => s.kind === 'image') as import('./exportShapes').ImageSpec
    expect(mirroredImg.scaleX).toBe(-(normalImg.scaleX!))
  })
})
```

Also add `Stamp` to the import at the top of `src/exportShapes.test.ts`:

```ts
import { type Stamp } from './stamps'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/exportShapes.test.ts`

Expected: the new tests FAIL

- [ ] **Step 3: Add `mirrored` to `ImageSpec`**

In `src/exportShapes.ts`, update `ImageSpec`:

```ts
export type ImageSpec = {
  kind: 'image'
  stampType: string
  x: number; y: number; w: number; h: number
  offsetX: number; offsetY: number
  rotation: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  mirrored?: boolean
}
```

- [ ] **Step 4: Thread `mirrored` through `buildTopDownShapes`**

In `src/exportShapes.ts`, in `buildTopDownShapes`, update the stamp image push:

```ts
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
```

- [ ] **Step 5: Thread `mirrored` through `buildIsoShapes`**

In `src/exportShapes.ts`, in `buildIsoShapes`, update the two stamp image pushes:

For object stamps (billboard):
```ts
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
```

For floor stamps (iso projection): negate `scaleX` when mirrored:
```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/exportShapes.test.ts`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/exportShapes.ts src/exportShapes.test.ts
git commit -m "feat: thread stamp mirrored through export shapes"
```

---

## Task 4 — Canvas render: apply mirror in all three paths in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

There are three stamp rendering blocks inside the stamp layer `useEffect` (around line 529). No unit tests for rendering; verify visually after Task 6.

- [ ] **Step 1: Mirror iso billboard stamps (object stamps in iso)**

Find the `isObjectStamp(stamp)` block in the stamp layer `useEffect` (around line 542). The `imgNode` creation currently is:

```tsx
const imgNode = new Konva.Image({
  image: imgEl,
  x: pivotX, y: pivotY,
  width: bw, height: billboardH,
  offsetX: bw / 2, offsetY: billboardH / 2,
  rotation: stamp.rotation,
})
```

Replace with:

```tsx
const imgNode = new Konva.Image({
  image: imgEl,
  x: pivotX, y: pivotY,
  width: bw, height: billboardH,
  offsetX: bw / 2, offsetY: billboardH / 2,
  rotation: stamp.rotation,
  scaleX: stamp.mirrored ? -1 : 1,
})
```

- [ ] **Step 2: Mirror iso floor stamps**

Find the `Konva.Group` creation for non-object stamps in iso mode (around line 577):

```tsx
const group = new Konva.Group({
  x: isoCenter.x, y: isoCenter.y,
  rotation: t.rotation,
  scaleX: t.scaleX, scaleY: t.scaleY,
  skewX: t.skewX,
})
```

Replace `scaleX: t.scaleX` with:

```tsx
const group = new Konva.Group({
  x: isoCenter.x, y: isoCenter.y,
  rotation: t.rotation,
  scaleX: stamp.mirrored ? -t.scaleX : t.scaleX,
  scaleY: t.scaleY,
  skewX: t.skewX,
})
```

- [ ] **Step 3: Mirror flat mode stamps**

Find the `Konva.Image` creation in the flat (non-iso) branch (around line 611):

```tsx
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

Replace with:

```tsx
const node = new Konva.Image({
  image: imgEl,
  x, y,
  width: effectiveW, height: effectiveH,
  offsetX: effectiveW / 2, offsetY: effectiveH / 2,
  rotation: stamp.rotation,
  scaleX: stamp.mirrored ? -1 : 1,
  draggable: !isGhost,
  opacity: isGhost ? 0.25 : 1,
})
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: apply stamp mirrored in canvas render paths"
```

---

## Task 5 — Export render path: apply mirror + UI (E key + Mirror button)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the export render path for non-iso-floor stamps**

In `handleExport`, find the `else` branch inside the `shape.kind === 'image'` block (around line 791):

```tsx
} else {
  offLayer.add(new Konva.Image({
    image: imgEl,
    x: shape.x, y: shape.y,
    width: shape.w, height: shape.h,
    offsetX: shape.offsetX, offsetY: shape.offsetY,
    rotation: shape.rotation,
  }))
}
```

Replace with:

```tsx
} else {
  offLayer.add(new Konva.Image({
    image: imgEl,
    x: shape.x, y: shape.y,
    width: shape.w, height: shape.h,
    offsetX: shape.offsetX, offsetY: shape.offsetY,
    rotation: shape.rotation,
    scaleX: shape.mirrored ? -1 : 1,
  }))
}
```

(The iso floor branch uses the `if (shape.scaleX !== undefined)` path and reads `shape.scaleX` directly, which is already negated by `buildIsoShapes` when mirrored — no change needed there.)

- [ ] **Step 2: Add `mirrorStamp` to the import in `App.tsx`**

Update the import from `./stamps`:

```tsx
import {
  addStamp, isObjectStamp, mirrorStamp, moveStamp, removeStamp, rotateStamp, scaleStamp, stampSize,
  type Stamp,
} from './stamps'
```

- [ ] **Step 3: Add `E` key handler**

In the existing `keydown` handler (around line 122, after the `R` key block):

```tsx
if ((e.key === 'r' || e.key === 'R') && selectedStampId) {
  setHistory(h => push(h, { ...h.present, stamps: rotateStamp(h.present.stamps, selectedStampId) }))
  return
}
if ((e.key === 'e' || e.key === 'E') && selectedStampId) {
  setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, selectedStampId) }))
  return
}
```

- [ ] **Step 4: Add the Mirror button to selected-stamp controls**

Find the selected-stamp controls block in the JSX (around line 946, after the Rotate button):

```tsx
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
```

Add the Mirror button immediately after:

```tsx
<button
  onClick={() => setHistory(h => push(h, { ...h.present, stamps: mirrorStamp(h.present.stamps, selectedStampId) }))}
  style={{
    padding: '4px 0', fontSize: 11, cursor: 'pointer',
    background: 'transparent', color: '#eee',
    border: '2px solid rgba(255,255,255,0.2)', borderRadius: 4,
  }}
>
  ⇔ Mirror
</button>
```

- [ ] **Step 5: Update the keyboard shortcut hint**

Find the hint text line (around line 967):

```tsx
<div style={{ fontSize: 11, color: '#aaa' }}>
  R: rotate · Del: delete · Esc: deselect
</div>
```

Replace with:

```tsx
<div style={{ fontSize: 11, color: '#aaa' }}>
  R: rotate · E: mirror · Del: delete · Esc: deselect
</div>
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add stamp mirror — E key, Mirror button, export render"
```
