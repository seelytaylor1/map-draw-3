# In-App Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic update checking and one-click install to Map Draw desktop builds using `tauri-plugin-updater`, surfaced as a sidebar notification and a Help menu item.

**Architecture:** `tauri-plugin-updater` (Rust) exposes update commands to the frontend via Tauri's capability system. A `useUpdater` React hook manages update state (idle → checking → available → downloading → relaunch-pending) and is called once in `App`. An `UpdateNotification` component renders only when a non-idle state is active. All Tauri API calls are wrapped in `tauri.ts` following the existing abstraction pattern.

**Tech Stack:** Tauri 2, `tauri-plugin-updater 2`, `tauri-plugin-process 2`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, React 19, Vitest, @testing-library/react

## Global Constraints

- Tauri 2.x — all plugin versions must be `"2"` range
- All Tauri API calls go through `src/tauri.ts`, not called directly in components or hooks
- `isTauri()` guard required before every Tauri call; functions must be no-ops in browser/dev mode
- New UI renders nothing when no update is available — zero visual footprint at steady state
- Semver tag format: `app-v__VERSION__` (resolved by tauri-action from `tauri.conf.json`)
- GitHub repo: `https://github.com/seelytaylor/map-draw-3`

---

### Task 1: Signing Keypair + Release Pipeline

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `TAURI_SIGNING_PRIVATE_KEY` secret (GitHub), public key string in `tauri.conf.json`

- [ ] **Step 1: Generate the signing keypair**

Run in the project root:

```sh
npm run tauri signer generate
```

This prints two values:
- **Public key** — a base64 string starting with `dW50cnVzdGVkIGNvbW1lbnQ`
- **Private key** — a longer base64 string

Copy both somewhere safe. You only see them once.

- [ ] **Step 2: Add secrets to GitHub**

In the GitHub repo → Settings → Secrets and variables → Actions, create two secrets:

| Name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | The private key string from Step 1 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Leave blank (or the password if you set one) |

- [ ] **Step 3: Update the release workflow**

Edit `.github/workflows/release.yml`. Replace the `Build and release` step's `with` block and add the signing env vars:

```yaml
      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: app-v__VERSION__
          releaseName: 'Map Draw v__VERSION__'
          releaseBody: 'See the included installers for your platform.'
          releaseDraft: false
          prerelease: false
```

- [ ] **Step 4: Add pubkey and updater endpoint to tauri.conf.json**

Edit `src-tauri/tauri.conf.json`. Add a `plugins` key at the top level (after `"bundle"`), substituting your actual public key from Step 1:

```json
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/seelytaylor/map-draw-3/releases/latest/download/latest.json"
      ]
    }
  }
```

The full file should look like:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Map Draw",
  "version": "0.1.0",
  "identifier": "com.seelydesigns.mapdraw",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Map Draw",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "debugApplicationIdSuffix": ".debug"
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/seelytaylor/map-draw-3/releases/latest/download/latest.json"
      ]
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml src-tauri/tauri.conf.json
git commit -m "feat: configure updater signing and semver release tags"
```

---

### Task 2: Rust Dependencies + Capabilities

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: `tauri-plugin-updater` and `tauri-plugin-process` available for registration in Task 3
- Produces: `updater:default` and `process:allow-relaunch` permissions granted to the frontend

- [ ] **Step 1: Add Cargo dependencies**

Edit `src-tauri/Cargo.toml`. Add two lines to `[dependencies]`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Install npm packages**

```sh
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

Expected: packages added to `node_modules` and `package.json` dependencies.

- [ ] **Step 3: Add permissions to capabilities**

Edit `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default app capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-write-file",
    "updater:default",
    "process:allow-relaunch"
  ]
}
```

- [ ] **Step 4: Verify Cargo compiles**

```sh
npm run tauri build -- --no-bundle
```

