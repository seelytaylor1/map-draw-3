# Narrow Render Pipeline Unification

**Date:** 2026-06-12
**Status:** Approved

## Problem

`exportShapes.ts` (232 lines) reimplements the full rendering pipeline — floor/water tile logic, 3D face logic, step-tread geometry calls, stamp transform calls, iso vs. top-down branching — independently from `isoScene.ts` and App.tsx. A change to how a tile renders (new tile property, face color, water depth offset) requires finding and updating both `exportShapes.ts` and the live rendering path. Export can silently drift from what the user sees on screen.

## Scope

**Narrow:** `exportShapes.ts` routes through the same scene builders as live rendering. App.tsx's Konva wiring is untouched.

## Shared Parameter Groups

Both `buildIsoScene` and the new `buildTopDownShapes` accept the same three semantic objects:

```ts
type World = {
  grids: Map<number, Uint8Array>
  steps: StepRun[]
  ramps: RampRun[]
  cols: number
  rows: number
}

type RenderConfig = {
  show3D: boolean
  wallColor: string
  wallOpacity: number
  tileW: number
  tileH: number
}

type SelectionState = {
  stepId?: string
  rampId?: string
  activeZ: number
}
```

These types are defined once (in `topDownScene.ts` or a shared types file) and imported by both scene builders and `exportShapes.ts`.

## New Module: `src/topDownScene.ts`

Pure function:

```ts
export function buildTopDownShapes(
  world: World,
  config: RenderConfig,
  sel: SelectionState
): TopDownShape[]
```

### `TopDownShape` discriminated union

| Variant | Fields | Drawn as |
|---------|--------|----------|
| `floor` | col, row, z, opacity | filled rect |
| `water` | col, row, z, opacity | filled rect (water color) |
| `wall` | col, row, z, opacity | filled rect + dot pattern |
| `face` | col, row, z, side, opacity | thin rect along bottom/right edge |
| `stepTread` | rect, z, opacity | thin rectangle |
| `rampRect` | rect, z, opacity | filled rectangle |
| `stepFace` | rect, z, opacity | face band |
| `rampFace` | rect, z, opacity | face band |

All coordinate values are in tile units. Callers multiply by `tileW`/`tileH` to get pixel coordinates, allowing export (60px/tile) and live canvas (screen resolution) to use the same shapes at different scales.

### Responsibility

`buildTopDownShapes` handles:
- Z-level visibility and opacity fading (`activeZ` determines which levels render and at what opacity)
- 3D face derivation from floor boundaries (when `show3D`)
- Water tile detection and face adjacency (floor-next-to-water renders a stone bank face)
- Step Run tread rectangles and face bands
- Ramp Run rectangles and face bands

`buildTopDownShapes` does NOT handle stamps — stamps are rendered separately in both live canvas and export, consistent with their existing treatment.

## Updated `src/isoScene.ts`

`IsoSceneParams` is replaced with the same `World`, `RenderConfig`, `SelectionState` grouping:

```ts
export function buildIsoScene(
  world: World,
  config: RenderConfig,
  sel: SelectionState
): IsoShape[]
```

This is a parameter reshaping only — no behavioral change. Existing call sites in `exportShapes.ts` and App.tsx are updated to pass the grouped objects.

## Refactored `src/exportShapes.ts`

`buildExportShapes` becomes a thin coordinator:

```ts
export function buildExportShapes(params: ExportParams): ExportShape[] {
  const world = { grids, steps, ramps, cols, rows }
  const config = { show3D, wallColor, wallOpacity, tileW: EXPORT_TILE_PX, tileH: EXPORT_TILE_PX }
  const sel = { stepId: undefined, rampId: undefined, activeZ }

  if (params.mode === 'iso') {
    return isoShapesToExport(buildIsoScene(world, config, sel))
  } else {
    return topDownShapesToExport(buildTopDownShapes(world, config, sel))
  }
}
```

The 200+ lines of inline floor/water/face/step/ramp logic are deleted. Two small adapter functions (`isoShapesToExport`, `topDownShapesToExport`) convert the scene-builder output to whatever format the off-screen canvas expects — these are the only export-specific code remaining.

## Tests

- `topDownScene.test.ts` — mirrors `isoScene.test.ts` in structure; covers floor tiles, water tiles, face emission, step/ramp geometry at representative Z levels and directions
- `exportShapes.test.ts` — existing tests pass unchanged (same output contract, internal path changes)
- `isoScene.test.ts` — existing tests pass; update call sites to use grouped params

## App.tsx

The Konva rendering blocks are untouched. The only App.tsx change is the call site for `buildIsoScene`: the existing flat 13-field object is regrouped into `World`, `RenderConfig`, `SelectionState` — a mechanical parameter reshape with no behavioral change.

## Stamps

Stamp rendering is unchanged in both `exportShapes.ts` and App.tsx. `buildTopDownShapes` and `buildIsoScene` do not emit stamp shapes; the export coordinator and App.tsx continue to handle stamp geometry independently. Stamps are out of scope for this refactor.

## Impact

~200 lines of duplicated rendering logic removed from `exportShapes.ts`. Export-vs-screen drift is structurally impossible for tile, face, step, and ramp rendering. `topDownScene.ts` becomes a new testable seam for top-down rendering logic.
