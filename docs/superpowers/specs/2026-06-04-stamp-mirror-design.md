# Stamp Horizontal Mirror — Design Spec

**Date:** 2026-06-04

## Overview

Add a horizontal flip (left-right mirror) to stamps. Mirroring is independent of rotation and scale and applies in all three render paths: flat 2D, iso floor, and iso billboard.

## Data Model

- Add `mirrored?: boolean` to the `Stamp` interface in `stamps.ts`. Absence or `false` means not mirrored.
- Add `mirrorStamp(stamps: Stamp[], id: string): Stamp[]` to `stamps.ts` — toggles `mirrored` on the matching stamp, mirroring `rotateStamp`'s pattern.
- No serialization changes needed; the field round-trips naturally through JSON save/load.

## Rendering

### Flat mode (`Konva.Image`)
Apply `scaleX: -1` to the image node. The node is positioned at the tile center with `offsetX = effectiveW / 2`, so the flip is around the center with no additional offset math.

### Iso floor stamps (`Konva.Group`)
`isoStampTransform` returns `scaleX: ISO_SX` (~1.118). When `stamp.mirrored` is true, use `scaleX: -ISO_SX`. The group is already centered at the iso tile center, so the flip axis is correct.

### Iso billboard stamps (`Konva.Image`)
Apply `scaleX: -1`. The node is centered via `offsetX = bw / 2`, same reasoning as flat mode.

### Export (`exportShapes.ts`)
Thread a `mirrored?: boolean` field through the image shape type in `buildExportShapes`. The export render path in `App.tsx` reads this field and applies `scaleX: -1` (or `-scaleX` for iso floor groups) to match the canvas render.

## UI & Interaction

- Add a **"⇔ Mirror"** button in the selected-stamp controls in `App.tsx`, styled identically to the existing "↻ Rotate" button.
- Add `E`/`e` key handling in the existing `keydown` handler: when `selectedStampId` is set, dispatch `mirrorStamp`.
- The button is a momentary action (no active/toggled visual state), consistent with Rotate.

## Out of Scope

- No vertical flip.
- No mirror indicator in the stamp list or tooltip.
- Mirror does not affect tile placement or collision.
