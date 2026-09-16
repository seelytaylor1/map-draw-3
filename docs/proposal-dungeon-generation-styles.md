# Proposal: User-Controlled Dungeon Generation Styles

**Status:** Proposed  
**Date:** 2026-09-15

## Summary

Map Draw should support several independent dungeon-generation styles. The user selects one style before generating a map. A generated page does not combine multiple styles unless a future style explicitly defines that behavior.

## V1 implementation decision

The current mission-first implementation uses deterministic style policies rather than weighted production selection. `GenerationStyleDefinition` owns placement, module typing, supporting geometry, routing fallback, description, and plan validation through one shared Interface. The style registry does not expose unused production weights; a future weighted grammar can extend this Interface only when its selection state and diagnostics are implemented.

The styles share a generic gameplay model and the existing physical-page constraints, but each style owns its own topology and placement strategy.

The generator should understand relationships between keys and locks. It should not know what a key represents in the game world. A key may later become an ability, item, switch, spell, quest object, or any other progression device.

## Methodological foundation

This proposal follows Joris Dormans's Mission/Space approach to procedural level design.

An action-adventure level has two related but distinct structures:

- the **mission**, which describes the tasks, dependencies, rewards, keys, and locks the player must negotiate;
- the **space**, which describes the physical rooms, corridors, connections, and landmarks in which that mission takes place.

The mission should be generated first as an abstract graph. A separate space grammar should then transform that mission into a physical page. The two structures can correspond in places, but they should not be forced to be identical. The same mission should be able to appear in multiple spatial styles, and one spatial style should be able to support multiple missions.

This changes the role of the styles in this proposal: a style is primarily a selectable space grammar and placement strategy, not a different ability system or a different hard-coded quest.

The mission layer should use graph-grammar rewrite rules rather than randomly scattering keys and locks. Rules can add tasks, introduce a key/lock dependency, move a lock farther along the mission, move its key earlier, create parallel tasks, or form a cycle. The rules themselves should preserve solvability where possible, while the validator checks the final result.

The space layer should associate mission symbols with shape-grammar rules. For example, a mission branch can be realized as a side route, a key can be placed in a detour, and a lock can become a doorway or blocked connection. Candidate placements are selected according to page fit, relationship coupling, and style-specific spatial preferences.

## Problem

The current dungeon work explores several valid ways to structure exploration:

- a readable critical path with rewarding backtracking;
- a radial or hub-based layout;
- an organic branch-and-merge layout with discovery and secrets.

These should not be forced into one ambitious hybrid generator. They are separate user-facing generation modes, and the project may eventually support many more styles.

The generator also runs inside a physical map canvas. The default page is 11 × 8.5 inches in landscape orientation, so a useful strategy must account for the available page area, tile size, room footprints, corridors, margins, labels, and stamps.

## Goals

1. Let the user choose a dungeon-generation style before generation.
2. Make each style meaningfully different in topology and spatial organization.
3. Keep keys and locks generic and content-neutral.
4. Guarantee a connected, page-bounded result when generation succeeds.
5. Ensure the goal is reachable through a valid key/lock progression.
6. Preserve deterministic generation from the same style, inputs, and seed.
7. Explain why a generation succeeds, fails, or has limited complexity.
8. Reuse the existing map, tile, border, buffer, export, and undo/redo model.

## Non-goals

- Combining every style into a single map.
- Encoding specific abilities such as Dash, Claw, or Lantern in the generator.
- Generating an entire commercial-scale Metroidvania on one page.
- Preserving the legacy bottom-up room-growth algorithm as the foundation. Individual geometry primitives may be reused only when they fit the new spatial-module model.
- Hiding failed placement attempts through silent shrinking, relocation, or rerolling.

## Page model

The physical canvas is a generation input, not merely a viewport.

The default landscape page produces these grid sizes at the supported tile scales:

| Tile size | Grid |
|---|---:|
| 1/2 inch | 22 × 17 |
| 1/4 inch | 44 × 34 |
| 1/8 inch | 88 × 68 |

The usable gameplay area is smaller than the raw grid because it must reserve:

- the required wall border;
- a one-cell Wall buffer protecting room interiors from unrelated rooms and hallways;
- readable room and corridor footprints;
- space for doors, keys, labels, and stamps;
- visual whitespace needed for a printable map.

