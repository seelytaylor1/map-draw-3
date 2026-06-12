# Directional Run Foundation

**Date:** 2026-06-12
**Status:** Approved

## Problem

`steps.ts` and `ramps.ts` share a large body of identical code: the `DIRECTION_DELTAS` and `DIRECTION_CYCLE` constants, the `uvToGrid` coordinate helper, the `runTiles` footprint function, the `topDownRect` and `topDownFaceRect` geometry functions, and the `add`/`remove`/`rotate` list mutations. Any bug in direction logic or coordinate math must be fixed in both files. A future third connector type (ladder, slide, etc.) would require a third copy.

## Solution

Extract a `directionalRun.ts` module that owns the shared interface and all shared logic. `steps.ts` and `ramps.ts` each keep only their geometry-specific rendering functions, re-exporting the generic mutations under their existing names so all callers are unchanged.

## New Module: `src/directionalRun.ts`

### Interface

```ts
export interface DirectionalRun {
  id: string
  col: number
  row: number
  z: number
  direction: 'N' | 'E' | 'S' | 'W'
}
```

### Exports

| Export | Description |
|--------|-------------|
| `DirectionalRun` | Shared interface for all directional level connectors |
| `DIRECTION_DELTAS` | Delta table keyed by direction — the 4-entry map currently duplicated in both files |
| `DIRECTION_CYCLE` | Rotation order array `['N', 'E', 'S', 'W']` |
| `uvToGrid(run, u, v)` | Run-local UV coordinates → world grid `{ col, row }` |
| `runTiles(run)` | Returns the 2-tile footprint as `{ col, row }[]` |
| `topDownRect(run)` | Returns the bounding rectangle for top-down rendering |
| `topDownFaceRect(run)` | Returns the 3D effect face band rectangle for top-down |
| `addRun<T extends DirectionalRun>(list, run)` | Immutable append |
| `removeRun<T extends DirectionalRun>(list, id)` | Immutable filter by id |
| `rotateRun<T extends DirectionalRun>(list, id)` | Immutable rotate — cycles `direction` N→E→S→W |

## Updated `src/steps.ts`

Retains only step-specific geometry:
- `StepRun` interface extending `DirectionalRun` (no additional fields)
- `isoStepTreads(run)` — 6 tread quads with per-tread elevation drops
- `stepTreadCenters(run)` — painter depth anchors for each tread
- `isoStepSideFaces(run)` — 3D effect stepped side faces
- `topDownStepRects(run)` — top-down tread rectangle array

Re-exports preserving the existing public API:
```ts
export const addStep = addRun<StepRun>
export const removeStep = removeRun<StepRun>
export const rotateStep = rotateRun<StepRun>
```

## Updated `src/ramps.ts`

Retains only ramp-specific geometry:
- `RampRun` interface extending `DirectionalRun` (no additional fields)
- `isoRampSurface(run)` — single sloped top quad
- `isoRampSideFace(run)` — triangular wedge side face
- `topDownRampRect(run)` — full 2×1 footprint rectangle
- `rampCenter(run)` — painter depth anchor

Re-exports:
```ts
export const addRamp = addRun<RampRun>
export const removeRamp = removeRun<RampRun>
export const rotateRamp = rotateRun<RampRun>
```

## Callers

All callers (`App.tsx`, `isoScene.ts`, `serialization.ts`) continue importing from `steps.ts` and `ramps.ts` using the same function names. No caller changes required.

## Tests

- `directionalRun.test.ts` — covers direction cycling, `uvToGrid`, `runTiles`, `topDownRect`, `topDownFaceRect`, and all three generic mutations for each direction
- `steps.test.ts` — existing tests pass; imports of shared logic now come indirectly via `steps.ts`
- `ramps.test.ts` — same

## Impact

~140 lines of duplicated code eliminated. Direction logic has a single source of truth. A future connector type extends `DirectionalRun` and gets mutations for free.
