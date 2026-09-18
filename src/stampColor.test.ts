// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { colorizeStampImage } from './stampColor'

afterEach(() => vi.restoreAllMocks())

function loadedImage(): HTMLImageElement {
  const image = document.createElement('img')
  Object.defineProperties(image, {
    naturalWidth: { value: 24 },
    naturalHeight: { value: 16 },
  })
  return image
}

describe('colorizeStampImage', () => {
  it('keeps the original image unchanged when no color is set', () => {
    const image = loadedImage()
    expect(colorizeStampImage(image)).toBe(image)
  })

  it('creates a cached tint image while retaining detail and transparency', () => {
    const image = loadedImage()
    const imageData = { data: new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      40, 60, 80, 0,
    ]) }
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(imageData),
      putImageData: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)

    const first = colorizeStampImage(image, '#e04b61') as HTMLCanvasElement
    const cached = colorizeStampImage(image, '#e04b61')

    expect(first).toBeInstanceOf(HTMLCanvasElement)
    expect(first).toBe(cached)
    expect(first.width).toBe(24)
    expect(first.height).toBe(16)
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0)
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 24, 16)
    expect(Array.from(imageData.data)).toEqual([
      56, 19, 24, 255,
      224, 75, 97, 255,
      40, 60, 80, 0,
    ])
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0)
  })
})
