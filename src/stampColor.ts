const tintedImages = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()

export function colorizeStampImage(image: HTMLImageElement, color?: string): HTMLImageElement | HTMLCanvasElement {
  if (!color) return image
  const colorMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!colorMatch) return image

  let colorCache = tintedImages.get(image)
  const cached = colorCache?.get(color)
  if (cached) return cached

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (width <= 0 || height <= 0) return image

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return image

  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, width, height)
  const tintRed = Number.parseInt(colorMatch[1], 16)
  const tintGreen = Number.parseInt(colorMatch[2], 16)
  const tintBlue = Number.parseInt(colorMatch[3], 16)
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] === 0) continue
    const luminance = (imageData.data[i] * 0.2126 + imageData.data[i + 1] * 0.7152 + imageData.data[i + 2] * 0.0722) / 255
    const shade = 0.25 + 0.75 * luminance
    imageData.data[i] = Math.round(tintRed * shade)
    imageData.data[i + 1] = Math.round(tintGreen * shade)
    imageData.data[i + 2] = Math.round(tintBlue * shade)
  }
  context.putImageData(imageData, 0, 0)

  if (!colorCache) {
    colorCache = new Map()
    tintedImages.set(image, colorCache)
  }
  colorCache.set(color, canvas)
  return canvas
}