Expected: Rust compilation succeeds. (Frontend build will also run — that's fine.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "feat: add tauri-plugin-updater and tauri-plugin-process dependencies"
```

---

### Task 3: Rust Backend — Plugin Registration + Help Menu

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `tauri-plugin-updater` and `tauri-plugin-process` (registered as Cargo deps in Task 2)
- Produces: `menu-check-updates` event emitted to frontend when Help > Check for Updates is clicked

- [ ] **Step 1: Update lib.rs**

Replace the entire contents of `src-tauri/src/lib.rs`:

```rust
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let event_name = match event.id().as_ref() {
                    "new"           => "menu-new",
                    "open"          => "menu-open",
                    "save"          => "menu-save",
                    "save-as"       => "menu-save-as",
                    "export-png"    => "menu-export-png",
                    "quit"          => "menu-quit",
                    "check-updates" => "menu-check-updates",
                    _               => return,
                };
                handle.emit(event_name, ()).ok();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let new_item     = MenuItem::with_id(app, "new",        "New",           true, Some("CmdOrCtrl+N"))?;
    let open_item    = MenuItem::with_id(app, "open",       "Open...",       true, Some("CmdOrCtrl+O"))?;
    let sep1         = PredefinedMenuItem::separator(app)?;
    let save_item    = MenuItem::with_id(app, "save",       "Save",          true, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(app, "save-as",    "Save As...",    true, Some("CmdOrCtrl+Shift+S"))?;
    let sep2         = PredefinedMenuItem::separator(app)?;
    let export_item  = MenuItem::with_id(app, "export-png", "Export PNG...", true, Some("CmdOrCtrl+E"))?;
    let sep3         = PredefinedMenuItem::separator(app)?;
    let quit_item    = MenuItem::with_id(app, "quit",       "Quit",          true, Some("CmdOrCtrl+Q"))?;

    let file_menu = Submenu::with_items(app, "File", true, &[
        &new_item,
        &open_item,
        &sep1,
        &save_item,
        &save_as_item,
        &sep2,
        &export_item,
        &sep3,
        &quit_item,
    ])?;

    let check_updates_item = MenuItem::with_id(app, "check-updates", "Check for Updates...", true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[
        &check_updates_item,
    ])?;

    Menu::with_items(app, &[&file_menu, &help_menu])
}
```

- [ ] **Step 2: Verify Rust compiles**

```sh
cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register updater/process plugins and add Help > Check for Updates menu item"
```

---

### Task 4: useUpdater Hook

**Files:**
- Modify: `src/tauri.ts`
- Create: `src/hooks/useUpdater.ts`
- Create: `src/hooks/useUpdater.test.ts`

**Interfaces:**
- Consumes: `isTauri`, `onMenuEvent` from `src/tauri.ts`
- Consumes: `check` from `@tauri-apps/plugin-updater`
- Consumes: `relaunch` from `src/tauri.ts` (added in this task)
- Produces:
  ```typescript
  export type UpdaterState =
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'available'; version: string }
    | { status: 'downloading'; progress: number }
    | { status: 'relaunch-pending' }
    | { status: 'error'; message: string }

  export function useUpdater(): {
    state: UpdaterState
    checkForUpdate: () => Promise<void>
    downloadAndInstall: () => Promise<void>
  }
  ```

- [ ] **Step 1: Add relaunch to tauri.ts**

Append to `src/tauri.ts`:

```typescript
import { relaunch as tauriRelaunch } from '@tauri-apps/plugin-process'

export async function relaunch(): Promise<void> {
  if (!isTauri()) return
  await tauriRelaunch()
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/hooks/useUpdater.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdater } from './useUpdater'

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('../tauri', () => ({
  isTauri: vi.fn().mockReturnValue(true),
}))

import { check } from '@tauri-apps/plugin-updater'
import { isTauri } from '../tauri'

const mockCheck = vi.mocked(check)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
})