Each style receives a page specification and should select an appropriate complexity within it. A style that cannot fit its requested plan should return a clear diagnostic rather than violate the page rules.

One page should be treated as one dungeon section or gameplay arc. Supporting a larger dungeon across multiple linked pages can be considered later.

Spatial footprints are primarily expressed in grid cells. Room-like modules have a hard minimum footprint of 3×3 cells, while larger rooms may vary by mission and style. Corridors default to 1 cell wide; 2-cell and 4-cell-wide corridor productions are allowed but receive progressively lower weights. Selecting smaller physical squares is an intentional density choice: a 1/8-inch map can pack more spatial structure onto the same physical page than a 1/2-inch map. Labels, markers, and other presentation elements still require collision and readability checks, but the generator should not impose a universal physical-inch minimum that defeats this density control.

Room interiors must retain a one-cell Wall buffer from unrelated space. A planned connection may create an explicit aperture in that boundary, and the aperture may match the width of the connecting corridor: one, two, or four cells. The exception applies only to the designated connection footprint; neighboring cells must still be protected from incidental overlap or an accidental hallway entry.

An aperture must fit the room wall that contains it. A room may accept a corridor only when the full corridor width can enter through a designated opening without exceeding the room boundary or eliminating the protected wall structure around it. A 4-cell corridor therefore requires a room with a compatible wall span; if no compatible aperture exists, placement backtracks or generation fails.

`Complexity` is a deterministic generation budget, not a vague preference. Before mission expansion, the generator derives explicit targets such as mission-node count, branch count, challenge density, and supporting-space allowance from the complexity setting and seed. Page dimensions, tile size, and style determine whether that fixed budget fits; they must not silently change the requested mission. The same settings and seed must produce the same budget. If the budget cannot be realized within the page and style constraints, generation fails rather than silently weakening the design.

## Shared mission model

The mission layer should use neutral terms. Mission nodes represent player-facing tasks or mission elements, never physical rooms:

- Start node
- Goal / objective
- Task
- Challenge
- Reward
- Key
- Lock

Branches, cycles, shortcuts, and secret passages are mission structures or relationships between nodes. Rooms, corridors, hubs, landmarks, and terminal spatial forms belong to the Space Grammar.

### Mission grammar layers

The initial Mission Grammar should remain deliberately shallow. Its v1 pattern layer is:

1. A pattern layer chooses `Opening`, `Progression`, `Loop`, and `Goal`. A `Loop` may be refined by a `Loop Challenge`.
2. A primitive layer expands those patterns into `Start`, `Goal`, `Task`, `Challenge`, `Reward`, `Key`, and `Lock` nodes with explicit dependencies.

The pattern layer preserves design intent; the primitive layer is the concrete graph consumed by the Space Grammar. We should avoid adding deeper layers until a real design problem requires them.

Each Mission Node receives a clear spatial anchor during realization. An anchor is a logical placement reference, not a promise that the node becomes exactly one room. A Space Grammar may expand an anchor into multiple supporting modules such as approach corridors, staging areas, sightlines, or connecting chambers. Multiple Mission Nodes may share one module only through an explicit production, such as a locked goal chamber; accidental co-location is not allowed.

The Mission Graph remains authoritative for gameplay topology during realization. Every gameplay-relevant traversable connection must correspond to an explicit mission relationship such as a branch, cycle, shortcut, or secret. Space Grammar may add supporting geometry and non-traversable visual connections, but an accidental traversable shortcut is invalid.

Locks reference key identifiers rather than abilities:

```text
Key A unlocks Lock A
Key B unlocks Locks B1 and B2
```

A key can be placed in a room, branch, secret, or other generated location. A lock may protect the critical route, an optional reward, a shortcut, or a secret. The generator must validate the dependency graph, but content can be assigned later.

Secrecy does not itself create a progression requirement. A secret connection is optional by default and must not be the only route to the Goal or another required node. It may become required only when the Mission Graph explicitly attaches a Lock to that connection and defines a corresponding Key, such as knowledge or a method for opening it. The abstract progression validator treats that case like any other key/lock dependency.

Mission relationships carry explicit spatial coupling:

