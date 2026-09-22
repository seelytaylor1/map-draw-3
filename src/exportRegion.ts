export interface ExportRegion { col: number; row: number; cols: number; rows: number }

export function wholeMapRegion(cols: number, rows: number): ExportRegion {
  return { col: 0, row: 0, cols, rows }
}

export function normalizeExportRegion(region: ExportRegion, mapCols: number, mapRows: number): ExportRegion {
  const col = Math.min(Math.max(0, Math.floor(region.col)), Math.max(0, mapCols - 1))
  const row = Math.min(Math.max(0, Math.floor(region.row)), Math.max(0, mapRows - 1))
  return {
    col,
    row,
    cols: Math.max(1, Math.min(Math.floor(region.cols), mapCols - col)),
    rows: Math.max(1, Math.min(Math.floor(region.rows), mapRows - row)),
  }
}

export function exportDimensions(region: ExportRegion, pixelsPerCell: number): { width: number; height: number } {
  return { width: region.cols * pixelsPerCell, height: region.rows * pixelsPerCell }
}

/** Pixel crop bounds for an export region in the selected projection. */
export function exportCropRect(region: ExportRegion, pixelsPerCell: number, projection: 'top-down' | 'iso', mapRows: number) {
  if (projection === 'top-down') {
    return {
      x: region.col * pixelsPerCell,
      y: region.row * pixelsPerCell,
      width: region.cols * pixelsPerCell,
      height: region.rows * pixelsPerCell,
    }
  }

  // In iso projection a tile maps to a 2:1 diamond. The crop is the bounding
  // rectangle of the four projected corners, shifted into export canvas space.
  const corners = [
    [region.col, region.row],
    [region.col + region.cols, region.row],
    [region.col + region.cols, region.row + region.rows],
    [region.col, region.row + region.rows],
  ]
  const projected = corners.map(([col, row]) => ({
    x: (col - row) * pixelsPerCell + mapRows * pixelsPerCell,
    y: (col + row) * pixelsPerCell / 2,
  }))
  const xs = projected.map(point => point.x)
  const ys = projected.map(point => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
