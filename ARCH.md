# Architecture Plan: Table-Driven Random Dungeon Generation

Status: Proposed  
Source decisions: [ADR 0001](docs/adr/0001-table-driven-random-dungeon-generation.md)  
Domain vocabulary: [CONTEXT.md](CONTEXT.md)

## Outcome

Add a deterministic random-dungeon engine that produces one complete replacement for the current Map, plus temporary explanation data for the generation summary and diagnostics. The engine will be a pure, testable Module. React and Tauri will only handle confirmation, invoking generation, committing the resulting snapshot to Undo / Redo history, and displaying the result.

The implementation must preserve these architectural facts:

- The Tile Grid remains the authoritative map data for Z=0.
- Generated content is Floor, Water, Floor Stamps, Ramp Runs, and Labels; Step Runs and prior map content are discarded.
- Generation metadata is an in-memory result, not part of the Map or Map Save File.
- One successful generation is one call to `push`, therefore one undoable history action.
- The same seed, canvas settings, and generator inputs produce the same map state and metadata.
- No generator code creates Konva nodes, reads the DOM, calls `Math.random`, or writes a Save File.

## Current architecture and fit

The current codebase already supplies useful seams:

- `App.tsx` owns the reactive Map state, editor settings, confirmation flow, history, and file actions. Its `AppSnapshot` contains the Level Stack (`Map<number, Uint8Array>`), Stamps, Step Runs, Ramp Runs, Labels, and environmental colors.
- `grid.ts` provides pure Tile Grid operations such as `getTile`, `setGrid`, and `paintTiles`.
- `history.ts` provides full-snapshot Undo / Redo. `push` is the correct replacement seam.
- `stamps.ts` and `labels.ts` provide the existing placed-element types and list mutations.
- `viewportScene.ts`, `isoScene.ts`, and `exportShapes.ts` are pure render-description Modules. Generated map state will flow through them without generator-specific rendering code.
- `serialization.ts` defines the Map Save File. It must continue to serialize only authoritative Map state and editor settings.

The main architectural risk is putting the table procedure into `App.tsx`. That would make table order, geometry validation, asset fallback, transaction behavior, and UI side effects one shallow Module with poor Locality. The generator should instead earn a small Interface at the App seam and keep the rules behind it.

## Proposed Module layout

Use a feature folder so the generator can grow without creating one large file:

```text
src/randomDungeon/
  types.ts
  random.ts
  tables.ts
  geometry.ts
  placement.ts
  stamps.ts
  labels.ts
  generator.ts
  summary.ts
src/randomDungeon.test.ts
src/randomDungeon.geometry.test.ts
src/randomDungeon.placement.test.ts
src/randomDungeon.tables.test.ts
src/randomDungeon.integration.test.tsx
```

The exact test-file split may follow the repository's existing convention, but the seams below should remain visible and independently testable.

### `types.ts` — generation vocabulary and result shape

Define the generator-only types for:

- Dungeon Type, Starting Location, room shape and irregular subtype.
- Direction, Exit Type, doorway category, Door Condition, Beyond-the-Doorway result, hallway form and hallway condition.
- Room, exit, hallway, branch, connector, stamp request, label request, and Generation Attempt records.
- A Generation Input containing canvas dimensions and the chosen seed.
- A Generation Result containing the replacement AppSnapshot data, seed, accepted records, failed attempts, and compact summary data.

Keep these types separate from persisted `MapSave` types. They describe an explanation of one run and are intentionally temporary.

### `random.ts` — one deterministic D6 stream

Provide a small seeded random Module with a single `nextD6()` operation and a seed factory for the command layer. The Implementation must:

- Normalize the seed to a documented unsigned integer representation.
- Produce values 1 through 6 inclusively.
- Consume the stream in call order, with no hidden random calls in geometry, validation, asset lookup, or label placement.
- Make rerolls explicit at the call site, only for source-table rules that require them.
- Make the random-valid Starting Location behavior explicit and deterministic; it must not become an undocumented fit-search or candidate reroll.

