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
vi.mock('./stamps/archway.svg?url', () => ({ default: 'archway.svg' }))

afterEach(cleanup)

describe('StampPicker', () => {
  it('renders archway button', () => {
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getByTitle('Archway')).toBeInTheDocument()
  })

  it('archway button is enabled', () => {
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getByTitle('Archway')).not.toBeDisabled()
  })

  it('clicking archway calls onModeChange with archway', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(<StampPicker mode="paint" onModeChange={onModeChange} />)
    await user.click(screen.getByTitle('Archway'))
    expect(onModeChange).toHaveBeenCalledWith('archway')
  })
})
