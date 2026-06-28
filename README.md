# Map Draw 3

A browser-based dungeon map editor for creating tabletop RPG battle maps. Draw floors, place stamps (doors, traps, stairs), toggle 3D effects, and export high-resolution PNG maps.

<img width="905" height="589" alt="image" src="https://github.com/user-attachments/assets/9d9b36f1-1395-443c-bde5-322b5a2b9f17" />

## Use It

- **Live in browser**: [seelytaylor1.github.io/map-draw-3](https://seelytaylor1.github.io/map-draw-3/) — always the latest build
- **Desktop app**: download the installer for your platform from the [latest release](../../releases/latest)
  - Windows: `.msi` or `.exe`
  - macOS: `.dmg`
  - Linux: `.AppImage` or `.deb`
- **Standalone HTML**: grab `index.html` from the release and open it in any browser — no install needed

## Features

- **Draw & Paint**: Brush tool with adjustable size for painting floors and walls
- **Rough Mode**: Three-click cave generation with noise-based edge deformation
- **Stamps**: Place doors, traps, stars, stairs, and bars on the map grid
- **3D Effect**: Toggle extruded side faces for a 3D appearance
- **Isometric View**: Preview maps in isometric projection
- **Undo/Redo**: Full history support for all edits
- **Save/Load**: Export and import maps as JSON files
- **High-Res Export**: Generate 300dpi PNG output

## Development

**Requirements**: Node.js 16+ and npm 7+

```bash
git clone https://github.com/seelytaylor1/map-draw-3.git
cd map-draw-3
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # single self-contained dist/index.html
npm test           # Vitest unit tests
```

## Technologies

- **React** 19 with TypeScript
- **Vite** for fast development and optimized builds
- **Konva** for canvas rendering
- **react-konva** for React integration with Konva
- **Vitest** for unit testing
- **Playwright** for E2E testing

## Project Structure

- `src/` — Application source code
  - `App.tsx` — Main component
  - `grid.ts` — Tile grid logic
  - `stamps.ts` — Stamp placement and rendering
  - `iso.ts` — Isometric projection
  - `exportShapes.ts` — PNG export
  - `serialization.ts` — Save/load functionality
  - `history.ts` — Undo/redo implementation
- `docs/` — Design specs and planning
- `index.html` — Entry point
- `vite.config.ts` — Vite configuration
