# ADR 0001: Table-driven random dungeon generation

- Status: Proposed
- Date: 2026-09-14

## Purpose

Map Draw will provide a random dungeon generator driven by the supplied dungeon-generation tables. The generator creates a playable, connected dungeon layout from the current canvas while retaining enough generation metadata to explain the result during the generation run.

This ADR describes the desired generator behavior. It does not describe an existing implementation.

## Target behavior

### Map replacement and reproducibility

- Before generation, the app uses the normal unsaved-changes confirmation.
- A confirmed generation replaces the existing Map with a new dungeon on Z=0.
- Existing tiles, stamps, labels, Step Runs, Ramp Runs, and environmental paint are discarded.
- The complete replacement is one undoable history action.
- Each generation uses one internally chosen random seed. The seed is shown in the compact generation summary and is available in detailed diagnostics.
- Repeating generation with the same seed, canvas settings, and inputs produces the same rooms, geometry, stamps, labels, metadata, and failed-attempt records.
- Generation metadata is temporary. It is available to the generator, the summary, and diagnostics, but is not written to the Map Save File.

### Growth and stopping

- The generator has no room-count, coverage, or density target.
- It begins with one Starting Room and grows by processing the exits and branches produced by the tables.
- Rooms are processed in creation order. A room's exits are processed in the order they were rolled. Newly created branches are appended to the work queue.
- A candidate placement is selected once from the seeded random stream. The generator does not silently reroll, shrink, relocate, or search until a candidate fits.
- A failed candidate is discarded transactionally, but the attempt and its reason are retained in detailed generation records.
- Generation stops when the work queue has no remaining branch that can produce another valid addition.
- A valid hallway may be committed even when its attempt to create a room beyond the hallway fails. Such a hallway is a playable terminal hallway. It remains plain Floor unless a table result explicitly calls for another marker.

### Canvas and geometry rules

- All generated geometry stays inside a one-tile Wall border.
- The border is a hard invariant. A room or hallway that would delete, touch, or cross the border fails transactionally.
- Unrelated rooms and hallways must retain a one-tile Wall buffer. They must not touch or merge, including corner-to-corner contact.
- A hallway may enter a room through its explicit doorway or connector. That planned entrance is the exception to the buffer rule.
- A hallway that turns and runs parallel to a room must preserve the one-tile buffer along the parallel section.
- Room dimensions are honored literally. If a rolled room cannot fit, the attempt is rejected rather than clamped or resized.
- Hallway width is part of the candidate footprint before validation. Wide hallways are allowed when their complete footprint remains inside the border, avoids unrelated geometry, and preserves the required buffer.
- Failed geometry never leaves a partial room, connector, doorway, or hallway behind.
- The initial Starting Room follows the same rules. If it cannot fit, the failed attempt is recorded and generation stops without carving a dungeon.
- Floor and Water are both traversable for connectivity. A flooded hallway may therefore use Water without breaking the generated dungeon graph.

### Table rolls and randomness

- All tables use one deterministic seeded D6 stream.
- Rerolls occur only where a source table explicitly calls for them.
- No undocumented Dungeon Type biases are applied. Caves, Tombs, and Ruins are rolled and recorded, but do not change later probabilities until an explicit type-specific rule is defined.
- The source table's overlapping hallway left/right range is resolved as 1–3 = left and 4–6 = right, relative to the hallway's current travel direction.

## Generation procedures

### Starting Room

1. Roll Dungeon Type and retain it as generation metadata.
2. Roll Starting Location:
   - 1: center
   - 2: bottom-left
   - 3: bottom-right
   - 4: top-left
   - 5: top-right
   - 6: random valid location
3. Roll Starting Room:
   - 1: square, each side based on D6 squares
   - 2: large square, each side based on D6+3 squares
   - 3: rectangle, one dimension based on D6 and the other on D6+3
   - 4: circular, with D6-square radius
   - 5: cave opening, with D6+3 squares at the opening and D6 at the narrowest point
   - 6: cavern, with dimensions based on 2D6 and natural uneven walls
