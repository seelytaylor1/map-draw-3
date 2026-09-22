import { open as openDialog, save, confirm } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile, writeFile } from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openPath as openTauriPath } from '@tauri-apps/plugin-opener'
import { exit as tauriExit, relaunch as tauriRelaunch } from '@tauri-apps/plugin-process'

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function openAssetFolder(): Promise<void> {
  if (!isTauri()) return

  const candidates = [
    'D:/Taylor Projects/code/map-draw-3/src',
    'D:\\Taylor Projects\\code\\map-draw-3\\src',
    'src',
  ]

  for (const folder of candidates) {
    try {
      await openTauriPath(folder)
      return
    } catch {
      // Keep trying the next candidate if the folder path cannot be opened.
    }
  }
}

export async function openJsonFile(): Promise<{ path: string; content: string } | null> {
  if (!isTauri()) return null
  const path = await openDialog({
    multiple: false,
    filters: [{ name: 'Map', extensions: ['json'] }],
  })
  if (!path || Array.isArray(path)) return null
  const content = await readTextFile(path)
  return { path, content }
}

export async function saveJsonFile(path: string, content: string): Promise<void> {
  if (!isTauri()) return
  await writeTextFile(path, content)
}

export async function saveJsonFileAs(defaultName: string, content: string): Promise<string | null> {
  if (!isTauri()) return null
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Map', extensions: ['json'] }],
  })
  if (!path) return null
  await writeTextFile(path, content)
  return path
}

export async function writePngFile(path: string, dataUrl: string): Promise<void> {
  if (!isTauri()) return
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Invalid PNG data URL')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  await writeFile(path, bytes)
}

export async function savePngFile(defaultName: string, dataUrl: string): Promise<string | null> {
  if (!isTauri()) return null
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })
  if (!path) return null
  await writePngFile(path, dataUrl)
  return path
}

export async function saveTextFile(path: string, content: string): Promise<void> {
  if (!isTauri()) return
  await writeTextFile(path, content)
}

export async function chooseSavePath(defaultName: string, filterName: string, extension: string): Promise<string | null> {
  if (!isTauri()) return null
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [extension.replace(/^\./, '')] }],
  })
  return path || null
}

export async function saveTextFileAs(defaultName: string, content: string, filterName: string, extension: string): Promise<string | null> {
  const path = await chooseSavePath(defaultName, filterName, extension)
  if (!path) return null
  await writeTextFile(path, content)
  return path
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return
  await getCurrentWindow().setTitle(title)
}

export async function onMenuEvent(event: string, handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  return listen(event, handler)
}

export async function onCloseRequested(handler: (prevent: () => void) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  return getCurrentWindow().onCloseRequested((e) => {
    handler(() => e.preventDefault())
  })
}

export async function confirmDialog(message: string, title?: string): Promise<boolean> {
  if (!isTauri()) return window.confirm(message)
  return confirm(message, { title })
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return window.close()
  await tauriExit(0)
}

export async function relaunch(): Promise<void> {
  if (!isTauri()) return
  await tauriRelaunch()
}