- `tight`: the relationship constrains spatial order or relative placement. A key must be placed before its lock, and a reward may need to sit behind its challenge.
- `loose`: the relationship remains part of the mission and validation model, but the Space Grammar has broad freedom in where it realizes the connected nodes.

The mission grammar decides the coupling when it creates a relationship. The Space Grammar must honor tight coupling while treating loose coupling as a preference rather than a layout requirement.

## Foundational mission patterns

The original mission vocabulary remains the foundation of the system. The Loop Challenges below add variations; they do not replace these patterns.

| Pattern | Mission meaning |
|---|---|
| Critical Path | A sequence of required tasks connecting Start to Goal. |
| Branch and Return | An optional route leaves the main progression, offers a challenge or reward, and reconnects later. |
| Lock and Key | A Lock blocks a route or objective until its corresponding Key has been acquired. |
| Reward Detour | A side route contains a useful Key, reward, or information in exchange for additional travel or risk. |
| Shortcut / Cycle | A later connection makes a return journey shorter or changes how previously visited space is traversed. |
| Secret Passage | A hidden connection reveals an alternate route, reward, or piece of information. It is optional unless the Mission Graph explicitly models it as a Lock with a corresponding Key. |
| Dead End | A terminal route that may contain a challenge, reward, clue, or environmental payoff without requiring another connection. |
| Landmark / Hub | A memorable node organizes several routes and helps the player understand the surrounding space. |
| Goal / Objective | The final task, destination, vault, staircase, or other completion condition. |

## Mission patterns: loop challenges

Loops should be generated and reasoned about as first-class mission structures. A loop is not simply an extra edge added after the map is built; it is an opportunity to define a particular challenge, risk, reveal, or change in the return journey.

Each loop challenge operates on named roles within a loop:

- `anchorNode`: the stable node that begins or organizes the loop;
- `challengeNode`: the node or route where the main test is introduced;
- `objectiveNode`: the vault, staircase, reward, or other destination of interest;
- `keyNode`: the node where a corresponding key can be placed when the pattern requires one.

| Pattern | Mission transformation |
|---|---|
| Alternate Paths | Both routes through the loop remain valid. Insert an additional challenge node between `challengeNode` and `objectiveNode`. |
| Hidden Shortcut | Make the route between `anchorNode` and `challengeNode` a secret passage. |
| Dramatic Arc | Make the route between `challengeNode` and `objectiveNode` visibly impassable while allowing the player to see the destination. Add an impassable obstacle. |
| Dangerous Route | Mark the `challengeNode` route as the dangerous challenge. The alternate route is safer. |
| Lock & Key | Create one matching Key/Lock pair. Put the required Lock on the door into `objectiveNode`, keep a bypass around that room, and leave the Key reachable before the Lock is opened. |
| Unknown Return | Create the required locked Goal and matching Key room. Represent `Start → locked door into Goal room → bypass around Goal room → one-way valve → Key room → one or more supporting rooms → Start → the same door → Goal room, now open`; the valve only permits travel toward the Key room, and its direction is explicit Space metadata. |
| Patrolled Cycle | Treat both routes in the loop as dangerous because a powerful encounter patrols the cycle. |
| Gambit | Move `objectiveNode` to the opposite side of the loop. Make the route from `anchorNode` to `objectiveNode` dangerous; make the other route longer but safer. |
| Hub & Spoke | Remove the loop connections and connect the `anchorNode` room to the other loop rooms, making it the hub. |
| Double Lock | Create two distinct matching Key/Lock pairs, with both required Locks on the objective-room entry and a reachable bypass to each Key. |

Each loop selects and applies its own Loop Challenge. An optional per-loop selection overrides the global preference; a concrete global preference fills every unspecified loop, while `Varied` chooses uniformly from compatible challenges using the seed. `Varied` is the default when loops exist, repeats are valid, and no diversity heuristic is applied. A selection list longer than the requested loop count is invalid. An explicitly selected challenge is not substituted if placement fails; the request is reported impossible.

These patterns are independent of the selected spatial style. A Critical Spine space can contain a Hidden Shortcut, a Central Hub space can contain a Gambit, and a Branch-and-merge space can contain a Patrolled Cycle. The style determines how the pattern is spatially realized; the mission grammar determines what each loop means.

