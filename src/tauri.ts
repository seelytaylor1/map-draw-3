import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile, writeFile } from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function openJsonFile(): Promise<{ path: string; content: string } | null> {
  if (!isTauri()) return null
  const path = await open({
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

export async function savePngFile(defaultName: string, dataUrl: string): Promise<void> {
  if (!isTauri()) return
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })
  if (!path) return
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  await writeFile(path, bytes)
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
