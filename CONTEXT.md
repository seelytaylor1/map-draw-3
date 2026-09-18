# Domain Glossary

## Map
The full drawing canvas, defined in physical inches. Default dimensions are 8.5×11" landscape. Everywhere on a Map begins as Wall. The user paints Floor to create dungeon rooms and corridors.

## Tile
The atomic unit of the Map grid. One square cell. The default physical size is 1/8 inch (8 tiles per inch); the user may choose 1/2 inch (2 tiles per inch) or 1/4 inch (4 tiles per inch). At 300dpi export, the tile is rendered at 37.5px, 150px, or 75px respectively. Changing the square size preserves the Map's physical dimensions and resizes each level's Tile Grid.

## Tile Grid
A 2D array of cell states for a single Z Level — the authoritative data model for one floor of the Map. Each cell is either Wall, Floor, or Water. The grid dimensions (cols × rows) are derived from canvas dimensions in inches times tiles-per-inch and are identical at every Z Level.

## Z Level
An integer identifying a horizontal floor plane within the Map. Z=0 is the ground floor. Positive Z values are above ground; negative Z values are underground. There is no hard cap in either direction. Z Levels are sparse — a Z Level only exists if at least one Tile on it has been painted.

## Active Z Level
The Z Level currently selected for editing. All drawing tools (Brush, Rough Mode, Stamps) operate exclusively on the Active Z Level. The user changes the Active Z Level via +/− controls in the toolbar.

## Level Stack
The full collection of Tile Grids across all Z Levels, stored as a sparse map keyed by Z Level integer. Only Z Levels with at least one painted Tile are present in the Level Stack.

## Wall
The default state of a Tile. Rendered with a user-configured color and opacity (defaults: black, transparent, repro blue). Wall sections display a subtle dot pattern at 2×2 tile intervals.

## Floor
A Tile the user has painted. Rendered as a flat square. Optionally shows a square grid overlay. Can display Extruded Side Faces when the 3D Effect is enabled.

## Brush
The primary drawing tool. Paints or erases Tiles in a square or circle footprint. Size is measured in tile units (stays consistent regardless of zoom level). Operates in Draw mode (Wall → Floor) or Erase mode (Floor → Wall).

## Ghost Tile
A preview highlight showing which Tile the cursor is currently over. Displayed at all times while the cursor is inside the Map.

## Rough Mode
A three-click drawing mode that creates irregular Floor regions simulating caves. Click 1 sets the rectangle start. Click 2 sets the rectangle end and commits the base Floor shape. Mouse movement after Click 2 previews tile-level noise applied to the rectangle edges — distance from Click 2 to cursor controls intensity. Click 3 commits the deformed shape.

## Tile-Level Noise
The deformation mechanism used in Rough Mode. Edge Tiles of a Floor rectangle are randomly flipped between Wall and Floor states. Intensity controls how many layers of edge Tiles are affected and how far the effect reaches from the boundary.

## Stamp
A placeable symbol snapped to the Tile Grid. Each Stamp type has a fixed size in tiles. Stamps live on a separate layer from the Tile Grid and can be moved, rotated, scaled, mirrored, and deleted individually after placement. Each Stamp belongs to a Z Level and is placed at the Active Z Level when dropped. Two categories: Floor Stamp and Object Stamp.

## Floor Stamp
A Stamp that renders flat on the floor plane. Types: door, trap, star, bars, stairs. Rendered as an SVG icon in both Top-Down View and Iso View. In Iso View, the icon is skew-transformed to lie on the isometric floor surface.

## Object Stamp
A Stamp representing an upright map prop. Types are discovered from the 137 split SVG assets under `src/iso-objects` (IDs such as `g1002`, `dungeon_room_1x5`, and `torch`). Can be placed and edited in both views. In Iso View, rendered as a Billboard anchored to the tile's front-bottom corner so it appears to stand on the floor. In Top-Down View, rendered the same as a Floor Stamp — full opacity, selectable, draggable.

## Billboard
The render mode for Object Stamps in Iso View. The SVG is drawn upright, facing the viewer, with its base aligned to the front-bottom corner of the tile's isometric diamond.

## Top-Down View
The default editing view. All drawing tools are active in this view. Only the Active Z Level and Z Levels below it are rendered. The Active Z Level renders at full opacity. Each Z Level below the active one is rendered progressively more faded (Z−1 at reduced opacity, Z−2 more so, etc.). Z Levels above the Active Z Level are hidden entirely.

