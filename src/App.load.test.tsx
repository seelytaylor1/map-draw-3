// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  openAssetFolder: vi.fn(),
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
    cleanup()
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

  it('opens the asset folder from the file toolbar', async () => {
    const { openAssetFolder } = await import('./tauri')
    render(<App />)

    const buttons = screen.getAllByRole('button', { name: /asset folder/i })
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0])

    expect(openAssetFolder).toHaveBeenCalledTimes(1)
  })

  it('uses tenth-inch steps for canvas dimensions', () => {
    render(<App />)

    const sizeInputs = screen.getAllByRole('spinbutton')
    expect(sizeInputs).toHaveLength(2)
    for (const input of sizeInputs) {
      expect(input).toHaveAttribute('step', '0.1')
      expect(input).toHaveAttribute('min', '1')
      expect(input).toHaveAttribute('max', '36')
    }
  })

  it('adds explicit step controls for canvas size adjustments', () => {
    render(<App />)

    const sizeButtons = screen.getAllByRole('button', { name: /increase|decrease/i })
    expect(sizeButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('supports keyboard step adjustments for canvas size fields', () => {
    render(<App />)

    const widthInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement
    const before = Number(widthInput.value)

    fireEvent.keyDown(widthInput, { key: 'ArrowUp' })

    expect(Number(widthInput.value)).toBeGreaterThan(before)
  })

  it('changes width by tenths and supports decrement buttons', () => {
    render(<App />)

    const [widthInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const increaseButton = screen.getByRole('button', { name: /increase width/i })
    const decreaseButton = screen.getByRole('button', { name: /decrease width/i })

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('11.1')

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('11.2')

    fireEvent.click(decreaseButton)
    expect(widthInput.value).toBe('11.1')
  })
})
