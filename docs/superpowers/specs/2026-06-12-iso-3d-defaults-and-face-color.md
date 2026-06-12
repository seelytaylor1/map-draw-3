# Iso 3D Defaults and Face Color Control

**Date:** 2026-06-12

## Summary

Two related changes to the 3D rendering feature:

1. **3D auto-couples to iso view** — 3D faces are always on in iso mode and always off in top-down. The manual ◫ 3D toggle is removed.
2. **User-controlled face color** — A single base color picker replaces the hardcoded `ISO_FRONT_FACE_COLOR` / `ISO_EAST_FACE_COLOR` constants. The app derives two shades (darker front, lighter east) from the chosen base color.

## Section 1 — View/3D Coupling

`show3D` state remains in App.tsx but is driven by a `useEffect`:

```ts
useEffect(() => { setShow3D(showIso) }, [showIso])
```

The ◫ 3D button is removed from the Settings toolbar row. The row becomes just `# Grid` and `⬡ Iso`. The note under the Iso button already says "Preview only — drawing disabled"; it can optionally note that 3D is active.

`show3D` continues to flow into `buildIsoScene` and `buildExportShapes` unchanged — it will always be `true` when `showIso` is true, and always `false` otherwise.

## Section 2 — Face Color State and Derivation

**New state:**
```ts
const [isoFaceColor, setIsoFaceColor] = useState('#6a5040')
```

**Color derivation utility** (in App.tsx or a small helper):
```ts
function deriveFaceColors(baseHex: string): { front: string; east: string } {
  const r = parseInt(baseHex.slice(1, 3), 16)
  const g = parseInt(baseHex.slice(3, 5), 16)
  const b = parseInt(baseHex.slice(5, 7), 16)
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return {
    front: `#${toHex(r * 0.85)}${toHex(g * 0.85)}${toHex(b * 0.85)}`,
    east:  `#${toHex(r * 1.15)}${toHex(g * 1.15)}${toHex(b * 1.15)}`,
  }
}
```

Derived at render time: `const { front: frontFaceColor, east: eastFaceColor } = deriveFaceColors(isoFaceColor)`

**isoScene.ts interface change:** `IsoSceneParams` gains `frontFaceColor: string` and `eastFaceColor: string`. The imported `ISO_FRONT_FACE_COLOR` / `ISO_EAST_FACE_COLOR` constants are replaced by these params throughout `buildIsoScene`.

**exportShapes.ts interface change:** `buildIsoExport` (and by extension `buildExportShapes`) gains `frontFaceColor` and `eastFaceColor`. `BuildExportParams` is updated accordingly.

**Constants cleanup:** `ISO_FRONT_FACE_COLOR` and `ISO_EAST_FACE_COLOR` are removed from `constants.ts` (replaced by runtime derivation). `FACE_COLOR` stays in `constants.ts` — it is still referenced by the top-down step/ramp face rect code paths in App.tsx (those `if (show3D)` blocks remain in place even though they are unreachable now; removing them is out of scope).

**Serialization:** `MapSave` and `DeserializedMap` gain `isoFaceColor?: string`. `serialize` includes it. `deserialize` reads it with a fallback: `isoFaceColor: typeof s['isoFaceColor'] === 'string' ? s['isoFaceColor'] : '#6a5040'`. `applyLoad` calls `setIsoFaceColor(save.isoFaceColor ?? '#6a5040')`. `handleSave` passes `isoFaceColor`.

## Section 3 — Toolbar UI

The Settings row currently has three buttons: `# Grid`, `◫ 3D`, `⬡ Iso`. After this change it has two: `# Grid` and `⬡ Iso`.

When `showIso` is true, a face color row is added below the existing wall color row:

```
Face  [color swatch]  #6a5040
```

Same layout as the Wall color row — a short label, `<input type="color">`, hex string. The row is rendered conditionally: `{showIso && <div>…face color input…</div>}`.

## Test Impact

Existing tests that assert specific `ISO_FRONT_FACE_COLOR` / `ISO_EAST_FACE_COLOR` values in `exportShapes.test.ts` and `isoScene.test.ts` need to be updated to pass explicit face color params (or derive them from a test base color and assert the derived values).

The `serialization.test.ts` base fixture has `show3D: false` — this remains valid since the state still exists; it just gets overwritten by the `useEffect` at runtime.