describe('useUpdater', () => {
  it('starts idle', async () => {
    mockCheck.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdater())
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions to idle when no update available', async () => {
    mockCheck.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions to available when update found', async () => {
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: vi.fn() })
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'available', version: '0.2.0' })
  })

  it('transitions to error when check throws', async () => {
    mockCheck.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'error', message: 'network failure' })
  })

  it('transitions to relaunch-pending after successful download', async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined)
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: mockDownloadAndInstall })
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    await act(async () => { await result.current.downloadAndInstall() })
    expect(result.current.state.status).toBe('relaunch-pending')
  })

  it('is a no-op when not in Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    expect(mockCheck).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```sh
npm test -- src/hooks/useUpdater.test.ts
```

Expected: all tests fail with "Cannot find module './useUpdater'".

- [ ] **Step 4: Implement useUpdater**

Create `src/hooks/useUpdater.ts`:

```typescript
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '../tauri'

export type UpdaterState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; progress: number }
  | { status: 'relaunch-pending' }
  | { status: 'error'; message: string }

export function useUpdater(): {
  state: UpdaterState
  checkForUpdate: () => Promise<void>
  downloadAndInstall: () => Promise<void>
} {
  const [state, setState] = useState<UpdaterState>({ status: 'idle' })
  const updateRef = useRef<Update | null>(null)

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return
    setState({ status: 'checking' })
    try {
      const update = await check()
      updateRef.current = update
      if (update) {
        setState({ status: 'available', version: update.version })
      } else {
        setState({ status: 'idle' })
      }
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    let contentLength = 0
    let downloaded = 0
    setState({ status: 'downloading', progress: 0 })
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? 0
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength
        const progress = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0
        setState({ status: 'downloading', progress })
      }
    })
    setState({ status: 'relaunch-pending' })
  }, [])

  useEffect(() => {
    checkForUpdate()
  }, [checkForUpdate])

  return { state, checkForUpdate, downloadAndInstall }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```sh
npm test -- src/hooks/useUpdater.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tauri.ts src/hooks/useUpdater.ts src/hooks/useUpdater.test.ts
git commit -m "feat: add useUpdater hook with checking, downloading, and relaunch states"
```

---

### Task 5: UpdateNotification Component + App Wiring

**Files:**
- Create: `src/ui/UpdateNotification.tsx`
- Create: `src/ui/UpdateNotification.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `UpdaterState` from `src/hooks/useUpdater.ts`
- Consumes: `useUpdater` hook from `src/hooks/useUpdater.ts`

- [ ] **Step 1: Write the failing component tests**

Create `src/ui/UpdateNotification.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateNotification } from './UpdateNotification'
import type { UpdaterState } from '../hooks/useUpdater'

const noop = vi.fn()

