# Stamp Scale Feature Design

Date: 2026-06-04

## Summary

Add a uniform scale multiplier to iso stamps, controllable via a sidebar slider when a stamp is selected. Scale is persisted in the save file and affects both rendering and drag-snap behavior.

## Data Model

`Stamp` interface gains an optional `scale?: number` field (absent = `1`). A new pure function `scaleStamp(stamps, id, scale)` is added to `stamps.ts` alongside `rotateStamp` and `moveStamp`.

`stampSize()` remains unchanged — scale is applied at render time, not baked into tile dimensions.

## Rendering (App.tsx)

For every stamp, compute:

```
effectiveW = w * (stamp.scale ?? 1)
effectiveH = h * (stamp.scale ?? 1)
```

The stamp is centered on the same anchor point as today. Object stamps (iso billboard) scale width and height the same way. The selection highlight rect scales with the stamp.

Drag-snap on `dragend` uses `effectiveW`/`effectiveH` for offset math but still rounds to tile boundaries.

Both the live canvas render and the export path (`exportShapes.ts`) apply scale.

## UI

When a stamp is selected, a scale slider appears below the Rotate button in the sidebar:

- Range: 0.5–4, step 0.25
- Label: "Scale" with current value shown as e.g. `1×`
- Changing the slider dispatches `scaleStamp` into history (undoable)
- Default display is `1×` for stamps without a `scale` field

## Serialization

- `Stamp` interface already includes the optional `scale?: number` — no version bump required
- `serialize`: writes `scale` only when not equal to `1`, keeping existing saves clean
- `deserialize`: reads `scale` as an optional number; if missing or non-finite/non-positive, defaults to `1`

## What Is Not In Scope

- Non-uniform (independent X/Y) scaling
- Keyboard shortcuts for scale
- Scale affecting tile occupancy beyond visual sizing
