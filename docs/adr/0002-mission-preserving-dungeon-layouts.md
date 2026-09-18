# Mission-preserving dungeon layouts

Status: accepted

## Problem

The first mission-first implementation placed identical 3×3 anchors and routed
corridors without wall buffers. Its fallback reused existing corridors, and its
validator exempted crossings with cycle metadata, common endpoints, or junction
flags. Sideways contact was not checked. Consequently a solvable abstract
mission did not establish that its carved map preserved the same progression.
Only one marker was emitted for a lock, even when it guarded two entrances.

The mission audit also found an unlocked entrance in Double Lock, an orphaned
room in Hub & Spoke, and progression analysis that treated optional locks as
open and ordinary passages as one-way.

## Decision

Keep the mission fixed throughout spatial search. A seeded, bounded placement
search minimizes graph-edge length and crossings on reserved room slots, then
routes connections through available room doorways with a multi-source breadth
first search. Up to 32 candidates are considered; a failed request still leaves
the current map untouched. Placement failures are retained in the inspector.

Room dimensions vary with available space and required exit count. Rectangular,
chamfered, and cruciform chambers provide different silhouettes; goals and hubs
receive larger footprints. Rooms with many connections reserve larger wall
spans. Central Hub attaches its branches and loop approaches to Start, while
Branch-and-merge identifies the actual convergence room as its junction. Unknown
Return subdivides its declared return edge through a supporting room.

Every corridor interior has a wall buffer. Only its declared doorways may touch
rooms. Neither loop membership nor junction metadata permits an incidental
crossing or contact. The validator rejects those contacts independently of the
router. Every spatial segment, including support-room segments, must route
successfully. Lock markers appear at every guarded entrance, oriented to the
local corridor segment. Seeded room encounter rolls produce empty rooms on
1–3, monsters on 4–5, and traps on 6. Every room independently has a 2-in-6
chance of a Chest, which can coexist with any encounter. Loop Challenge rewards
also place a Chest in the Goal room. Seeded corridor condition rolls produce
open, flooded, trapped, or hazardous passages; floods use traversable Water
tiles. Each unguarded room aperture has a 3-in-6 chance of a decorative door
on the first hallway tile outside the room, while corridors with 5–9 interior
tiles have a 3-in-6 chance of a mid-door and corridors with 10 or more have a
5-in-6 chance. Door styles include single,
double, portcullis, and trapdoor stamps. Locked doors remain tied to explicit
Key/Lock relationships.

Double Lock merges both approaches before two serial gates. Hub & Spoke retains
all former loop rooms as spokes. Static progression honors both directions of
ordinary passages, explicit one-way valves, and closed optional locks.

## Verification and limits

`src/dungeonGeometry.test.ts` independently floods committed floor tiles with
closed doors and directed valves. It checks every challenge/style combination,
all-room reachability, and the inability to enter locked objectives when either
required key is withheld. Other checks cover seeded replay, shape/size variation,
invalid shared-cycle crossings, marker counts, and even-width footprint expansion.

`npx vite-node scripts/analyze-mission-dungeons.ts` runs a reproducible 36-case
page-size sweep and writes an HTML review sheet under `.scratch/dungeon-review/`.

Placement remains a bounded heuristic, not a proof that every planar mission
fits a given page. Crowded requests may fail explicitly. Corridors currently use
one-cell widths; wider footprint support is not a weighted production policy.
Tiny pages can only support small chambers. The generator records encounter and
door rolls as static map content; it does not simulate play, and semantic stamps
are map notation rather than runtime door mechanics.