describe('UpdateNotification', () => {
  it('renders nothing when idle', () => {
    const { container } = render(
      <UpdateNotification state={{ status: 'idle' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when checking', () => {
    const { container } = render(
      <UpdateNotification state={{ status: 'checking' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows version and install button when available', () => {
    render(
      <UpdateNotification state={{ status: 'available', version: '0.2.0' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('calls onInstall when install button clicked', async () => {
    const onInstall = vi.fn()
    render(
      <UpdateNotification state={{ status: 'available', version: '0.2.0' }} onInstall={onInstall} onRelaunch={noop} />
    )
    await userEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('shows progress when downloading', () => {
    render(
      <UpdateNotification state={{ status: 'downloading', progress: 42 }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/42%/)).toBeInTheDocument()
  })

  it('shows relaunch button when relaunch-pending', async () => {
    const onRelaunch = vi.fn()
    render(
      <UpdateNotification state={{ status: 'relaunch-pending' }} onInstall={noop} onRelaunch={onRelaunch} />
    )
    const btn = screen.getByRole('button', { name: /relaunch/i })
    await userEvent.click(btn)
    expect(onRelaunch).toHaveBeenCalledOnce()
  })

  it('shows error message when error', () => {
    render(
      <UpdateNotification state={{ status: 'error', message: 'network failure' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/network failure/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```sh
npm test -- src/ui/UpdateNotification.test.tsx
```

Expected: all tests fail with "Cannot find module './UpdateNotification'".

- [ ] **Step 3: Implement UpdateNotification**

Create `src/ui/UpdateNotification.tsx`:

```tsx
import type { UpdaterState } from '../hooks/useUpdater'

export function UpdateNotification({ state, onInstall, onRelaunch }: {
  state: UpdaterState
  onInstall: () => void
  onRelaunch: () => void
}) {
  if (state.status === 'idle' || state.status === 'checking') return null

  return (
    <div className="update-notification">
      {state.status === 'available' && (
        <>
          <span>v{state.version} available</span>
          <button className="btn btn-primary" onClick={onInstall}>Install &amp; Relaunch</button>
        </>
      )}
      {state.status === 'downloading' && (
        <span>Downloading… {state.progress}%</span>
      )}
      {state.status === 'relaunch-pending' && (
        <button className="btn btn-primary" onClick={onRelaunch}>Relaunch to finish</button>
      )}
      {state.status === 'error' && (
        <span className="update-error">{state.message}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```sh
npm test -- src/ui/UpdateNotification.test.tsx
```

Expected: all 7 tests pass.

- [ ] **Step 5: Wire useUpdater into App.tsx**

In `src/App.tsx`, add the import at the top with the other hook/ui imports:

```typescript
import { useUpdater } from './hooks/useUpdater'
import { UpdateNotification } from './ui/UpdateNotification'
```

Also add `relaunch` to the existing tauri import line:

```typescript
import { isTauri, openJsonFile, saveJsonFile, saveJsonFileAs, savePngFile, setWindowTitle, onMenuEvent, onCloseRequested, confirmDialog, closeWindow, relaunch } from './tauri'
```

Inside the `App` function body, add the hook call near the other hooks (after the existing `useStampImages` call is a good spot):

```typescript
const { state: updaterState, checkForUpdate, downloadAndInstall } = useUpdater()
```

In the existing menu event setup block (around line 1182), add the `menu-check-updates` listener alongside the others. The block already has `menu-new`, `menu-open`, etc — add one more line:

```typescript
unlisteners.push(await onMenuEvent('menu-check-updates', checkForUpdate))
```

Find the sidebar JSX (the `<div className="sidebar">` or equivalent) and add the notification at the bottom, just before the closing tag. `onRelaunch` calls `relaunch` from `tauri.ts`, which wraps `@tauri-apps/plugin-process`'s `relaunch()`:

```tsx
<UpdateNotification
  state={updaterState}
  onInstall={downloadAndInstall}
  onRelaunch={relaunch}
/>
```

- [ ] **Step 6: Add update-notification styles**

The component uses `update-notification`, `btn`, `btn-primary`, and `update-error` class names. `btn` and `btn-primary` already exist (see `controls.tsx`). Add the update-notification styles to the appropriate CSS file (wherever other sidebar utility styles live — search for `.section` in the CSS files to find the right one):

```css
.update-notification {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
}

.update-error {
  color: #f87171;
  font-size: 11px;
}
```

- [ ] **Step 7: Run all tests**

```sh
npm test
```

Expected: all tests pass, no regressions.

- [ ] **Step 8: Run the app and verify**

```sh
npm run tauri dev
```

Verify:
- App launches without errors
- Help menu appears with "Check for Updates..." item
- No update notification visible in the sidebar (no update available in dev mode)
- Clicking Help > Check for Updates does not crash the app (may log a network error in dev — that's fine, the updater endpoint only exists in production releases)

- [ ] **Step 9: Commit**

```bash
git add src/ui/UpdateNotification.tsx src/ui/UpdateNotification.test.tsx src/App.tsx
git commit -m "feat: add UpdateNotification component and wire update flow into App"
```

---

## Releasing the First Signed Update

After all tasks are complete, to publish a release users can update to:

1. Bump `"version"` in `src-tauri/tauri.conf.json` (e.g., `"0.1.0"` → `"0.2.0"`)
2. Push to master
3. GitHub Actions builds, signs, and publishes `app-v0.2.0` with `latest.json`
4. Installed copies running `0.1.0` will detect the update on next launch
