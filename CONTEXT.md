# Domain Glossary

## Map
The full drawing canvas, defined in physical inches. Default dimensions are 8.5×11" landscape. Everywhere on a Map begins as Wall. The user paints Floor to create dungeon rooms and corridors.

## Tile
The atomic unit of the Map grid. One square cell. Fixed at 60px per tile at 300dpi output (5 tiles per inch). Tile size is a single constant; changing it resets the Map.

## Tile Grid
A 2D array of cell states — the authoritative data model for the Map. Each cell is either Wall or Floor. The grid dimensions are derived from canvas dimensions in inches times tiles-per-inch.

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
A placeable symbol snapped to the Tile Grid. Types: door, trap, star, bars, stairs. Each Stamp type has a fixed size in tiles. Stamps live on a separate layer from the Tile Grid and can be moved, rotated, and deleted individually after placement. Rendered as SVG icons.

## Top-Down View
The default editing view. All drawing tools are active in this view.

## Iso View
A preview-only isometric projection of the Map. Drawing tools are disabled. The view is a render pass that applies a coordinate transform to the current Map state. Not a separate data model.

## 3D Effect
A toggleable visual mode. Floor regions render with Extruded Side Faces — a dark band along the bottom and right edges of each Floor region, giving the appearance of a thick stone slab floating in space. Visible in both Top-Down View and Iso View.

## Extruded Side Faces
The geometry produced by the 3D Effect. Derived from the Floor boundary at render time — not stored in the Tile Grid.

## Canvas
The physical output dimensions of the Map, configured in inches. Resizing crops Tiles that fall outside the new bounds or adds Wall Tiles around the edges. Existing Tiles within the remaining area are preserved.

## Export
A render pass that produces a PNG at 300dpi by re-rendering the Map at full resolution (60px per tile) into an off-screen canvas. The working viewport renders at screen resolution.

## Save File
A JSON file representing the full Map state: Tile Grid array, Stamp positions/types/rotations, Canvas dimensions, and Wall color/opacity settings. Can be loaded to resume a session.

## Undo / Redo
History is a stack of full Tile Grid snapshots. One snapshot is taken per completed gesture: mouseup for Brush strokes, and each Stamp action (place, move, rotate, delete) individually.
