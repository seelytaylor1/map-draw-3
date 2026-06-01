export function isoProject(col: number, row: number, tileW: number, tileH: number): { x: number; y: number } {
  return {
    x: (col - row) * tileW / 2,
    y: (col + row) * tileH / 2,
  }
}

export function isoFloorPoints(col: number, row: number, tileW: number, tileH: number): number[] {
  const top = isoProject(col, row, tileW, tileH)
  const right = isoProject(col + 1, row, tileW, tileH)
  const bottom = isoProject(col + 1, row + 1, tileW, tileH)
  const left = isoProject(col, row + 1, tileW, tileH)
  return [top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]
}

export function isoFrontFacePoints(col: number, row: number, tileW: number, tileH: number, faceH: number): number[] {
  const left = isoProject(col, row + 1, tileW, tileH)
  const bottom = isoProject(col + 1, row + 1, tileW, tileH)
  return [left.x, left.y, bottom.x, bottom.y, bottom.x, bottom.y + faceH, left.x, left.y + faceH]
}

export function isoEastFacePoints(col: number, row: number, tileW: number, tileH: number, faceH: number): number[] {
  const right = isoProject(col + 1, row, tileW, tileH)
  const bottom = isoProject(col + 1, row + 1, tileW, tileH)
  return [right.x, right.y, bottom.x, bottom.y, bottom.x, bottom.y + faceH, right.x, right.y + faceH]
}

// Parameters to project a flat stamp image onto the iso floor plane via Konva transform.
// Derived from the 2:1 iso projection matrix [[1,-1],[0.5,0.5]] decomposed into R·S·SK.
const ISO_ANGLE_DEG = Math.atan(0.5) * 180 / Math.PI  // ≈ 26.565°
const ISO_SX = Math.sqrt(5) / 2                        // ≈ 1.118
const ISO_SY = 2 / Math.sqrt(5)                        // ≈ 0.894
const ISO_SKEW_BASE = -0.6                              // -(1 - a²)/(1 + a²) for a=0.5

export type IsoStampTransform = { rotation: number; scaleX: number; scaleY: number; skewX: number }

export function isoStampTransform(flatRotation: number): IsoStampTransform {
  const step = Math.floor(((flatRotation % 360) + 360) % 360 / 90)
  const isEven = step % 2 === 0
  return {
    rotation: isEven
      ? step * 90 + ISO_ANGLE_DEG
      : step * 90 + (90 - ISO_ANGLE_DEG),
    scaleX: ISO_SX,
    scaleY: ISO_SY,
    skewX: isEven ? ISO_SKEW_BASE : -ISO_SKEW_BASE,
  }
}