## Iso View
A preview-only isometric projection of the Map. Drawing tools are disabled. The view is a render pass that applies a coordinate transform to the current Map state. Not a separate data model. All Z Levels are rendered simultaneously. Each Z Level is offset vertically by its Z value × the Z Step Height, so higher Z Levels appear higher on screen. Draw order comes from the Iso Scene, not from layer stacking.

## Iso Scene
The painter-sorted list of draw commands that defines Iso View rendering (`buildIsoScene`). Z Levels emit lowest-first; within a level, every solid — a Tile (top plus its faces) or a single Tread — is a renderable sorted by painter depth, the col+row diagonal of its center. Greater diagonal means nearer the viewer, drawn later. This is why a Floor tile in front of a Step Run occludes it and tiles behind it are occluded. Pure and unit-tested; the app shell only converts the commands to canvas nodes.

## Z Step Height
The vertical pixel offset between adjacent Z Levels in Iso View. Equal to TILE_PX / 2 + FACE_PX (18px at current constants). Derived at render time — not stored.

## 3D Effect
A toggleable visual mode. Floor regions render with Extruded Side Faces — a dark band along the bottom and right edges of each Floor region, giving the appearance of a thick stone slab floating in space. Visible in both Top-Down View and Iso View.

## Extruded Side Faces
The geometry produced by the 3D Effect. Derived from the Floor boundary at render time — not stored in the Tile Grid.

## Canvas
The physical output dimensions of the Map, configured in inches. Resizing crops Tiles that fall outside the new bounds or adds Wall Tiles around the edges. Existing Tiles within the remaining area are preserved.

## Export
A render pass that produces a PNG at 300dpi by re-rendering the Map at full resolution. Export tile pixels are derived from the selected square size (150px for 1/2-inch squares, 75px for 1/4-inch squares); the working viewport renders at screen resolution.

## Water
A third TileState (value 2) that can be painted directly onto any tile, including Wall. Painted and erased with the Brush in the same way as Floor — the toolbar paint-mode selector is a three-state control: Floor | Water | Erase. Left-click paints the selected state; right-click always erases to Wall regardless of selected mode. Water tiles render with a fixed default color (muted blue). In Top-Down View, Water looks different from Floor by color alone — no inset or shadow. In Iso View, the Water diamond is shifted 4px downward relative to Floor, giving the appearance of a lower elevation. When the 3D Effect is enabled, Floor tiles adjacent to Water render their side face (acting as a stone bank); in the Iso Scene the Water surface draws after the bank, covering its submerged portion.

## Step Run
A first-class placed element that geometrically connects two adjacent Z Levels. Occupies a fixed 2×1 tile footprint starting at its origin tile and extending in its descent direction (N/E/S/W); the origin tile sits flush with the floor of the run's Z Level and the run descends to Z−1. Placed with the Steps tool at the Active Z Level with direction E; selectable, rotatable (cycles descent direction N→E→S→W), and deletable. Not a Stamp — it lives in its own `steps` list with its own geometry renderer.

## Tread
One step of a Step Run. A Step Run renders as 6 Treads, each dropping 1/6 of the Z Step Height, so the final riser lands exactly on the Z−1 floor plane. In Iso View each Tread renders a top quad plus a riser face; in Top-Down View Treads render as thin rectangles perpendicular to the descent direction, derived from the same run-local geometry so the two views cannot drift. When the 3D Effect is enabled, each Tread also renders an Extruded Side Face along the run's exposed edge — south for E/W runs, east for N/S runs — and Top-Down View adds a face band along that same edge.

## Ramp Run
A first-class placed element that connects two adjacent Z Levels exactly like a Step Run — same fixed 2×1 footprint, same descent directions (N/E/S/W), same flush-top / Z−1-landing, same select/rotate/delete behavior — but rendered as a single smooth geometric instead of Treads. It lives in its own `ramps` list (parallel to `steps`, with its own geometry renderer in `ramps.ts`) and is placed with the Ramp tool. In Iso View a Ramp is one sloped top quad rising from the Z−1 floor plane to the upper floor edge; with the 3D Effect enabled it also renders one triangular wedge side face along the exposed edge (south for E/W runs, east for N/S runs) — full Z Step Height tall at the top, tapering to nothing where the ramp lands. In Top-Down View a Ramp is its full 2×1 footprint rectangle, with a face band along the exposed edge when the 3D Effect is on. Unlike a Step Run's six Tread renderables, a Ramp is a single solid in the Iso Scene, painter-sorted by its footprint center. Distinct from the `ramp` Object Stamp (an upright Billboard prop), which is unrelated.

