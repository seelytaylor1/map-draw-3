// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { StampPicker } from './StampPicker'

vi.mock('./stamps/door.svg?url', () => ({ default: 'door.svg' }))
vi.mock('./stamps/trap.svg?url', () => ({ default: 'trap.svg' }))
vi.mock('./stamps/star.svg?url', () => ({ default: 'star.svg' }))
vi.mock('./stamps/bars.svg?url', () => ({ default: 'bars.svg' }))
vi.mock('./stamps/stairs.svg?url', () => ({ default: 'stairs.svg' }))
vi.mock('./stamps/archway.svg?url', () => ({ default: 'archway.svg' }))

afterEach(cleanup)

describe('StampPicker', () => {
  it('renders archway button', () => {
    render(<StampPicker mode="paint" showIso={true} onModeChange={vi.fn()} />)
    expect(screen.getByTitle('Archway')).toBeInTheDocument()
  })

  it('archway button is disabled in flat mode', () => {
    render(<StampPicker mode="paint" showIso={false} onModeChange={vi.fn()} />)
    expect(screen.getByTitle('Archway')).toBeDisabled()
  })

  it('archway button is enabled in ISO mode', () => {
    render(<StampPicker mode="paint" showIso={true} onModeChange={vi.fn()} />)
    expect(screen.getByTitle('Archway')).not.toBeDisabled()
  })

  it('clicking archway in ISO mode calls onModeChange with archway', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(<StampPicker mode="paint" showIso={true} onModeChange={onModeChange} />)
    await user.click(screen.getByTitle('Archway'))
    expect(onModeChange).toHaveBeenCalledWith('archway')
  })
})