4. If the literal result cannot fit inside the border, record the failed Starting Room attempt and stop.
5. Roll Room Exits for the starting room. A None result creates no frontier; generation proceeds only from other valid branches.

### Room Exits

Roll Room Exits for every room:

1. None
2. One doorway on a random wall
3. Two doorways on opposite walls
4. Three doorways, equally spaced
5. One secret doorway
6. Three doorways and one secret doorway

The result is retained with the room. A None result creates no new frontier. Secret exits use the normal doorway transaction and produce a secret Door Floor Stamp plus an adjacent Secret label when successful.

### Exit Type dispatch

Exit Type determines which procedure generates the content beyond an exit:

1–2. Hallway: invoke Hallway generation.
3–5. Doorway: create a door, then invoke Beyond-the-Doorway generation.
6. Room: create exactly one connector Floor tile and attach a new room beyond it.

The connector tile and new room are one transaction. If the room fails validation, neither the connector nor a doorway marker is committed.

### Doorways and Beyond the Doorway

For a Doorway result, door generation and Beyond-the-Doorway generation are one transaction. If the required beyond content fails, the door is discarded and the failed doorway attempt is recorded; the map must not accumulate doors that lead nowhere.

Doorway results are:

1. Wooden door
2. Stone door
3. Exotic door
4. Archway
5. Portcullis
6. Collapsed doorway

The generator uses the semantically closest available Door Floor Stamp and preserves the exact table category in metadata. The stamp is aligned with the wall and the exit direction.

One-way valve is a supported door type and uses the valve-specific Door Floor Stamp when available. It is not vertical content and does not terminate generation by itself.

Door Condition results are:

1–2. Open
3. Stuck/blocked
4. Locked, except that an archway skips this result
5. Secret
6. Trapped; roll again, with results 1–3 also making the door locked

Non-default conditions use one adjacent label with canonical combined text when necessary, such as Locked + Trapped. Secret doors use both the dedicated secret/concealed Door Stamp and a Secret label.

Beyond-the-Doorway results are:

1. Hallway
2–4. Room
5. Intersection
6. Ascent/descent, followed by another D6:
   - 1–2: staircase
   - 3–4: shaft
   - 5–6: ramp

Vertical results remain anchored at Z=0. Stairs and shafts place the closest available Floor Stamp; ramps use the existing Ramp Run model. They do not create another Z Level or Step Run.

### Intersections

Intersection results are:

1–2. T-intersection
3–4. Four-way crossroad
5–6. Y-intersection

For each branch, roll again:

- 1–3: hallway branch
- 4–6: doorway branch

Each valid branch is enqueued for normal generation. Invalid branches are discarded and recorded without invalidating the intersection or other valid branches.

### Hallways

Hallway results are followed literally:

1. Extend D6 squares straight, then roll again.
2. Extend 3 squares straight, create an intersection, then roll again.
3. Extend 3 squares, turn left or right, then roll again for the hallway.
4. Extend D6 squares, create a side passage, then roll again for the side and both hallway results.
5. Extend D6 squares with a doorway along one wall, then roll for the side and Doorways.
6. Extend D6 squares and end; D6 1 is a dead end, 2–4 is a doorway, and 5–6 is a room.

The full width-aware hallway footprint is validated as one candidate. A hallway that is valid as geometry remains valid gameable space even if its attempt to create a room fails. Terminal hallways remain plain Floor unless another table result explicitly creates a stamp.

Hallway Condition results are:

1–2. Add one tile to the hallway width and roll Hallway Condition again.
3–4. Open.
5. Difficult; roll again:
   - 1–2: flooded
   - 3–4: collapsed
   - 5–6: converted to another use
6. Trap or hazard.

Flooded hallway tiles become Water and remain traversable for connectivity. Collapsed hallways may receive a rubble stamp when a matching asset exists; otherwise they receive a Collapsed label. Converted hallways receive a Converted label and remain otherwise unchanged.

