export interface History<T = Uint8Array> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] }
}

export function push<T>(history: History<T>, snapshot: T): History<T> {
  return { past: [...history.past, history.present], present: snapshot, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history
  const past = history.past.slice()
  const present = past.pop()!
  return { past, present, future: [history.present, ...history.future] }
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history
  const [present, ...future] = history.future
  return { past: [...history.past, history.present], present, future }
}
