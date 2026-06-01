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
