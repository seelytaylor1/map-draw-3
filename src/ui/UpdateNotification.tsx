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
        <span className="update-error">
          {state.message} <button className="update-retry" onClick={onInstall}>Retry</button>
        </span>
      )}
    </div>
  )
}