## Save File
A JSON file representing the full Map state: the Level Stack (all Z Level grids), Stamp positions/types/rotations/Z levels, Step Runs, Ramp Runs, Canvas dimensions, and Wall color/opacity settings. The Level Stack is serialized as an object with string-keyed Z Level integers, each value being a flat number array. Old save files with a flat `grid` key (single-layer format) are loaded as Z=0; saves without a `steps` key load with no Step Runs, and saves without a `ramps` key load with no Ramp Runs.

## Undo / Redo
History is a stack of full Map snapshots (Level Stack + Stamps + Step Runs + Ramp Runs). One snapshot is taken per completed gesture: mouseup for Brush strokes, and each Stamp, Step Run, or Ramp Run action (place, move, rotate, scale, mirror, delete) individually. Snapshots capture the full Level Stack across all Z Levels.

## Random Dungeon
A legacy generated-map procedure, quarantined under `src/randomDungeon/legacy/`, that replaces the Map with a connected dungeon layout on Z=0 by growing rooms and hallways from a Starting Room. It remains available through an explicit compatibility Adapter for focused regression coverage. The production Generate command uses the mission-first, style-selected model instead.

## Mission
An abstract structure of tasks, dependencies, keys, locks, branches, rewards, cycles, and a goal that describes what the player must negotiate. A Mission is independent of the physical arrangement used to realize it.

## Mission Node
A node in a Mission representing a player-facing task or mission element, such as a challenge, reward, key, lock, or objective. A Mission Node is not a physical room; Space Grammar rules determine how it is realized spatially.

## Mission Pattern
A high-level structure in a Mission Grammar, such as an Opening, Progression, Loop, Goal, or Loop Challenge. A Mission Pattern expands into primitive Mission Nodes before the Mission is realized as physical space.

## Mission Grammar
A set of graph-rewrite rules that constructs a Mission in two shallow levels: broad Mission Patterns first, followed by primitive Mission Nodes and their dependencies.

## Space Grammar
A set of rules that transforms a Mission into a physical dungeon arrangement. All Space Grammars use a shared realization engine; a user-selected Generation Style supplies the placement, module, connection, and description policies that determine how mission structures are spatially expressed. Space Grammar may add supporting geometry, but every gameplay-relevant traversable connection must correspond to an explicit Mission relationship.

## Generation Style
A user-selected Space Grammar that gives a generated dungeon its characteristic topology, module selection, connection behavior, and spatial organization. Every Generation Style must support the complete Mission vocabulary and all Loop Challenges; it may vary their spatial realization, but may not omit or reinterpret them. Critical Spine has an explicit Start-to-Goal spine with distinct shortcut routes; Central Hub has an explicit Start hub with declared spokes and no incidental convergence; Branch-and-merge has explicit branch-and-merge structure. Every Mission relationship realized in space is represented by a declared spatial connection.

## Spatial Module
A typed intermediate structure of dungeon space—such as a room, corridor, branch, junction, cycle, hub, gate, secret connection, or terminal challenge—with a readable footprint and connection ports. Spatial Modules are produced by Space Grammar rules and are realized as Tile geometry after placement; they are not necessarily pre-authored room templates. A module may realize or support a Mission Node's spatial anchor, and may contain multiple Mission Nodes only when an explicit production permits co-location. Junctions must be explicit; ordinary corridor overlap is invalid.

## Generated Dungeon
A complete dungeon layout produced from a Mission and a selected Generation Style, then realized on a Map while respecting the Map's physical bounds and readability requirements. Its starting room has one seeded ascending Step Run or Ramp Run on Z0 facing outward through an unused exterior wall, spanning an outside Wall tile and a room-edge tile away from every hallway aperture. It uses no Start text label.

## Generation Transaction
A complete generation operation that either commits one finished Generated Dungeon as one Map replacement or leaves the current Map unchanged. Intermediate placement attempts are not user-visible map artifacts.

## Generation Diagnostic
An explanation of a generation result that identifies the style, inputs, mission or space rule, and constraint involved. A failed generation retains enough diagnostic information to reproduce and troubleshoot the failure without exposing partial geometry as a Generated Dungeon.

## Page Capacity
The usable amount of readable dungeon complexity available on a Map after accounting for its physical dimensions, tile size, border, buffers, grid-cell footprints, labels, and markers. Smaller tile sizes intentionally provide more grid cells and can support denser spatial layouts on the same physical page.

## Grid-Cell Footprint
A Spatial Module's size and shape expressed in Map grid cells. The new generator uses grid-cell footprints as its primary spatial constraint; room-like modules have a hard 3×3-cell minimum, while larger footprints vary by mission and style. Corridors default to 1 cell wide; tile scale changes how much cell-based structure fits on the physical page and is therefore an intentional density control.