Every style must support the complete mission vocabulary, including every Loop Challenge. Styles may use different spatial realizations and production weights, but they may not omit, silently downgrade, or reinterpret a requested mission pattern. If a style cannot fit the exact mission on the selected page, generation fails explicitly.

The first implementation should represent each pattern as a graph rewrite with explicit preconditions and outputs. A challenge may preserve the cycle, expand it, rewire it, or consume it entirely when that is the purpose of the pattern. For example, `Hidden Shortcut` changes an existing edge's access type, `Double Lock` adds two dependencies to one objective, and `Hub & Spoke` replaces the cycle with a hub and spoke connections. This preserves the meaning of the pattern when the resulting mission is placed using different space grammars.

The first Mission Grammar implementation should make every foundational pattern and every Loop Challenge executable. Each pattern needs at least one conservative, valid graph rewrite; additional alternative rewrites can be added later for variety. The initial implementation is therefore complete in semantic coverage without requiring a large catalog of mission rules.

The generated Mission and Space graphs are static representations. They may record locks, one-way connections, blocked returns, secrets, and other intended relationships, but they do not simulate runtime state changes or player actions.

The source description for `Unknown Return` is normalized here: it is a real Mission pattern, not metadata alone. The matching Key is placed in the Key room, the Goal lock is required, the one-way valve points toward the Key room, and the separate return route contains one or more supporting spatial rooms. No runtime state simulation is required.

## Style contract

The shared generator should accept:

- page dimensions and orientation;
- tile size;
- seed;
- requested complexity;
- loop preference and optional per-loop challenge selections;
- selected style;
- the selected Complexity Preset.

The mission grammar should produce:

- task and dependency nodes;
- generic key and lock identifiers;
- optional branches, rewards, secrets, and cycles;
- a goal condition;
- mission-level diagnostics.

The selected style grammar should then produce:

- a typed spatial-module plan;
- connections between module ports;
- placements for mission nodes and their associated keys or locks;
- graph relationships and route metadata;
- page-fit diagnostics;
- space-level validation diagnostics.

The shared system should provide one grammar engine, mission grammar primitives, module placement, tile rasterization, final validation, rendering, export, and generation-summary behavior. Each style supplies a distinct set of space-grammar productions and weights to that engine. A style should not need to know how the map is saved.

### Spatial modules and grammar productions

Spatial modules are the bridge between the mission and the tile grid. They are typed intermediate structures with connection ports and readable footprint constraints, produced by applying space-grammar rules. They are not a library of finished room templates. A production may add a small amount of space, introduce new connection markers, close a connection, or recursively grow an existing shape.

Initial module symbols may include:

- room;
- corridor;
- branch;
- junction;
- cycle;
- hub;
- gate;
- secret connection;
- changed or blocked return;
- terminal challenge.

A module records which mission symbol caused it to exist and, when applicable, which spatial anchor it realizes. A production can be rotated, reflected, resized, recursively applied, or selected with a style-specific weight. The placement stage chooses a compatible footprint and port alignment; the rasterization stage converts the resulting spatial construction into Floor, Wall, Water, and marker data on the Map.

The space grammar should operate on connection markers or other nonterminal spatial symbols. For example, a connection may be rewritten as a short corridor with a new frontier, a T-fork with two frontiers, or a closed wall. This gives us variety through composition and rule application rather than through a large collection of authored rooms.

Corridor intersections must be explicit spatial modules. A branch, T-junction, crossroad, or hub production declares which connections meet there and which Mission relationships they realize. Ordinary corridor placement may not overlap an existing corridor or create a new traversable crossing; such overlap is rejected as a possible shortcut or short circuit.

Semantic spatial types are retained as metadata until rasterization. When the map is written, the rasterizer resolves each type to the corresponding implemented floor or connection stamp—for example, a secret door, locked door, concealed door, or key marker—using the existing stamp catalog. The build must validate that every required semantic type has an implemented stamp, so normal generation never encounters a missing asset and never needs a generic fallback. A defensive runtime assertion may still report a corrupted or incomplete asset catalog.

Keys and Locks use their unique stamps on the map by default. Their identifiers and pairings, such as `Key A → Lock A`, remain in generation metadata, the inspector, and the summary. Printed text labels are optional presentation, not a requirement of the generated layout.

