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
vi.mock('./iso-objects/g1002.svg?url', () => ({ default: 'g1002.svg' }))

afterEach(cleanup)

describe('StampPicker', () => {
  it('renders the icons and iso objects groups', () => {
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getByText('Icons')).toBeInTheDocument()
    expect(screen.getByText('Iso Objects')).toBeInTheDocument()
  })

  it('renders a split iso object button', () => {
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getByTitle('G 1002')).toBeInTheDocument()
  })

  it('split iso object button is enabled', () => {
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getByTitle('G 1002')).not.toBeDisabled()
  })

  it('clicking a split iso object selects its asset type', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(<StampPicker mode="paint" onModeChange={onModeChange} />)
    await user.click(screen.getByTitle('G 1002'))
    expect(onModeChange).toHaveBeenCalledWith('g1002')
  })
})