## Room Connection Aperture
An explicit opening in a room's one-cell Wall buffer for a planned corridor or other connection. Its width matches the designated connection—typically 1, 2, or 4 cells—so wide hallways can enter rooms normally without allowing incidental crossings or accidental merges. The aperture must fit the room's wall span; if it does not, placement must backtrack or fail rather than tapering the corridor automatically.

## Generated Door
A seeded decorative door marker rolled at a room aperture or along a long corridor. An aperture door is placed on the first hallway tile outside the room. Each unguarded room aperture has a 3-in-6 chance of a door. Corridors with 5–9 interior tiles have a 3-in-6 chance of a mid-door; corridors with 10 or more have a 5-in-6 chance. Two D6 rolls select among single, double, locked, trapdoor, portcullis, revolving, secret, magic, ladder up/down, stairs, spiral stairs, window, archway, and curtain stamps. A Mission Key/Lock relationship always marks its guarded aperture with the dedicated locked-door stamp; a decorative locked-door roll does not add a Mission dependency.

## Room Encounter
A seeded room-content roll produces an empty room on 1–3, monsters on 4–5, and a trap on 6. Independently, each room has a 2-in-6 chance of a Chest, which may coexist with any encounter. Monsters use the Triangle Arrowhead stamp; room and hallway traps use the Trap stamp with its T. A Loop Challenge reward also places a Chest in the Goal room.

## Dungeon Legend
A collapsed lower-right map control that explains generated map symbols using their actual stamp images. It includes the ascending start-room entrance, generated door variants, key, locked door, monster, trap, treasure, hazard, hub, and flooded-hallway markers.

## Corridor Condition
A seeded connection-content roll whose result is open, flooded, trap, or hazard. Flooded corridor interiors use Water tiles, which remain traversable. Trap and hazard conditions use their corresponding floor stamps.

## Semantic Stamp Realization
The rasterization step that maps a generated floor or connection type recorded in metadata to its corresponding implemented stamp, such as a secret door, locked door, concealed door, or key marker. Semantic types remain explicit until the map is written. The build validates that required types have implemented stamps; a missing asset is a build failure, not a reason to silently replace the type with a generic icon during generation. Key and Lock identifiers remain in metadata and summary by default; printed text labels are optional.

## Complexity Budget
A deterministic set of mission and spatial targets derived before generation from the complexity setting and seed. It may include mission-node count, branch count, challenge density, and supporting-space allowance. Page dimensions, tile size, and style determine whether the fixed budget fits; they do not change the requested mission. A request that cannot meet its budget within those constraints fails explicitly rather than being silently weakened.

## Complexity Preset
A named user-facing choice, such as Compact, Standard, or Dense, that selects a fixed Complexity Budget. The initial targets are Compact (5 Mission Nodes, 0 branches, 0 preset loops), Standard (8 Mission Nodes, 1 branch, 1 preset loop), and Dense (12 Mission Nodes, 2 branches, 2 preset loops). The requested loop count remains an exact user override of the preset loop target. The exact targets remain inspectable so the preset does not hide the requested design.

## Generation Preflight
A feasibility assessment performed automatically before spatial placement that compares the requested Mission and Generation Style against the Map's Page Capacity. Challenge-derived Key/Lock dependencies are included in that assessment. `fit` means the fixed request is expected to pass deterministic placement and validation; `warning` means the request remains valid but bounded placement may still fail because the page is crowded; `impossible` means a known constraint makes the request unsatisfiable, including an explicitly selected Loop Challenge that the requested loop cannot realize, in which case generation must stop rather than substitute a challenge or produce a degraded Mission or invalid topology. Preflight does not change the current Map or require a separate user confirmation.

## Cycle
An intentional mission and space structure containing two distinct, usable routes between a shared anchor and objective. The neutral base Cycle labels those alternatives Route A and Route B: both carry ordinary challenge rooms, neither is intrinsically a detour, shortcut, or risky route. Routes may be extended and may gain explicit crossover relationships, but must reconverge at the same objective. A Cycle is created explicitly so a Loop Challenge can operate on this starting structure rather than being inferred from accidental spatial connections. When a Mission has exactly one Cycle, that Cycle's objective is the dungeon Goal room; it is one room and one Mission Node.