Corridor width is a weighted production choice rather than a fixed style constant. One-cell corridors are the normal connective tissue; two-cell corridors can signal a more important route, and four-cell corridors can signal a major passage, hub approach, or set-piece. Their increasing footprint and visual emphasis should make them increasingly rare, subject to page fit.

## Initial styles

### Critical Spine

A critical-path layout with deliberate return routes. The player follows a readable progression, then uses newly acquired keys to convert backtracking into shortcuts or alternate access.

Primary strength: pacing and legibility.  
Primary risk: the map can become too linear or predictable.

### Central Hub

A hub or radial layout in which the player repeatedly returns through a central landmark and opens access to different regions.

Primary strength: visible choice and strong spatial landmarks.  
Primary risk: the page may not have enough room for a convincing ring structure, especially at larger tile sizes.

### Branch-and-merge

A branch-and-merge layout in which the player discovers the relationship between regions through partial visibility, secrets, and converging routes.

Primary strength: mystery and organic exploration.  
Primary risk: it is harder to read and validate on a constrained printed page.

These are independent modes. They may eventually be joined by additional independent styles such as branching, nested loops, gauntlet, maze, or room-cluster layouts.

## Generation pipeline

```text
User-selected style and page settings
        ↓
Page-sized mission grammar
        ↓
Mission graph with generic keys, locks, tasks, branches, and cycles
        ↓
Style-specific space grammar
        ↓
Page-aware placement of typed spatial modules
        ↓
Tile rasterization and shared gameplay/geometry validation
        ↓
Tile carving, stamps, summary, and undoable map replacement
```

The mission graph should be planned before geometry is committed, but its grammar expansion must be bounded by the page budget. The shape grammar must retain references back to the mission symbols that caused each room, connection, key, lock, or reward to be placed. This lets the generation summary explain both the gameplay structure and its spatial realization. It must reject any gameplay-relevant traversable connection that has no corresponding Mission relationship.

Styles should not be mixed on one page by default. A user-selected style determines the shape grammar and its rule weights for the whole generation. Future styles may define their own internal phases, but that should be an explicit style design rather than an accidental hybrid.

### Placement search and commit

Spatial realization uses bounded deterministic backtracking. The mission graph remains fixed while the space grammar tries compatible productions, orientations, scales, and locations in a seeded order. A candidate placement is applied to a working generation state; if a later placement makes the plan impossible, the generator backtracks and tries the next candidate.

If the bounded search cannot realize the mission on the selected page, generation fails without replacing the user's current Map and reports an actionable diagnostic. A successful generation commits the complete tile result as one map replacement and one undoable history action.

Generation is a one-action user flow. The `Generate` command runs feasibility checks and bounded placement search automatically; it does not pause for a preflight confirmation. Heuristic capacity warnings may be included in the result, but they do not require the user to approve another step.

Failure is terminal for that request. The generator does not automatically reduce complexity, silently alter the mission, or offer a default retry with weakened goals; the user must deliberately change the inputs before generating again.

### Feasibility preflight

Before expanding and placing a mission, the generator should estimate whether the requested complexity can fit the selected page. The estimate considers the page grid, tile size, style production requirements, requested loop count, selected Loop Challenges, and minimum readable footprints.

Loop count is an exact generation contract: if the user requests three loops, a successful result contains three loops. The generator may report a recommended maximum or an unlikely-to-fit warning, but it must not silently reduce the requested count. If the exact request cannot be realized after bounded search, generation fails explicitly.

### Failure diagnostics

A failed generation should identify the stage and decision that could not be satisfied. At minimum, diagnostics should retain:

- style, seed, page dimensions, and tile size;
- requested complexity, loop count, and Loop Challenges;
- whether failure occurred during mission expansion, spatial placement, or tile rasterization;
- the mission node and grammar production being attempted;
- the candidate location or connection port involved;
- the rejected constraint, such as border, overlap, buffer, unreadable footprint, or unresolved connection;
- the number of backtracking steps and remaining alternatives.

The UI should present a concise failure summary with an expandable generation trace. Diagnostics should be reproducible from the displayed inputs without exposing a partial dungeon as a generated result.

## Shared validation

Successful generation should verify at least:

