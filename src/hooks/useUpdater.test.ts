// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdater } from './useUpdater'
import type { Update } from '@tauri-apps/plugin-updater'

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
  it('starts checking on mount', async () => {
    mockCheck.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdater())
    await act(async () => {})
    expect(mockCheck).toHaveBeenCalledOnce()
    expect(result.current.state.status).toBe('idle') // settled after check returns null
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
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: vi.fn() } as unknown as Update)
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'available', version: '0.2.0' })
  })

  it('transitions to error when check throws (explicit call)', async () => {
    mockCheck.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useUpdater())
    await act(async () => {
      await result.current.checkForUpdate()
    })
    expect(result.current.state).toEqual({ status: 'error', message: 'network failure' })
  })

  it('stays idle on mount when check throws (silent)', async () => {
    mockCheck.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useUpdater())
    await act(async () => {})
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions to relaunch-pending after successful download', async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined)
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: mockDownloadAndInstall } as unknown as Update)
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    await act(async () => { await result.current.downloadAndInstall() })
    expect(result.current.state.status).toBe('relaunch-pending')
  })

  it('transitions to error when download throws', async () => {
    const mockDownloadAndInstall = vi.fn().mockRejectedValue(new Error('disk full'))
    mockCheck.mockResolvedValue({ version: '0.2.0', downloadAndInstall: mockDownloadAndInstall } as unknown as Update)
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    await act(async () => { await result.current.downloadAndInstall() })
    expect(result.current.state).toEqual({ status: 'error', message: 'disk full' })
  })

  it('is a no-op when not in Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    const { result } = renderHook(() => useUpdater())
    await act(async () => { await result.current.checkForUpdate() })
    expect(mockCheck).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })
})