The seed factory may use platform randomness once when the user starts generation. Tests and diagnostic replay pass an explicit seed to the pure generator.

### `tables.ts` — declarative source-table decisions

Encode the ADR tables as named table rolls and small dispatch functions. Each roll should retain both its semantic result and enough source information for metadata. This Module owns:

- Starting Room, Room Exits, Exit Type, Doorways, Door Conditions, Beyond-the-Doorway, Intersections, Hallways, Hallway Conditions, Rooms, irregular subtypes, and Features.
- The overlapping hallway left/right range as 1–3 = left and 4–6 = right.
- The archway exception for Locked door conditions.
- The Trapped reroll and combined Locked + Trapped condition.
- The fact that Dungeon Type is retained but has no downstream probability effect yet.

Table data should be easy to exhaustively test. Do not bury table decisions inside coordinate code or React event handlers.

### `geometry.ts` — candidate footprints and direction transforms

Represent every proposed room, connector, and hallway as grid-coordinate geometry before it touches the Tile Grid. This Module owns:

- Literal room dimensions and shape footprints for square, rectangle, circle, cave opening, cavern, and irregular chambers.
- Hallway paths, turns, intersections, side passages, doorway positions, and width-aware footprints.
- Direction-relative transforms so north/east/south/west use the same rules.
- Doorway and connector positions, including the explicit entrance exception.
- Pillar candidate positions for hallways four or more tiles wide.

Geometry should return plain coordinate data, not mutate a `Uint8Array`. It must distinguish the carved footprint from decoration or marker positions so a valid hallway can survive a failed room extension.

### `placement.ts` — validation and transactional commit

Create the deepest Module in the feature: callers submit a candidate transaction and receive either a committed result or a structured failure. Its Interface should hide the details of border checks, overlap checks, buffer expansion, and atomic writes.

The Implementation should maintain a generation-only placement ledger over the Z=0 Tile Grid. A candidate transaction contains all writes that must succeed together: carved Tile states, connector tiles, required stamps, and required labels when the ADR makes them required. Validation must enforce:

- One-tile Wall border as a hard invariant.
- One-tile Wall buffer between unrelated geometry, including diagonal/corner contact.
- The explicit doorway/connector entrance exception only at the planned entrance.
- Literal room dimensions and complete width-aware hallway footprints.
- No partial room, connector, doorway, or hallway on failure.
- Floor and Water both count as traversable for later connectivity checks.

Use transaction phases where the ADR requires different atomic scopes:

- A connector and its new room are one transaction.
- A door and its Beyond-the-Doorway result are one transaction.
- A trapped door and its required trap marker are one transaction.
- A hallway's valid geometry may commit before a room attempt beyond its end; that room failure produces a Terminal Hallway rather than rolling back the hallway.
- Intersection geometry may commit while individual invalid branches are recorded and discarded.

The ledger should make the Deletion test pass: removing this Module would force border, buffer, overlap, and rollback logic into every table procedure. That concentration is the intended Depth and Leverage of the Module.

### `stamps.ts` — generated Floor Stamp Adapter

Add a generated-content Adapter over the existing `stamps.ts` asset vocabulary. It maps semantic requests such as door, secret door, one-way valve, trap/danger, stairs, shaft, and rubble/pillar to the closest available Floor Stamp type. Generated ramps use the existing `RampRun` model rather than a door stamp.

The Adapter must:

- Preserve the exact source-table category in generation metadata even when the visual asset is a fallback.
- Use only available `STAMP_TYPES` and stable candidate priority lists.
- Align and rotate the Floor Stamp from the exit or hallway direction.
- Report unavailable required assets as transaction failures.
- Treat optional rubble and pillar assets as non-fatal; the requirement remains in metadata when omitted.

This is a real Seam because the table vocabulary and asset vocabulary are different. The Adapter keeps that translation local and prevents `generator.ts` from depending on asset filenames.

### `labels.ts` — canonical condition labels and placement

Create the generated-label Adapter over the existing `Label` type. It should own:

