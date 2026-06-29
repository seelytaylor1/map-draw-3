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

  const checkForUpdate = useCallback(async (silent = false) => {
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
      if (silent) {
        setState({ status: 'idle' })
      } else {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    let contentLength = 0
    let downloaded = 0
    setState({ status: 'downloading', progress: 0 })
    try {
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
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    checkForUpdate(true) // silent: swallow errors on mount
  }, [checkForUpdate])

  return { state, checkForUpdate, downloadAndInstall }
}
