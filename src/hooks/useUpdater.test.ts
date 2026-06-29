// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdater } from './useUpdater'

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('../tauri', () => ({
  isTauri: vi.fn().mockReturnValue(true),
}))

import { check } from '@tauri-apps/plugin-updater'
import { isTauri } from '../tauri'

const mockCheck = vi.mocked(check)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
})

describe('useUpdater', () => {
  it('starts idle', async () => {
    mockCheck.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdater())
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions to idle when no update available', async () => {
    mockCheck.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions to available when update found', async () => {
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: vi.fn() })
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'available', version: '0.2.0' })
  })

  it('transitions to error when check throws', async () => {
    mockCheck.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'error', message: 'network failure' })
  })

  it('transitions to relaunch-pending after successful download', async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined)
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: mockDownloadAndInstall })
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    await act(async () => { await result.current.downloadAndInstall() })
    expect(result.current.state.status).toBe('relaunch-pending')
  })

  it('is a no-op when not in Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    expect(mockCheck).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })
})