- Canonical text for Locked, Trapped, Secret, Flooded, Collapsed, Converted, and Hazard conditions.
- Combined text such as Locked + Trapped.
- Clockwise search from the stamp-facing side for an adjacent valid Tile.
- Omission plus a failed-attempt/diagnostic record when no valid adjacent Tile exists.
- Anchor rules for hazard labels versus hallway-condition labels.

Labels are visible Map elements only after their underlying required geometry and stamp transaction succeeds. A label that is optional under the ADR must never invalidate otherwise valid geometry.

### `generator.ts` — queue-driven orchestration

Expose one narrow generation operation:

```text
generateRandomDungeon(input) -> GenerationResult
```

The operation should create a new all-Wall Z=0 Tile Grid and process a FIFO work queue. It owns sequencing, not geometry details:

1. Roll Dungeon Type, Starting Location, and Starting Room.
2. Validate and commit the Starting Room using the same placement rules as later rooms.
3. Roll and retain its exits.
4. Process rooms in creation order and exits in roll order.
5. Dispatch each Exit Type to hallway, doorway, connector-plus-room, or vertical-content logic.
6. Append newly created branches to the queue.
7. Record every rejected Generation Attempt with its originating branch and reason.
8. Stop when the queue is empty.

The orchestrator must never silently reroll a failed candidate, shrink it, relocate it, or search for a fit. It may perform only the explicit table rerolls and the explicitly defined random-valid Starting Location selection.

Return an AppSnapshot-shaped replacement containing only Z=0 generated state: the new Tile Grid, generated Stamps, generated Ramp Runs, generated Labels, and empty Step Runs. Return seed and all explanation records beside it. Do not put generation metadata in the snapshot.

Vertical results remain anchored at Z=0. Stairs and shafts use the closest available Floor Stamp; ramps use a `RampRun`. They must not create additional Z Levels, Step Runs, or persisted generation metadata.

### `summary.ts` — compact result projection

Derive the user-facing summary from the Generation Result rather than incrementing UI counters during generation. Include seed, Dungeon Type, Starting Room result, rooms, hallways, Terminal Hallways, visible Stamps/Labels, and failed-attempt count. Keep detailed records available for diagnostics without requiring them in the compact UI.

## Application integration

Add a `handleGenerateRandomDungeon` command in `App.tsx`, or extract the existing file/new confirmation logic into a small command Adapter if duplication becomes noticeable. The command flow is:

1. Check the existing dirty state and use the normal unsaved-changes confirmation.
2. Choose one seed and call `generateRandomDungeon` with the current canvas dimensions and generation inputs.
3. On success, push exactly one new AppSnapshot into history. Do not call several `push` operations for rooms, hallways, or markers.
4. Set the Active Z Level to 0, clear transient drawing/selection state, and retain editor settings that are not Map content.
5. Store the Generation Result metadata in ephemeral React state for the compact summary and diagnostics.
6. Leave the current file path intact so the replacement marks the existing document dirty and Save writes the generated Map normally.
7. On a generation error, leave the existing Map and history untouched and show the error through the existing load/error presentation pattern.

The first UI can be a toolbar action in the existing Canvas & File or a dedicated Generation section, with a compact result summary and an optional details view. No generator-specific rendering path is needed: existing Top-Down View, Iso View, Export, Stamps, and Labels consume the generated Map state.

If a menu command is added later, follow the existing `handle*Ref` pattern so Tauri menu listeners remain registered once.

## Persistence and history rules

- Do not add seed, Generation Attempt records, or dungeon explanation objects to `MapSave`.
- Do not change the Save File version for generation metadata that is intentionally temporary.
- Generated Floor Stamps and Labels serialize through the existing `stamps` and `labels` fields because they are authoritative Map elements.
- Existing Step Runs and Ramp Runs are cleared in the replacement snapshot; generated Ramp Runs are retained as part of the new snapshot.
- Undo restores the complete prior AppSnapshot; Redo restores the complete generated AppSnapshot.
- A later optional “repeat with seed” feature can pass a displayed seed back to the pure generator without requiring Save File persistence.

