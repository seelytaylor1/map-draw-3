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
    expect(screen.getByRole('tab', { name: /map icons/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /objects/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/search map icons/i)).toBeInTheDocument()
  })

  it('searches object assets without rendering the whole library', async () => {
    const user = userEvent.setup()
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    expect(screen.getAllByRole('button').length).toBeLessThan(40)
    await user.click(screen.getByRole('tab', { name: /objects/i }))
    await user.type(screen.getByLabelText(/search objects/i), 'g 1002')
    expect(screen.getByTitle('G 1002')).toBeInTheDocument()
  })

  it('shows both trapped door icons in the searchable map icon palette', async () => {
    const user = userEvent.setup()
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    await user.type(screen.getByLabelText(/search map icons/i), 'trapped')
    expect(screen.getByTitle('Door Trapped')).toBeInTheDocument()
    expect(screen.getByTitle('Door Trapped Locked')).toBeInTheDocument()
  })

  it('split iso object button is enabled', async () => {
    const user = userEvent.setup()
    render(<StampPicker mode="paint" onModeChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: /objects/i }))
    await user.type(screen.getByLabelText(/search objects/i), 'g 1002')
    expect(screen.getByTitle('G 1002')).not.toBeDisabled()
  })

  it('clicking a split iso object selects its asset type', async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    render(<StampPicker mode="paint" onModeChange={onModeChange} />)
    await user.click(screen.getByRole('tab', { name: /objects/i }))
    await user.type(screen.getByLabelText(/search objects/i), 'g 1002')
    await user.click(screen.getByTitle('G 1002'))
    expect(onModeChange).toHaveBeenCalledWith('g1002')
  })
})
