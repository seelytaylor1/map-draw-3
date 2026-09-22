# ADR 0003: Named layers are independent of Z Levels

## Status

Accepted — 2026-09-22

## Decision

Map Draw will add named user-facing layers that are independent of the Level Stack. Each layer has a name, visible flag, opacity (0–100%), lock flag, draw order, and a target Z Level. A layer is the editing target; its target Z Level determines where its content is projected in Top-Down and Iso views.

The default document contains one unlocked, visible `Map` layer targeting Z=0. Existing maps migrate to that layer without changing their grid, placed objects, export, or Player View result.

Painting, stamps, labels, Step Runs, and Ramp Runs are authored to the active unlocked layer. A locked layer cannot be edited. Hidden layers do not render or export. Opacity affects editor and standard-export compositing. Player View uses the same layer visibility and opacity, then applies its existing player-safe filtering.

Layer changes, including visibility, opacity, locking, reordering, and active-layer selection, are saveable and undoable. Reordering controls composition among layers with the same target Z Level; Z Level geometry continues to determine cross-level projection order.

## Consequences

The map model needs per-layer content ownership and a legacy migration on load. Features that previously used only a Z Level must use the active layer and its target Z Level instead. This unblocks issues 0004, 0008, and 0009.
