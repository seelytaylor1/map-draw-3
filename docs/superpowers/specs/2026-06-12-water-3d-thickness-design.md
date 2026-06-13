# Water 3D Thickness

**Date:** 2026-06-12

## Problem

Water tiles in the 3D view render as a flat surface (shifted 4px lower than floor tiles) with no side faces. Regular floor tiles show 8px-tall south and east faces, giving them visible thickness. Water looks flat by comparison.

## Goal

Water tiles should show south and east side faces in 3D mode, making them visually as thick as floor tiles while accounting for the fact that the water surface sits lower.

## Design

### Constants

Add `WATER_OFFSET_Y = 4` to `constants.ts`. This value is currently a magic default (`offsetY = 4`) in `isoWaterPoints` in `iso.ts`.

### Face height

- Regular floor face height: `FACE_PX` (8px), extending below the floor diamond bottom edge
- Water surface is `WATER_OFFSET_Y` (4px) below the floor diamond
- Water face must start at the water surface bottom edge and reach the same visual bottom as a floor face
- Water face height = `FACE_PX - WATER_OFFSET_Y` = 4px

### Exposure logic

Water faces show when a south or east neighbor is `WALL` or out of bounds — the same boundary condition used for floor tiles. No face is needed when the neighbor is `FLOOR` (the floor tile's own face covers that edge exactly) or another `WATER` tile (same level, no exposed edge).

### Shape construction

Reuse existing `isoFrontFacePoints` and `isoEastFacePoints` with height `FACE_PX - WATER_OFFSET_Y`, then shift the resulting points down by `WATER_OFFSET_Y` to align with the water surface. Fill color = `WATER_COLOR`.

### File changes

| File | Change |
|------|--------|
| `src/constants.ts` | Export `WATER_OFFSET_Y = 4` |
| `src/iso.ts` | Import and use `WATER_OFFSET_Y` in `isoWaterPoints` default parameter |
| `src/isoScene.ts` | Add face shapes to water tiles when `show3D` and south/east neighbor is exposed |

## Out of scope

- Export shapes (`exportShapes.ts`) — water face thickness in SVG export is a separate concern
- Water face color customization — face uses `WATER_COLOR` (same blue as surface)