## Failure model

Use typed, stable failure reasons matching the ADR: `out-of-bounds`, `overlap`, `lost-buffer`, `invalid-path`, `unavailable-required-stamp`, `unavailable-label-position`, and any additional reason only when it describes an observable rule. A failed attempt must include its originating branch and enough candidate information to explain the decision, but must not retain references to mutable draft state.

Unexpected programming errors should be thrown to the application command and leave the current Map unchanged. Expected candidate rejection is data in the Generation Result, not an exception.

## Test plan

The generator's Interface is the primary test surface.

### Determinism and tables

- Same seed, dimensions, and inputs produce deep-equal Tile Grid bytes, Stamps, Labels, accepted records, failed attempts, and summary.
- Different seeds can produce different results without changing the shape of the result.
- D6 output is always 1–6 and consumes one stream in order.
- Every table maps all six rolls correctly, including the hallway left/right range, archway condition exception, Trapped reroll, and Dungeon Type neutrality.
- No generator test needs a browser, Konva, React, or Tauri.

### Geometry and placement

- Starting Room uses literal dimensions and fails atomically when it cannot fit.
- Border and one-tile buffer reject edge, overlap, adjacent, and corner-to-corner contact.
- The planned doorway/connector entrance is the only buffer exception.
- Wide hallways validate their full footprint; parallel turns preserve the buffer.
- A failed room leaves no connector, doorway, or partial room.
- A valid hallway remains after a failed room beyond it and is reported as a Terminal Hallway.
- Intersection geometry survives invalid branches while valid branches continue in queue order.
- Floor and Water are both reachable in connectivity checks.

### Generated elements and metadata

- Required markers fail their containing transaction when no asset is available.
- Optional pillars/rubble do not invalidate geometry and leave an explicit metadata requirement.
- Secret, locked, trapped, flooded, collapsed, converted, and hazard labels use canonical text and placement rules.
- Vertical content is limited to stairs, shafts, and ramps. It creates no Step Run or additional Z Level; a ramp is represented by a generated Ramp Run at Z=0.
- The compact summary matches the detailed Generation Result.

### Application and persistence

- Generation uses the normal dirty-map confirmation.
- Confirmed generation replaces all prior generated/editor content in one history action.
- Undo and Redo restore the complete snapshots.
- Save output contains generated Map state but no seed or Generation Attempt records.
- Existing scene builders render generated Floor/Water/Stamps/Labels without generator-specific branches.

Run verification with:

```text
npm test -- --run
npm run build
```

## Delivery sequence

1. Add generator-only types and the seeded D6 stream; lock down table tests.
2. Implement room/hallway geometry and direction transforms as pure coordinate Modules.
3. Implement the placement ledger and transaction rules; add invariant and failure tests before wiring table orchestration.
4. Implement Floor Stamp and Label Adapters against the existing asset/type Modules.
5. Implement FIFO orchestration and deterministic Generation Result records, including the golden-seed tests.
6. Add the App command, one history replacement, confirmation, Active Z reset, and compact summary.
7. Add diagnostics presentation and application integration tests.
8. Run the full test/build checks and manually verify Top-Down, Iso View, Export, Save, Undo, Redo, and generation replay by seed.

## Decisions to confirm during implementation

These points are constrained by the ADR but require a concrete representation in code:

- The exact coordinate rule for Starting Location roll 6 (“random valid location”) must be documented in `tables.ts` and tested as part of the deterministic stream.
- Circle, cave opening, cavern, and natural uneven-wall footprints need one canonical discrete-grid rasterization each; they must not use view-specific approximations.
- The semantic priority lists for “closest available” Floor Stamps must be centralized in the generated-content Adapter and tested against the current asset set.
- The definition of an “unrelated” footprint must be represented by the placement ledger so explicit entrances are exceptions without weakening global buffer checks.
- Whether editor color settings are retained is a UI-state decision; the Map replacement must at minimum discard environmental paint while leaving non-content preferences stable unless the product explicitly chooses otherwise.
