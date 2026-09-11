// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { onMenuEventMock, onCloseRequestedMock } = vi.hoisted(() => ({
  onMenuEventMock: vi.fn(() => Promise.resolve(() => {})),
  onCloseRequestedMock: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('konva', () => ({
  default: {},
}))

vi.mock('./tauri', () => ({
  isTauri: () => true,
  openJsonFile: vi.fn(),
  saveJsonFile: vi.fn(),
  saveJsonFileAs: vi.fn(),
  savePngFile: vi.fn(),
  setWindowTitle: vi.fn(),
  onMenuEvent: onMenuEventMock,
  onCloseRequested: onCloseRequestedMock,
  confirmDialog: vi.fn(),
  closeWindow: vi.fn(),
  relaunch: vi.fn(),
}))

vi.mock('./hooks/useUpdater', () => ({
  useUpdater: () => ({
    state: 'idle',
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
  }),
}))

vi.mock('./hooks/useStampImages', () => ({
  useStampImages: () => new Map(),
}))

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

import App from './App'

describe('App load lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('registers Tauri menu listeners only once across UI re-renders', async () => {
    const { rerender } = render(<App />)
    await Promise.resolve()

    const initialCount = onMenuEventMock.mock.calls.length
    expect(initialCount).toBeGreaterThan(0)

    rerender(<App />)
    await Promise.resolve()

    expect(onMenuEventMock.mock.calls.length).toBe(initialCount)
    fireEvent.click(screen.getByText('Grid'))
    expect(onMenuEventMock.mock.calls.length).toBe(initialCount)
  })
})