Hallways four or more tiles wide have pillars. Pillars are map decorations, not a reason to reject a valid hallway:

- Width 4 uses the two central columns as the pillar line, alternating along the hallway.
- Width 5 or greater uses pillar rows one tile inside the outside walls.
- Supports are placed every three hallway tiles, skipping positions that would block a doorway, intersection, stamp, or label.
- If a matching pillar asset is unavailable or a particular support position is invalid, the hallway remains valid and the pillar requirement stays in metadata.

The four source table conditions—flooded, collapsed, converted, and hazard—are retained in hallway metadata.

### Rooms

Room results are:

1. Square room; D6 squares long and wide.
2. Rectangular room; D6 squares long by D6+3 squares wide.
3. Circular room; D6-square radius.
4. Irregular chamber; roll again:
   - 1: letter-shaped room
   - 2: polygonal room based on D6+2 sides and D6 width
   - 3: trapezoidal room based on D6 width at its largest end
   - 4: D6-cornered room
   - 5: natural cavern
   - 6: underground feature; roll Rooms again and combine the result with a feature roll

The irregular subtype is preserved in room metadata and used during geometry validation and generation. Underground feature results are room metadata only in this version. They do not carve Water, alter the room's Floor, or place feature stamps.

Feature rolls are:

1. Chasm
2. Underground river
3. Gas-filled
4. Affected by a random spell
5. Stalagmite grove
6. Stalactite grove

## Generated map elements

- A successful doorway receives a directionally aligned Door Floor Stamp using the closest available asset.
- A trapped door must receive the corresponding Trap Door or Danger Floor Stamp on the tile beyond the doorway. If that required trap marker cannot be placed, the doorway transaction fails.
- A successful hallway hazard receives a Danger Floor Stamp when valid space exists.
- Stairs and shafts receive their closest matching Floor Stamp. Ramps are represented by a Ramp Run rather than a door stamp.
- A condition that needs explanation receives one adjacent label. Labels use canonical condition text and are placed by searching clockwise from the stamp's facing side.
- If the first adjacent tile is invalid, the generator continues clockwise until it finds a valid tile. If no adjacent tile is available, the label is omitted and the label-placement failure is recorded; the underlying valid geometry and required stamp remain.
- A hallway hazard label is anchored to its Danger Stamp. Other hallway-condition labels use the hallway midpoint/forward tile.
- Generated features and failed attempts remain structured generation metadata, not visible map elements.

## Generation result and diagnostics

The in-memory generation result includes:

- seed, Dungeon Type, and Starting Location
- the Starting Room and every accepted room, including dimensions, shape subtype, and feature metadata
- accepted exits, including Exit Type, direction, secret status, doorway category, condition, and Beyond-the-Doorway result
- accepted hallways, including path, width, form, condition, and terminal status
- generated stamps and labels
- failed attempts, including the originating branch and a reason such as out-of-bounds, overlap, lost buffer, invalid path, unavailable required stamp, or unavailable label position

The user-facing summary is compact and reports the seed, Dungeon Type, starting-room result, rooms created, hallways created, terminal hallways, visible stamps/labels, and failed-attempt count. Detailed attempt records are temporary diagnostics for testing and troubleshooting.

## Consequences

- The generator produces a connected, editable dungeon while preserving the random-table decisions that produced it.
- Transactional placement prevents stray doorways, partial rooms, merged chambers, and broken hallways.
- Literal table results and explicit failure records make generation behavior explainable and reproducible.
- Water can represent flooded passages without disconnecting the dungeon graph.
- The Map Save File remains focused on authoritative map state. Generation explanation and diagnostics are intentionally not persisted.
- Some table results currently remain metadata-only, especially room features and unsupported decorative assets. They can gain richer map representations later without changing the generation rules.

## References

- Domain glossary: CONTEXT.md
- User-provided dungeon-generation reference images, pages 149–151