## Loop Challenge
A Mission transformation applied independently to a neutral base Cycle that gives that loop a specific gameplay purpose. A challenge may annotate one route (secret, danger, or obstacle), extend it (Gambit's longer safe route), add dependencies and return paths, or consume the two-route topology (Hub & Spoke). Only the transformed topology is spatially realized, and unused base edges must not remain as accidental routes or extra Cycles. Different loops in one Mission may use different Loop Challenges. An explicit per-loop challenge takes precedence; the global loop preference fills every unspecified loop, and `Varied` performs a seeded uniform random selection from the compatible challenges for that loop. When loops exist without explicit selections, `Varied` is the default preference. Compatible means the challenge's required roles and static rules are available; physical placement is validated separately. Repeated challenges are valid outcomes; no hidden diversity or tastefulness rule is applied. Per-loop selections map by loop index; omitted entries use the global preference, while more entries than the requested loop count are an invalid request. The UI exposes one selector per requested loop: changing the loop count preserves choices by loop index, removes choices beyond the new count, and defaults newly added loops to `Varied`. An explicit challenge is a fixed requirement: placement may retry compatible productions and locations, but generation must report the request as impossible if that challenge cannot be realized for its loop. A single global forced challenge is not sufficient to define every loop when per-loop selections are present.

## Static Dungeon Graph
A representation of dungeon tasks and physical connections without simulating runtime actions or state changes. Locks, one-way connections, blocked returns, secrets, and similar conditions are recorded as static relationships or annotations.

## Key/Lock Dependency
A static Mission relationship stating that a Lock requires a corresponding Key. Key/Lock dependencies are derived from the selected Loop Challenges rather than independently chosen content counts; no loops or no lock-bearing challenges therefore produce no Keys or Locks. When there is exactly one loop, its objective is the same Mission Node and room as the dungeon Goal. A `Lock & Key` challenge creates one matching Key/Lock pair and marks the loop routes into that shared Goal room; with multiple loops, it also marks the main Goal entry when no other lock already guards Goal. A `Double Lock` challenge creates two distinct pairs, and an `Unknown Return` challenge creates the required locked Goal plus its matching Key in the Key room. One lock may guard multiple entrances; every guarded entrance receives a locked-door marker. A reachable bypass to its matching Key must remain available before the Lock is opened; a required Lock can never seal the only route to its own Key. `Unknown Return` retains the two base routes: it locks their objective entrances, adds a one-way valve from Route A to the Key room, and returns through one or more supporting rooms to the anchor before the party approaches the Goal again with the Key. The supporting rooms are spatial modules, not Mission Nodes or extra Mission complexity. The Generation Request has no independent key-count or lock-count fields; legacy callers that provide them receive an invalid-request diagnostic instead of having them ignored. The relationship describes intended progression for validation and spatial placement without simulating how the key is acquired or how the lock behaves during play. An optional Lock may affect only optional content and must never be the sole blocker on the full Start-to-Goal path; the Unknown Return Goal lock is required and is not optional content. A secret connection is required only when it is explicitly represented as the Lock in such a dependency; secrecy alone does not make a route critical.

## Spatial Coupling
A property of a Mission relationship that tells Space Grammar how strongly placement is constrained. `tight` coupling requires spatial order or relative placement, such as placing a Key before its Lock; `loose` coupling preserves the mission dependency while allowing broad spatial freedom.

## Progression Validation
An abstract solvability check over the static Mission and Space graphs. Starting from Start, it repeatedly collects reachable Keys and opens matching Locks until no new progression is possible, then verifies that the Goal is reachable. It validates design intent without simulating runtime player actions or mutable game state.

## One-way Valve
A required directional doorway transition represented by explicit Space metadata and a valve-specific Door Floor Stamp when available. In the Unknown Return Mission, it sits on the bypass around the locked Goal room and permits travel from the Goal-side approach toward the Key room only; it is not traversable backward, so the return to Start must use the separate route through one or more supporting rooms. If a style cannot place and represent that direction, the request is impossible rather than silently downgraded. Its direction and role are static Mission and Space metadata, not runtime simulation. It is ordinary doorway content, not vertical content; generated vertical content is limited to stairs, shafts, and ramps.

## Terminal Hallway
A valid hallway that has no room beyond its end. It remains playable Floor space and does not imply a doorway or chamber beyond it.

## Generation Attempt
A proposed extension from a dungeon exit. An attempt either becomes accepted room, hallway, doorway, intersection, or vertical content, or is rejected without partial geometry; rejected attempts retain their reason for generation diagnostics.

## Mission-preserving Layout Search
The mission-first generator uses up to 32 seeded room-placement candidates, followed by buffered doorway-to-doorway routing. Room sizes account for page capacity and exit count; rectangular, chamfered, and cruciform footprints create distinct chambers. Goals and hubs are spatial landmarks. Corridors cannot overlap or touch outside declared rooms, including within cycles. Every guarded entrance receives its own lock marker. See `docs/adr/0002-mission-preserving-dungeon-layouts.md`.
