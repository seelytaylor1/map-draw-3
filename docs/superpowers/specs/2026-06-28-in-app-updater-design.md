# In-App Updater Design

**Date:** 2026-06-28
**Status:** Approved

## Overview

Add automatic update checking and one-click install to Map Draw desktop builds using `tauri-plugin-updater`. End users who installed via the packaged installer see a notification when a new version is available and can install it without leaving the app.

## Section 1: Release Pipeline

### One-time local setup

Generate a signing keypair:

```sh
npm run tauri signer generate
```

- Store the **public key** in `tauri.conf.json` under `plugins.updater.pubkey`
- Store the **private key** as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`
- Store the **password** (if set) as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### `.github/workflows/release.yml` changes

| Field | Before | After |
|---|---|---|
| `tagName` | `build-${{ github.sha }}` | `app-v__VERSION__` |
| `releaseName` | `Map Draw ${{ github.sha }}` | `Map Draw v__VERSION__` |
| env | — | `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |

`tauri-action` resolves `__VERSION__` from `tauri.conf.json` at build time and automatically includes a signed `latest.json` in the release assets.

### Cutting a release

Bump `"version"` in `tauri.conf.json` and push to master. The action builds, signs, and publishes. No other steps required.

## Section 2: Tauri Config + Plugin

### `tauri.conf.json`

Add a `plugins` block:

```json
"plugins": {
  "updater": {
    "pubkey": "<generated-public-key>",
    "endpoints": [
      "https://github.com/seelytaylor/map-draw-3/releases/latest/download/latest.json"
    ]
  }
}
```

### `src-tauri/Cargo.toml`

Add dependency:

```toml
tauri-plugin-updater = "2"
```

### `src-tauri/src/lib.rs`

Register the plugin (alongside existing plugins):

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

Add a "Check for Updates" menu item under a new "Help" submenu, emitting a `menu-check-updates` event via the existing `on_menu_event` handler.

### Capabilities

Add `updater:default` to the app's capability permissions so the frontend can invoke updater commands.

## Section 3: Frontend Update UI

### `src/hooks/useUpdater.ts`

A hook that:
- Silently checks for an update on mount (non-blocking)
- Exposes state: `idle | checking | available | downloading | relaunch-pending | error`
- Exposes `checkForUpdate()` and `downloadAndInstall()` functions
- Tracks download progress (0–100%) for display
- Is a no-op when `!isTauri()` (web/dev mode)
- Listens for the `menu-check-updates` event to trigger a manual check

### Update notification

A compact element rendered at the bottom of the sidebar, visible only when state is `available`, `downloading`, or `relaunch-pending`:

- **available:** `"v0.2.0 available — Install & Relaunch"` button
- **downloading:** progress indicator (percentage)
- **relaunch-pending:** `"Relaunch to finish"` button (calls `relaunch()`)
- **error:** small error message with a retry link

No UI is rendered in the `idle` or `checking` states — the update check is invisible unless something is found.

### Menu integration

The existing `onMenuEvent` listener in `App.tsx` handles `menu-check-updates` by calling `checkForUpdate()` from the hook. This gives users a manual trigger at any time via Help > Check for Updates.

## Out of Scope

- Differential/delta updates
- Update scheduling or deferred install
- Rollback
