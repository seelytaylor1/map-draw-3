// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { UpdateNotification } from './UpdateNotification'
import type { UpdaterState } from '../hooks/useUpdater'

afterEach(cleanup)

const noop = vi.fn()

describe('UpdateNotification', () => {
  it('renders nothing when idle', () => {
    const { container } = render(
      <UpdateNotification state={{ status: 'idle' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when checking', () => {
    const { container } = render(
      <UpdateNotification state={{ status: 'checking' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows version and install button when available', () => {
    render(
      <UpdateNotification state={{ status: 'available', version: '0.2.0' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('calls onInstall when install button clicked', async () => {
    const onInstall = vi.fn()
    render(
      <UpdateNotification state={{ status: 'available', version: '0.2.0' }} onInstall={onInstall} onRelaunch={noop} />
    )
    await userEvent.click(screen.getByRole('button', { name: /install/i }))
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('shows progress when downloading', () => {
    render(
      <UpdateNotification state={{ status: 'downloading', progress: 42 }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/42%/)).toBeInTheDocument()
  })

  it('shows relaunch button when relaunch-pending', async () => {
    const onRelaunch = vi.fn()
    render(
      <UpdateNotification state={{ status: 'relaunch-pending' }} onInstall={noop} onRelaunch={onRelaunch} />
    )
    const btn = screen.getByRole('button', { name: /relaunch/i })
    await userEvent.click(btn)
    expect(onRelaunch).toHaveBeenCalledOnce()
  })

  it('shows error message when error', () => {
    render(
      <UpdateNotification state={{ status: 'error', message: 'network failure' }} onInstall={noop} onRelaunch={noop} />
    )
    expect(screen.getByText(/network failure/)).toBeInTheDocument()
  })
})
