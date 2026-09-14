// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { onMenuEventMock, onCloseRequestedMock, randomSeed } = vi.hoisted(() => ({
  onMenuEventMock: vi.fn(() => Promise.resolve(() => {})),
  onCloseRequestedMock: vi.fn(() => Promise.resolve(() => {})),
  randomSeed: { value: 1 },
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

vi.mock('./randomDungeon/random', async importOriginal => ({
  ...(await importOriginal<typeof import('./randomDungeon/random')>()),
  createRandomSeed: () => randomSeed.value,
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
    randomSeed.value = 1
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

  it('uses the selected square size as the canvas dimension step', () => {
    render(<App />)

    const widthInput = screen.getByLabelText(/canvas width in inches/i)
    const heightInput = screen.getByLabelText(/canvas height in inches/i)
    const squareScaleInput = screen.getByLabelText(/square scale/i)

    expect(widthInput).toHaveAttribute('step', '0.5')
    expect(widthInput).toHaveAttribute('min', '1')
    expect(widthInput).toHaveAttribute('max', '36')
    expect(heightInput).toHaveAttribute('step', '0.5')
    expect(heightInput).toHaveAttribute('min', '1')
    expect(heightInput).toHaveAttribute('max', '36')
    expect(squareScaleInput).toHaveValue('2')
    expect(screen.getByRole('option', { name: /½ in/i })).toHaveValue('2')
    expect(screen.getByRole('option', { name: /¼ in/i })).toHaveValue('4')
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

  it('changes width by half-inch squares and supports decrement buttons', () => {
    render(<App />)

    const [widthInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const increaseButton = screen.getByRole('button', { name: /increase width/i })
    const decreaseButton = screen.getByRole('button', { name: /decrease width/i })

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('11.5')

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('12')

    fireEvent.click(decreaseButton)
    expect(widthInput.value).toBe('11.5')
  })

  it('keeps canvas page dimensions fixed when square scale changes', () => {
    render(<App />)

    const widthInput = screen.getByLabelText(/canvas width in inches/i) as HTMLInputElement
    const heightInput = screen.getByLabelText(/canvas height in inches/i) as HTMLInputElement
    const squareScaleInput = screen.getByLabelText(/square scale/i) as HTMLInputElement

    fireEvent.change(squareScaleInput, { target: { value: '4' } })

    expect(squareScaleInput.value).toBe('4')
    expect(widthInput).toHaveAttribute('step', '0.25')
    expect(heightInput).toHaveAttribute('step', '0.25')
    expect(Number(widthInput.value)).toBeCloseTo(11, 1)
    expect(Number(heightInput.value)).toBeCloseTo(8.5, 1)
  })

  it('exposes a square scale setting and supports swapping width and length', () => {
    render(<App />)

    const widthInput = screen.getByLabelText(/canvas width in inches/i) as HTMLInputElement
    const heightInput = screen.getByLabelText(/canvas height in inches/i) as HTMLInputElement
    const squareScaleInput = screen.getByLabelText(/square scale/i) as HTMLInputElement
    const swapButton = screen.getByRole('button', { name: /swap width\/length/i })

    expect(squareScaleInput.value).toBe('2')
    fireEvent.change(squareScaleInput, { target: { value: '4' } })
    expect(squareScaleInput.value).toBe('4')

    const widthBefore = Number(widthInput.value)
    const heightBefore = Number(heightInput.value)
    fireEvent.click(swapButton)

    expect(Number(widthInput.value)).toBe(heightBefore)
    expect(Number(heightInput.value)).toBe(widthBefore)
  })

  it('keeps the current map when the starting room cannot fit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.change(screen.getByLabelText(/canvas height in inches/i), { target: { value: '6.5' } })
    fireEvent.click(screen.getByRole('button', { name: /generate random dungeon/i }))
    await Promise.resolve()

    expect(screen.getByText(/generation stopped:.*starting room/i)).toBeInTheDocument()
    expect(screen.queryByText(/generated .* dungeon/i)).not.toBeInTheDocument()
  })

  it('explains rejected follow-up attempts instead of calling them failures', async () => {
    randomSeed.value = 160
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /generate random dungeon/i }))
    await Promise.resolve()

    expect(screen.getByText(/rejected attempts/i)).toBeInTheDocument()
    expect(screen.getByText(/outside the one-tile wall border/i)).toBeInTheDocument()
  })
})
