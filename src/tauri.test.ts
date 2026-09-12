import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeWindow } from './tauri'

const { mockClose, mockExit } = vi.hoisted(() => ({
  mockClose: vi.fn(),
  mockExit: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
    setTitle: vi.fn(),
    onCloseRequested: vi.fn(),
  }),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
  exit: mockExit,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
}))

describe('closeWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    })
    ;(globalThis as any).window.__TAURI_INTERNALS__ = {}
  })

  it('exits the app in Tauri instead of requesting a window-close event', async () => {
    await closeWindow()

    expect(mockExit).toHaveBeenCalledWith(0)
    expect(mockClose).not.toHaveBeenCalled()
  })
})
