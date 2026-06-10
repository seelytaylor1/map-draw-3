# Domain Glossary

## Map
The full drawing canvas, defined in physical inches. Default dimensions are 8.5×11" landscape. Everywhere on a Map begins as Wall. The user paints Floor to create dungeon rooms and corridors.

## Tile
The atomic unit of the Map grid. One square cell. Fixed at 60px per tile at 300dpi output (5 tiles per inch). Tile size is a single constant; changing it resets the Map.

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
A Stamp representing an upright dungeon prop. Types: archway, bigpillar, iron-door, passageway-arch, pillar, portculis, ramp, well, wood-door, wood-doubledoor. In Iso View, rendered as a Billboard anchored to the tile's front-bottom corner so it appears to stand on the floor. In Top-Down View, rendered as a ghost (reduced opacity) since the object has no meaningful top-down representation.

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
A render pass that produces a PNG at 300dpi by re-rendering the Map at full resolution (60px per tile) into an off-screen canvas. The working viewport renders at screen resolution.

## Water
A third TileState (value 2) that can be painted directly onto any tile, including Wall. Painted and erased with the Brush in the same way as Floor — the toolbar paint-mode selector is a three-state control: Floor | Water | Erase. Left-click paints the selected state; right-click always erases to Wall regardless of selected mode. Water tiles render with a fixed default color (muted blue). In Top-Down View, Water looks different from Floor by color alone — no inset or shadow. In Iso View, the Water diamond is shifted 4px downward relative to Floor, giving the appearance of a lower elevation. When the 3D Effect is enabled, Floor tiles adjacent to Water render their side face (acting as a stone bank); in the Iso Scene the Water surface draws after the bank, covering its submerged portion.

## Step Run
A first-class placed element that geometrically connects two adjacent Z Levels. Occupies a fixed 2×1 tile footprint starting at its origin tile and extending in its descent direction (N/E/S/W); the origin tile sits flush with the floor of the run's Z Level and the run descends to Z−1. Placed with the Steps tool at the Active Z Level with direction E; selectable, rotatable (cycles descent direction N→E→S→W), and deletable. Not a Stamp — it lives in its own `steps` list with its own geometry renderer.

## Tread
One step of a Step Run. A Step Run renders as 6 Treads, each dropping 1/6 of the Z Step Height, so the final riser lands exactly on the Z−1 floor plane. In Iso View each Tread renders a top quad plus a riser face; in Top-Down View Treads render as thin rectangles perpendicular to the descent direction, derived from the same run-local geometry so the two views cannot drift. When the 3D Effect is enabled, each Tread also renders an Extruded Side Face along the run's exposed edge — south for E/W runs, east for N/S runs — and Top-Down View adds a face band along that same edge.

## Save File
A JSON file representing the full Map state: the Level Stack (all Z Level grids), Stamp positions/types/rotations/Z levels, Step Runs, Canvas dimensions, and Wall color/opacity settings. The Level Stack is serialized as an object with string-keyed Z Level integers, each value being a flat number array. Old save files with a flat `grid` key (single-layer format) are loaded as Z=0; saves without a `steps` key load with no Step Runs.

## Undo / Redo
History is a stack of full Map snapshots (Level Stack + Stamps + Step Runs). One snapshot is taken per completed gesture: mouseup for Brush strokes, and each Stamp or Step Run action (place, move, rotate, scale, mirror, delete) individually. Snapshots capture the full Level Stack across all Z Levels.
