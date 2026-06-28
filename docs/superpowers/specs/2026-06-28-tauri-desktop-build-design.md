# Tauri Desktop Build — Design Spec

**Date:** 2026-06-28
**Status:** Approved

## Goal

Package map-draw-3 as a native desktop application for offline use on Windows, Mac, and Linux. Add native file Open/Save dialogs so maps can be persisted as `.json` files on disk. Distribute via GitHub Releases.

---

## Architecture

The existing project structure is unchanged. Tauri adds one new sibling directory:

```
map-draw-3/
  src/              ← unchanged React/Konva app
  src-tauri/        ← Tauri Rust core, config, icons
    src/
      main.rs       ← Tauri app entry, registers commands
      lib.rs        ← file open/save Tauri commands
    tauri.conf.json ← window size, app name, bundle IDs
    Cargo.toml      ← Rust dependencies
  dist/             ← Vite builds here (Tauri reads it)
  package.json      ← tauri-cli dev dependency + scripts
```

**Build pipeline:** `vite build` → Tauri reads `dist/` → packages into native binary.

**Dev workflow:** `npm run tauri dev` runs Vite's dev server and opens a native window pointing at it. Hot reload continues to work as today.

**Tauri plugins added:**
- `tauri-plugin-dialog` — native Open/Save file picker dialogs
- `tauri-plugin-fs` — read/write files to disk

---

## File Menu & Commands

A native OS menu bar is defined in Rust:

```
File
  New                 Ctrl/Cmd+N   — clears canvas; prompts if unsaved changes
  Open...             Ctrl/Cmd+O   — opens .json file picker, loads map
  ─────
  Save                Ctrl/Cmd+S   — saves to current path; falls through to Save As if none
  Save As...          Ctrl/Cmd+Shift+S — opens save dialog, writes .json
  ─────
  Export PNG...       Ctrl/Cmd+E   — saves PNG to user-picked path
```

**Dirty state tracking:** Uses the existing undo history (`src/history.ts`) to detect unsaved changes. If the user tries to open a new file, load a map, or close the window with unsaved work, a native confirm dialog fires before discarding.

**Current file path:** Stored as `currentFilePath: string | null` in React state. Save uses it directly; Save As updates it on success. The window title bar shows: `map-draw-3 — dungeon.json` (or `map-draw-3 — Untitled` when no file is open).

---

## File Format & Serialization

The save format is the existing JSON output from `src/serialization.ts`. No new format is introduced.

**Save flow:**
1. User triggers Save/Save As → Tauri opens native save dialog filtered to `*.json`
2. Frontend calls `serialize(drawingState)` → JSON string
3. Frontend calls `invoke('save_file', { path, content })` → Rust writes to disk via `tauri-plugin-fs`

**Open flow:**
1. User triggers Open → Tauri opens native file picker filtered to `*.json`
2. Rust reads file, returns content string to frontend
3. Frontend calls `deserialize(content)` → restores drawing state
4. `currentFilePath` is set, title bar updates

**Export PNG flow:**
Existing canvas-to-PNG export logic stays in the frontend. Instead of a browser download, PNG bytes are sent to Rust via `invoke('save_file_binary', { path, bytes })` and written to the user-picked path.

**Error handling:** File read failures and JSON parse errors surface as native error dialogs rather than silent failures.

---

## Distribution & CI

**Local build:**
```
npm run tauri build
```
Outputs per platform (in `src-tauri/target/release/bundle/`):
- Windows: `.msi` + `.exe`
- Mac: `.dmg` + `.app`
- Linux: `.AppImage` + `.deb`

**GitHub Actions release workflow** (`.github/workflows/release.yml`):
- Triggers on git tag push (e.g. `v1.0.0`)
- Spins up three parallel runners: `windows-latest`, `macos-latest`, `ubuntu-latest`
- Each builds its native installer
- All three are uploaded as GitHub Release assets automatically

Cutting a release:
```
git tag v1.0.0 && git push --tags
```

**Code signing:**
- Windows and Linux unsigned builds work without warnings
- Mac will show "unidentified developer" on first open; right-click → Open bypasses it
- Apple notarization (removes the warning permanently) requires a $99/yr Apple Developer account — deferred for now

---

## Out of Scope

- Auto-updater (can be added later via `tauri-plugin-updater`)
- Mac notarization / Windows EV signing
- Any changes to the drawing logic, rendering, or serialization format
