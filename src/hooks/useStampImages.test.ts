// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { STAMP_TYPES, OBJECT_STAMP_TYPES } from '../stamps'

class MockImage {
  onload: (() => void) | null = null
  set src(_url: string) {
    setTimeout(() => this.onload?.(), 0)
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'Image', { value: MockImage, writable: true, configurable: true })
})

describe('useStampImages', () => {
  it('resolves to a map containing all floor stamp types', async () => {
    const { useStampImages } = await import('./useStampImages')
    const { result } = renderHook(() => useStampImages())
    await waitFor(() => expect(result.current).not.toBeNull())
    for (const type of STAMP_TYPES) {
      expect(result.current!.has(type)).toBe(true)
    }
  })

  it('detects object assets from the folder instead of a hardcoded allowlist', async () => {
    expect(OBJECT_STAMP_TYPES).toContain('stairs')

    const { useStampImages } = await import('./useStampImages')
    const { result } = renderHook(() => useStampImages())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.has('stairs')).toBe(true)
  })
})