- all required geometry stays inside the page border;
- room interiors retain the one-cell Wall buffer except at designated connection apertures;
- designated room apertures match the width of their planned connecting corridors;
- unrelated rooms and hallways do not cross protected boundaries or merge accidentally;
- the map is connected according to the style’s intended rules;
- every critical lock has a reachable key;
- the goal is reachable after collecting the necessary keys;
- optional locks do not accidentally block the goal;
- declared loops are real routes rather than duplicate or trivial edges;
- secrets and optional branches do not create an unintended soft lock; a secret is required only when explicitly modeled as a key/lock dependency;
- room, corridor, key, lock, and label footprints remain readable at the selected tile size.

Key/lock solvability should be checked with abstract progression analysis over the static Mission and Space graphs. Starting from the Start node, the validator finds reachable Keys through currently open connections, unlocks their matching Locks, and repeats until no new progression is possible. Generation succeeds only if the Goal is reachable after this process. This analysis validates the design; it does not simulate runtime player actions or mutable game state.

## User controls

The first user-facing controls should be small and explicit, and shared across styles:

- generation style;
- seed;
- tile size and page orientation, using the existing map settings;
- named complexity preset (`Compact`, `Standard`, or `Dense`), with its exact deterministic budget visible in an inspector;
- requested loop count;
- loop preference;
- one Loop Challenge selector per requested loop.

Loop Challenge selection is independent per loop. Explicit per-loop choices take precedence; omitted entries use the global preference, and `Varied` chooses uniformly from compatible challenges using the seed. Repeated challenges are valid. Changing the loop count preserves choices by index, removes excess choices, and defaults new loops to `Varied`. Key/Lock dependencies are derived from the selected challenges, and legacy requests with independent key/lock counts are invalid. The selected style does not change mission-pattern weights.

The UI should show when a style cannot support the requested complexity on the selected page. Style-specific production weights and topology choices remain internal to the selected style in v1.

## Proposed implementation sequence

1. Refactor the current three prototypes so their progression data uses generic keys and locks.
2. Define a small mission graph grammar with at least one conservative rule for every foundational pattern and Loop Challenge, covering tasks, key/lock dependencies, branches, rewards, and cycles.
3. Keep the initial mission grammar to two levels: broad patterns, then primitive mission nodes.
4. Add a mission inspector that shows both the pattern expansion and primitive graph before spatial placement.
5. Define a style registry in which each style supplies space-grammar productions, weights, and placement preferences to the shared grammar engine.
6. Add style selection and page-budget diagnostics to the prototype lab.
7. Build the new spatial-module placement and tile-rasterization engine; do not use the legacy bottom-up room-growth algorithm as its core.
8. Add further styles only after the mission grammar, style contract, and page-fit behavior are stable.

## Open decisions

No unresolved proposal decisions remain from the current design review.

## Decision requested

Adopt independent, user-selected generation styles with a shared generic key/lock model and shared physical-page validation. Treat the current prototypes as style explorations, not competing ability systems or ingredients for one universal generator.

Add the Mission/Space split as the core architecture: generate a mission with graph grammar rules, then generate a page with a style-specific shape grammar that accommodates that mission.

Replace the legacy bottom-up dungeon generator with a mission-first pipeline using typed spatial modules as the intermediate representation before tile rasterization.

Keep the mission graph authoritative during spatial realization. The space grammar may try alternate productions and placements, but it may not silently delete, reorder, or reinterpret mission nodes, keys, locks, or Loop Challenges. If the fixed mission cannot fit, generation fails explicitly.

Use a shallow two-level Mission Grammar: broad mission patterns expand into primitive mission nodes before spatial realization.

Treat requested loop count as an exact contract and run a page-capacity feasibility preflight before spatial placement.

## References

- Joris Dormans, “Adventures in Level Design: Generating Missions and Spaces for Action Adventure Games,” PCGames 2010. [Workshop paper](https://pcgworkshop.com/archive/dormans2010adventures.pdf)
- Joris Dormans and Sander Bakkes, “Generating Missions and Spaces for Adaptable Play Experiences,” IEEE Transactions on Computational Intelligence and AI in Games, 2011. [Research copy](https://sander.landofsand.com/publications/Dormans_Bakkes_-_Generating_Missions_and_Spaces_for_Adaptable_Play_Experiences.pdf)
