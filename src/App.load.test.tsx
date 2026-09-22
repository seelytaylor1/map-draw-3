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
import { ALL_LOOP_CHALLENGES, LOOP_CHALLENGE_DESCRIPTIONS } from './randomDungeon/missionFirst'

const openWorkspace = (name: 'Assets' | 'Generate' | 'File') => {
  fireEvent.click(screen.getByRole('tab', { name }))
}

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

  it('separates the workspace into focused tabs and resizes the inspector by keyboard', () => {
    render(<App />)

    expect(screen.getByRole('tab', { name: 'Draw' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'false')
    openWorkspace('Generate')
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/generate a dungeon/i)).toBeVisible()

    const resizeHandle = screen.getByRole('separator', { name: /resize inspector/i })
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '328')
    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' })
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '344')
  })

  it('opens the asset folder from the file toolbar', async () => {
    const { openAssetFolder } = await import('./tauri')
    render(<App />)
    openWorkspace('Assets')

    const buttons = screen.getAllByRole('button', { name: /asset folder/i })
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0])

    expect(openAssetFolder).toHaveBeenCalledTimes(1)
  })

  it('returns to paint mode when Draw is clicked after selecting a structure tool', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Steps' }))
    expect(screen.getByText('Steps', { selector: 'strong' })).toBeInTheDocument()

    const drawButtons = screen.getAllByRole('button', { name: 'Draw' })
    fireEvent.click(drawButtons[1])

    expect(screen.getByText('Paint', { selector: 'strong' })).toBeInTheDocument()
  })

  it('launches with one-eighth-inch squares and uses that as the canvas dimension step', () => {
    render(<App />)
    openWorkspace('File')

    const widthInput = screen.getByLabelText(/canvas width in inches/i)
    const heightInput = screen.getByLabelText(/canvas height in inches/i)
    const squareScaleInput = screen.getByLabelText(/square scale/i)

    expect(widthInput).toHaveAttribute('step', '0.125')
    expect(widthInput).toHaveAttribute('min', '1')
    expect(widthInput).toHaveAttribute('max', '36')
    expect(heightInput).toHaveAttribute('step', '0.125')
    expect(heightInput).toHaveAttribute('min', '1')
    expect(heightInput).toHaveAttribute('max', '36')
    expect(squareScaleInput).toHaveValue('8')
    expect(screen.getByRole('option', { name: /½ in/i })).toHaveValue('2')
    expect(screen.getByRole('option', { name: /¼ in/i })).toHaveValue('4')
    expect(screen.getByRole('option', { name: /⅛ in/i })).toHaveValue('8')
  })

  it('adds explicit step controls for canvas size adjustments', () => {
    render(<App />)
    openWorkspace('File')

    const sizeButtons = screen.getAllByRole('button', { name: /increase|decrease/i })
    expect(sizeButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('puts the player view toggle on the File tab', () => {
    render(<App />)
    openWorkspace('File')

    const playerView = screen.getByRole('button', { name: /player view/i })
    expect(playerView).not.toHaveClass('active')
    expect(screen.getByText('Room numbers, trap, hazard and chest icons visible; secret and locked doors shown')).toBeInTheDocument()

    fireEvent.click(playerView)

    expect(playerView).toHaveClass('active')
    expect(screen.getByText('Room numbers, trap, hazard and chest icons hidden; secret doors become walls; locked doors become regular doors')).toBeInTheDocument()
  })

  it('supports keyboard step adjustments for canvas size fields', () => {
    render(<App />)
    openWorkspace('File')

    const widthInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement
    const before = Number(widthInput.value)

    fireEvent.keyDown(widthInput, { key: 'ArrowUp' })

    expect(Number(widthInput.value)).toBeGreaterThan(before)
  })

  it('changes width by one-eighth-inch squares and supports decrement buttons', () => {
    render(<App />)
    openWorkspace('File')

    const [widthInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const increaseButton = screen.getByRole('button', { name: /increase width/i })
    const decreaseButton = screen.getByRole('button', { name: /decrease width/i })

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('11.13')

    fireEvent.click(increaseButton)
    expect(widthInput.value).toBe('11.25')

    fireEvent.click(decreaseButton)
    expect(widthInput.value).toBe('11.13')
  })

  it('keeps canvas page dimensions fixed when square scale changes', () => {
    render(<App />)
    openWorkspace('File')

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
    openWorkspace('File')

    const widthInput = screen.getByLabelText(/canvas width in inches/i) as HTMLInputElement
    const heightInput = screen.getByLabelText(/canvas height in inches/i) as HTMLInputElement
    const squareScaleInput = screen.getByLabelText(/square scale/i) as HTMLInputElement
    const swapButton = screen.getByRole('button', { name: /swap width\/length/i })

    expect(squareScaleInput.value).toBe('8')
    fireEvent.change(squareScaleInput, { target: { value: '4' } })
    expect(squareScaleInput.value).toBe('4')

    const widthBefore = Number(widthInput.value)
    const heightBefore = Number(heightInput.value)
    fireEvent.click(swapButton)

    expect(Number(widthInput.value)).toBe(heightBefore)
    expect(Number(heightInput.value)).toBe(widthBefore)
  })

  it('keeps the current map when the starting room cannot fit', async () => {
    render(<App />)
    openWorkspace('File')

    fireEvent.change(screen.getByLabelText(/canvas width in inches/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/canvas height in inches/i), { target: { value: '1' } })
    openWorkspace('Generate')

    expect(screen.getByText(/cannot fit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate dungeon/i })).toBeDisabled()
    expect(screen.queryByText(/generated .* dungeon/i)).not.toBeInTheDocument()
  })

  it('reports successful generation with the actual rejected placement count', async () => {
    randomSeed.value = 160
    render(<App />)
    openWorkspace('Generate')

    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    const attemptSummary = screen.getByText(/\d+ rejected attempts/i)
    const reportedCount = Number(attemptSummary.textContent?.match(/(\d+) rejected attempts/i)?.[1])
    const placementDiagnostics = screen.queryAllByText(/Placement \d+:/i)
    expect(reportedCount).toBe(placementDiagnostics.length)
  })

  it('places the generated room ledger beside the dungeon legend', async () => {
    render(<App />)
    openWorkspace('Generate')

    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    const controls = document.querySelector('.map-reference-controls')
    const ledger = controls?.querySelector('details.room-ledger')
    expect(controls?.querySelector('details.map-legend')).toBeInTheDocument()
    expect(ledger).toBeInTheDocument()
    expect(ledger).not.toHaveAttribute('open')
    expect(screen.queryByRole('button', { name: /edit room names/i })).not.toBeInTheDocument()

    fireEvent.click(ledger!.querySelector('summary')!)
    expect(ledger).toHaveAttribute('open')
    expect(screen.getByRole('region', { name: 'Room ledger editor' })).toBeInTheDocument()
  })

  it('reports the resolved type for randomly selected loops', async () => {
    randomSeed.value = 1
    render(<App />)
    openWorkspace('Generate')

    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    expect(screen.getByText('Loop 1: Gambit')).toBeInTheDocument()
  })

  it('stores random seeds and keeps user-edited seeds frozen', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    openWorkspace('Generate')

    randomSeed.value = 111
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()
    expect(screen.getByLabelText(/dungeon seed/i)).toHaveValue('111')
    expect(screen.getByText('Seed 111')).toBeInTheDocument()

    randomSeed.value = 222
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()
    expect(screen.getByLabelText(/dungeon seed/i)).toHaveValue('222')
    expect(screen.getByText('Seed 222')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/dungeon seed/i), { target: { value: '3278230271' } })
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()
    expect(screen.getByLabelText(/dungeon seed/i)).toHaveValue('3278230271')
    expect(screen.getByText('Seed 3278230271')).toBeInTheDocument()

    randomSeed.value = 333
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()
    expect(screen.getByLabelText(/dungeon seed/i)).toHaveValue('3278230271')
    expect(screen.getByText('Seed 3278230271')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repeat seed/i })).not.toBeInTheDocument()
  })

  it('generates from an explicitly entered seed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    openWorkspace('Generate')

    fireEvent.change(screen.getByLabelText(/dungeon seed/i), { target: { value: '3278230271' } })
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    expect(screen.getByText('Seed 3278230271')).toBeInTheDocument()
  })

  it('generates a new dungeon from a fresh seed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    openWorkspace('Generate')

    randomSeed.value = 111
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    randomSeed.value = 222
    fireEvent.click(screen.getByRole('button', { name: /new seed/i }))
    await Promise.resolve()
    expect(screen.getByLabelText(/dungeon seed/i)).toHaveValue('222')
    expect(screen.getByText('Seed 222')).toBeInTheDocument()
  })

  it('replaces a generated map without a confirmation popup', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<App />)
    openWorkspace('Generate')

    randomSeed.value = 111
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()
    randomSeed.value = 222
    fireEvent.click(screen.getByRole('button', { name: /generate dungeon/i }))
    await Promise.resolve()

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText('Seed 222')).toBeInTheDocument()
  })

  it('exposes the shared mission-first request and live preflight controls', () => {
    render(<App />)
    openWorkspace('Generate')

    expect(screen.getByLabelText(/generation style/i)).toHaveValue('spine-shortcuts')
    expect(screen.getByRole('option', { name: 'Hub' })).toHaveValue('orbit-gates')
    expect(screen.getByLabelText(/complexity preset/i)).toHaveValue('standard')
    expect(screen.queryByLabelText(/key count/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/lock count/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/number of loops/i)).toHaveValue(1)
    expect(screen.getByLabelText(/loop 1 challenge/i)).toHaveValue('varied')
    expect(screen.getByRole('option', { name: 'Random' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/default challenge|loop preference/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Layout information' })).toHaveAttribute('aria-describedby', 'layout-tooltip')
    expect(screen.getByText(/spine: a linear start-to-goal path.*hub: a central start.*branches: routes split/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /layout complexity information/i })).toHaveAttribute('aria-describedby', 'layout-complexity-tooltip')
    expect(screen.getAllByRole('option', { name: /unknown return/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/ready to generate|tight fit/i)).toBeInTheDocument()
    expect(screen.getByText(/mission nodes/i)).toBeInTheDocument()
  })

  it('defaults each loop to random while preserving explicit overrides', () => {
    render(<App />)
    openWorkspace('Generate')

    const loopOne = screen.getByLabelText(/loop 1 challenge/i) as HTMLSelectElement
    expect(loopOne.value).toBe('varied')

    fireEvent.change(loopOne, { target: { value: 'lock-and-key' } })
    expect(loopOne.value).toBe('lock-and-key')
    expect(screen.getByText(/derived dependencies: 1 key · 1 lock/i)).toBeInTheDocument()
  })

  it('provides descriptions for every loop challenge option', () => {
    render(<App />)
    openWorkspace('Generate')

    const loopOne = screen.getByLabelText(/loop 1 challenge/i) as HTMLSelectElement
    const randomOption = loopOne.querySelector<HTMLOptionElement>('option[value="varied"]')
    expect(randomOption).toHaveAttribute('title', LOOP_CHALLENGE_DESCRIPTIONS.varied)

    for (const challenge of ALL_LOOP_CHALLENGES) {
      const option = loopOne.querySelector<HTMLOptionElement>(`option[value="${challenge}"]`)
      expect(option).toHaveAttribute('title', LOOP_CHALLENGE_DESCRIPTIONS[challenge])
    }

    fireEvent.change(loopOne, { target: { value: 'gambit' } })
    expect(screen.getByTestId('loop-challenge-0-tooltip')).toHaveTextContent(LOOP_CHALLENGE_DESCRIPTIONS.gambit)
  })

  it('preserves loop choices by index and defaults newly added loops to random', () => {
    render(<App />)
    openWorkspace('Generate')

    const count = screen.getByLabelText(/number of loops/i) as HTMLInputElement
    const loopOne = screen.getByLabelText(/loop 1 challenge/i) as HTMLSelectElement
    fireEvent.change(loopOne, { target: { value: 'hidden-shortcut' } })
    fireEvent.change(count, { target: { value: '2' } })
    const loopTwo = screen.getByLabelText(/loop 2 challenge/i) as HTMLSelectElement
    fireEvent.change(loopTwo, { target: { value: 'gambit' } })
    expect(loopOne.value).toBe('hidden-shortcut')
    expect(loopTwo.value).toBe('gambit')

    fireEvent.change(count, { target: { value: '1' } })
    fireEvent.change(count, { target: { value: '2' } })
    expect((screen.getByLabelText(/loop 1 challenge/i) as HTMLSelectElement).value).toBe('hidden-shortcut')
    expect((screen.getByLabelText(/loop 2 challenge/i) as HTMLSelectElement).value).toBe('varied')
  })
})
