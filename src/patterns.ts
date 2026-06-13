// src/patterns.ts
import { FLOOR, WALL } from './constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoughLineOptions {
  segmentSizeMin: number      // min sub-segment size after subdivision
  segmentSizeMax: number      // max sub-segment size after subdivision
  segmentSkipRate: number     // probability [0,1] of dropping a sub-segment
  noDotRate: number           // probability [0,1] that a skipped segment leaves no dot
  scribbleScale: number       // frequency of Perlin-noise wobble
  scribbleAmplitude: number   // amplitude of perpendicular noise displacement
  shiftRate: number           // probability [0,1] of splitting a segment into offset halves
  shiftAmountMin: number      // min perpendicular shift amount
  shiftAmountMax: number      // max perpendicular shift amount
  majorNoiseScale: number     // frequency of slow drift noise
  majorNoiseAmplitude: number // amplitude of slow drift
  majorNoiseShift: number     // threshold shift for major noise
}

const DEFAULT_ROUGH_OPTS: RoughLineOptions = {
  segmentSizeMin: 1,
  segmentSizeMax: 1,
  segmentSkipRate: 0,
  noDotRate: 0.2,
  scribbleScale: 0.2,
  scribbleAmplitude: 1,
  shiftRate: 0,
  shiftAmountMin: 1,
  shiftAmountMax: 2,
  majorNoiseScale: 0.05,
  majorNoiseAmplitude: 0,
  majorNoiseShift: 0.9,
}

export interface HatchOptions {
  /** pixels; cells within this distance of a wall edge qualify */
  wallDistance: number
  /** Voronoi tile size in pixels */
  tileSize: number
  /** Poisson-disc min separation */
  minDistance: number
  /** Poisson-disc max separation */
  maxDistance: number
  /** distance between parallel lines within a cell */
  spacing: number
}

const DEFAULT_HATCH_OPTS: HatchOptions = {
  wallDistance: 25,
  tileSize: 300,
  minDistance: 13,
  maxDistance: 20,
  spacing: 4.5,
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

type Vec2 = [number, number]

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Clip a convex polygon by a half-plane (ax + by <= c). Returns new polygon. */
function clipPolygonByHalfPlane(
  poly: Vec2[],
  a: number,
  b: number,
  c: number,
): Vec2[] {
  if (poly.length === 0) return []
  const out: Vec2[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const cur = poly[i]
    const nxt = poly[(i + 1) % n]
    const dc = a * cur[0] + b * cur[1] - c
    const dn = a * nxt[0] + b * nxt[1] - c
    if (dc <= 0) out.push(cur)
    if ((dc < 0 && dn > 0) || (dc > 0 && dn < 0)) {
      // intersection
      const t = dc / (dc - dn)
      out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])])
    }
  }
  return out
}

/**
 * Compute the Voronoi cell polygon for point `i` given all seed points.
 * Start from a large bounding box and clip by each perpendicular bisector.
 */
function voronoiCell(
  seeds: Vec2[],
  i: number,
  bboxMinX: number,
  bboxMinY: number,
  bboxMaxX: number,
  bboxMaxY: number,
): Vec2[] {
  // Start with the bounding box
  let poly: Vec2[] = [
    [bboxMinX, bboxMinY],
    [bboxMaxX, bboxMinY],
    [bboxMaxX, bboxMaxY],
    [bboxMinX, bboxMaxY],
  ]

  const [px, py] = seeds[i]
  for (let j = 0; j < seeds.length; j++) {
    if (j === i) continue
    const [qx, qy] = seeds[j]
    // Perpendicular bisector half-plane: all points closer to p than to q
    // (x - px)^2 + (y - py)^2 <= (x - qx)^2 + (y - qy)^2
    // simplifies to: 2(qx-px)*x + 2(qy-py)*y <= qx^2 - px^2 + qy^2 - py^2
    const a = 2 * (qx - px)
    const b = 2 * (qy - py)
    const c = qx * qx - px * px + qy * qy - py * py
    poly = clipPolygonByHalfPlane(poly, a, b, c)
    if (poly.length === 0) return []
  }
  return poly
}

/** Polygon centroid */
function centroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return [0, 0]
  let sx = 0
  let sy = 0
  for (const [x, y] of poly) {
    sx += x
    sy += y
  }
  return [sx / poly.length, sy / poly.length]
}

// ---------------------------------------------------------------------------
// Deterministic helpers (stable hash)
// ---------------------------------------------------------------------------

/** Deterministic angle for a cell index (0..2π). Same hash as original. */
function cellAngle(seed: number): number {
  let h = seed ^ 0xdeadbeef
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h ^= h >>> 16
  return ((h >>> 0) / 0xffffffff) * Math.PI
}

// ---------------------------------------------------------------------------
// Poisson-disc sampling (Bridson's algorithm)
// ---------------------------------------------------------------------------

function poissonDisk(
  width: number,
  height: number,
  minDist: number,
  maxDist: number,
  seed: number,
): Vec2[] {
  // Simple deterministic LCG
  let s = seed | 0
  function rand(): number {
    s = Math.imul(s + 0x6d2b79f5, 0x735a2d97)
    s = ((s << 15) | (s >>> 17)) ^ Math.imul(s, 0x1b56c4e9)
    return ((s >>> 0) / 0x100000000)
  }

  const cellSize = minDist / Math.SQRT2
  const gridW = Math.ceil(width / cellSize)
  const gridH = Math.ceil(height / cellSize)
  const grid: (Vec2 | null)[] = new Array(gridW * gridH).fill(null)

  function gridIdx(x: number, y: number): number {
    return Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize)
  }

  function isValid(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const gx = Math.floor(x / cellSize)
    const gy = Math.floor(y / cellSize)
    const r0 = Math.max(0, gy - 2)
    const r1 = Math.min(gridH - 1, gy + 2)
    const c0 = Math.max(0, gx - 2)
    const c1 = Math.min(gridW - 1, gx + 2)
    for (let gy2 = r0; gy2 <= r1; gy2++) {
      for (let gx2 = c0; gx2 <= c1; gx2++) {
        const nb = grid[gy2 * gridW + gx2]
        if (nb && dist2(x, y, nb[0], nb[1]) < minDist * minDist) return false
      }
    }
    return true
  }

  const points: Vec2[] = []
  const active: number[] = []

  const x0 = rand() * width
  const y0 = rand() * height
  const first: Vec2 = [x0, y0]
  points.push(first)
  active.push(0)
  grid[gridIdx(x0, y0)] = first

  const k = 30
  while (active.length > 0) {
    const idx = Math.floor(rand() * active.length)
    const [ax, ay] = points[active[idx]]
    let found = false
    for (let attempt = 0; attempt < k; attempt++) {
      const angle = rand() * 2 * Math.PI
      const r = minDist + rand() * (maxDist - minDist)
      const nx = ax + r * Math.cos(angle)
      const ny = ay + r * Math.sin(angle)
      if (isValid(nx, ny)) {
        const np: Vec2 = [nx, ny]
        points.push(np)
        active.push(points.length - 1)
        grid[gridIdx(nx, ny)] = np
        found = true
      }
    }
    if (!found) active.splice(idx, 1)
  }

  return points
}

// ---------------------------------------------------------------------------
// Wall-edge collection
// ---------------------------------------------------------------------------

function getLocalTile(grid: Uint8Array, cols: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= cols || row * cols + col >= grid.length) return WALL
  return grid[row * cols + col]
}

/** Collect midpoints along every WALL↔FLOOR shared edge. */
function collectWallEdgePoints(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
): Vec2[] {
  const pts: Vec2[] = []
  const N = 3 // sample points per edge

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = getLocalTile(grid, cols, c, r)
      const x0 = c * tileSize
      const y0 = r * tileSize
      const x1 = x0 + tileSize
      const y1 = y0 + tileSize

      // Check right neighbor (only if neighbor is within bounds)
      if (c + 1 < cols && tile !== getLocalTile(grid, cols, c + 1, r)) {
        for (let k = 0; k <= N; k++) {
          pts.push([x1, y0 + (k / N) * tileSize])
        }
      }
      // Check bottom neighbor (only if neighbor is within bounds)
      if (r + 1 < rows && tile !== getLocalTile(grid, cols, c, r + 1)) {
        for (let k = 0; k <= N; k++) {
          pts.push([x0 + (k / N) * tileSize, y1])
        }
      }
    }
  }
  return pts
}

/** Returns true if point (px, py) is within maxDist of any wall-edge point. */
function isNearWallEdge(
  px: number,
  py: number,
  wallEdgePts: Vec2[],
  maxDist: number,
): boolean {
  const d2 = maxDist * maxDist
  for (const [wx, wy] of wallEdgePts) {
    if (dist2(px, py, wx, wy) <= d2) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Line generation inside a polygon
// ---------------------------------------------------------------------------

/**
 * Clip a line segment (p0, p1) to the inside of a convex polygon.
 * Uses Liang-Barsky against each half-plane of the polygon.
 * Returns null if the segment is entirely outside.
 */
function clipSegmentToPolygon(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  poly: Vec2[],
): [Vec2, Vec2] | null {
  let t0 = 0
  let t1 = 1
  const dx = p1x - p0x
  const dy = p1y - p0y
  const n = poly.length

  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % n]
    // Inward normal: (-(by-ay), (bx-ax)) — left-hand side is inside for CCW polygon
    const nx = -(by - ay)
    const ny = bx - ax
    const denom = nx * dx + ny * dy
    const num = nx * (p0x - ax) + ny * (p0y - ay)
    if (Math.abs(denom) < 1e-10) {
      // parallel — check if outside
      if (num < 0) return null
    } else {
      const t = -num / denom
      if (denom > 0) {
        // entering (line moving toward inside of half-plane)
        if (t > t0) t0 = t
      } else {
        // leaving (line moving toward outside of half-plane)
        if (t < t1) t1 = t
      }
    }
    if (t0 > t1) return null
  }

  return [
    [p0x + t0 * dx, p0y + t0 * dy],
    [p0x + t1 * dx, p0y + t1 * dy],
  ]
}

/** Generate hatch lines inside a polygon at a given angle and spacing. */
function generateCellLines(
  poly: Vec2[],
  angle: number,
  spacing: number,
  minLen: number,
): [number, number][][] {
  if (poly.length < 3) return []

  // Find bounding box of cell
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Step perpendicular to the hatch lines
  const perpX = -sin
  const perpY = cos
  // Direction along each hatch line
  const lineX = cos
  const lineY = sin

  // Diagonal of the cell as max line length
  const diagLen = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) + spacing * 2
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Range of perpendicular offsets to cover the bounding box
  const corners: Vec2[] = [
    [minX - cx, minY - cy],
    [maxX - cx, minY - cy],
    [maxX - cx, maxY - cy],
    [minX - cx, maxY - cy],
  ]
  let pMin = Infinity, pMax = -Infinity
  for (const [x, y] of corners) {
    const t = x * perpX + y * perpY
    if (t < pMin) pMin = t
    if (t > pMax) pMax = t
  }

  // Ensure polygon is CCW (needed for clip)
  const ccwPoly = ensureCCW(poly)

  const segments: [number, number][][] = []

  for (let t = pMin; t <= pMax + spacing * 0.5; t += spacing) {
    // Line passes through (cx + t*perpX, cy + t*perpY) in direction (lineX, lineY)
    const lx = cx + t * perpX
    const ly = cy + t * perpY
    const p0x = lx - diagLen * lineX
    const p0y = ly - diagLen * lineY
    const p1x = lx + diagLen * lineX
    const p1y = ly + diagLen * lineY

    const clipped = clipSegmentToPolygon(p0x, p0y, p1x, p1y, ccwPoly)
    if (!clipped) continue

    const [[ax, ay], [bx, by]] = clipped
    const segLen = Math.sqrt(dist2(ax, ay, bx, by))
    if (segLen >= minLen) {
      segments.push([[ax, ay], [bx, by]])
    }
  }

  return segments
}

/** Ensure a polygon is counter-clockwise (positive area). */
function ensureCCW(poly: Vec2[]): Vec2[] {
  let area = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % n]
    area += ax * by - bx * ay
  }
  if (area < 0) return [...poly].reverse()
  return poly
}

// ---------------------------------------------------------------------------
// Core: buildHatchLines
// ---------------------------------------------------------------------------

export function buildHatchLines(
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  opts: HatchOptions,
): [number, number][][] {
  const canvasW = cols * tileSize
  const canvasH = rows * tileSize

  // Collect wall-edge points
  const wallEdgePts = collectWallEdgePoints(grid, cols, rows, tileSize)
  if (wallEdgePts.length === 0) return []

  // Generate tileable Voronoi seeds in [0, opts.tileSize] × [0, opts.tileSize]
  const vtSize = opts.tileSize
  const baseSeeds = poissonDisk(vtSize, vtSize, opts.minDistance, opts.maxDistance, 12345)

  // Tile the seeds to cover the full canvas with border ring for Voronoi computation
  // We'll work per-tile: for each tile offset, compute qualifying cells
  const tilesX = Math.ceil(canvasW / vtSize) + 1
  const tilesY = Math.ceil(canvasH / vtSize) + 1

  const allSegments: [number, number][][] = []

  // Pre-build Voronoi cells for the base tile with border ring
  // Border ring: replicate seeds into 8 surrounding copies
  type IndexedSeed = { pt: Vec2; tileIdx: number }
  const extSeeds: IndexedSeed[] = []

  // Add base seeds (tileIdx = actual seed index, -1 for border ghosts)
  for (let i = 0; i < baseSeeds.length; i++) {
    extSeeds.push({ pt: baseSeeds[i], tileIdx: i })
  }
  // Add ghost seeds in 8 surrounding directions
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      for (const p of baseSeeds) {
        extSeeds.push({
          pt: [p[0] + dx * vtSize, p[1] + dy * vtSize],
          tileIdx: -1,
        })
      }
    }
  }

  const extPts: Vec2[] = extSeeds.map(s => s.pt)

  // Compute Voronoi cell for each base seed within [-vtSize, 2*vtSize] bbox
  const margin = vtSize
  const bboxMinX = -margin
  const bboxMinY = -margin
  const bboxMaxX = vtSize + margin
  const bboxMaxY = vtSize + margin

  // Pre-compute cells for the base tile
  interface CellInfo {
    poly: Vec2[]     // relative to tile origin
    seedIdx: number  // index in baseSeeds (for angle)
  }
  const baseCells: CellInfo[] = []

  for (let i = 0; i < baseSeeds.length; i++) {
    const poly = voronoiCell(extPts, i, bboxMinX, bboxMinY, bboxMaxX, bboxMaxY)
    // Clip cell to [0, vtSize] × [0, vtSize]
    let clipped = poly
    clipped = clipPolygonByHalfPlane(clipped, -1, 0, 0)         // x >= 0
    clipped = clipPolygonByHalfPlane(clipped, 1, 0, vtSize)     // x <= vtSize
    clipped = clipPolygonByHalfPlane(clipped, 0, -1, 0)         // y >= 0
    clipped = clipPolygonByHalfPlane(clipped, 0, 1, vtSize)     // y <= vtSize
    if (clipped.length >= 3) {
      baseCells.push({ poly: clipped, seedIdx: i })
    }
  }

  // Stamp tiles across the canvas
  let globalCellIndex = 0
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const offsetX = tx * vtSize
      const offsetY = ty * vtSize

      for (const cell of baseCells) {
        const cellIdx = globalCellIndex++
        // Translate cell polygon to canvas coordinates
        const worldPoly: Vec2[] = cell.poly.map(([x, y]) => [x + offsetX, y + offsetY])

        // Check if any part of this cell is within the canvas
        let anyInCanvas = false
        for (const [x, y] of worldPoly) {
          if (x >= 0 && x <= canvasW && y >= 0 && y <= canvasH) {
            anyInCanvas = true
            break
          }
        }
        if (!anyInCanvas) continue

        // Compute centroid in world space
        const [cx, cy] = centroid(worldPoly)

        // Check wall proximity
        if (!isNearWallEdge(cx, cy, wallEdgePts, opts.wallDistance)) continue

        // Clip to wall tiles only before generating hatch lines
        const angle = cellAngle(cellIdx)
        const minLen = opts.minDistance / 3

        let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity
        for (const [x, y] of worldPoly) {
          if (x < bMinX) bMinX = x; if (y < bMinY) bMinY = y
          if (x > bMaxX) bMaxX = x; if (y > bMaxY) bMaxY = y
        }
        const cCol0 = Math.max(0, Math.floor(bMinX / tileSize))
        const cCol1 = Math.min(cols - 1, Math.floor(bMaxX / tileSize))
        const cRow0 = Math.max(0, Math.floor(bMinY / tileSize))
        const cRow1 = Math.min(rows - 1, Math.floor(bMaxY / tileSize))

        for (let r = cRow0; r <= cRow1; r++) {
          for (let c = cCol0; c <= cCol1; c++) {
            if (getLocalTile(grid, cols, c, r) !== WALL) continue
            const tx0 = c * tileSize
            const ty0 = r * tileSize
            const tx1 = tx0 + tileSize
            const ty1 = ty0 + tileSize
            let wallClipped = worldPoly
            wallClipped = clipPolygonByHalfPlane(wallClipped, -1, 0, -tx0)
            wallClipped = clipPolygonByHalfPlane(wallClipped, 1, 0, tx1)
            wallClipped = clipPolygonByHalfPlane(wallClipped, 0, -1, -ty0)
            wallClipped = clipPolygonByHalfPlane(wallClipped, 0, 1, ty1)
            if (wallClipped.length < 3) continue
            const segs = generateCellLines(wallClipped, angle, opts.spacing, minLen)
            for (const seg of segs) allSegments.push(seg)
          }
        }
      }
    }
  }

  return allSegments
}

// ---------------------------------------------------------------------------
// Rough-line post-processing pipeline
// ---------------------------------------------------------------------------

/** Simple LCG seeded RNG — returns [0, 1). */
function makeLCG(seed: number): () => number {
  let s = seed | 0
  return function rng(): number {
    s = Math.imul(s + 0x6d2b79f5, 0x735a2d97)
    s = ((s << 15) | (s >>> 17)) ^ Math.imul(s, 0x1b56c4e9)
    return (s >>> 0) / 0x100000000
  }
}

function randomRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min)
}

/**
 * Stage 1: Maybe split a 2-point segment into two offset halves.
 */
function shiftSegment(
  p0: [number, number],
  p1: [number, number],
  opts: RoughLineOptions,
  rng: () => number,
): [number, number][][] {
  if (rng() >= opts.shiftRate) return [[p0, p1]]

  // Random interior split point t in [0.2, 0.8]
  const t = 0.2 + rng() * 0.6
  const midX = p0[0] + t * (p1[0] - p0[0])
  const midY = p0[1] + t * (p1[1] - p0[1])

  // Perpendicular direction
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-10) return [[p0, p1]]
  const perpX = -dy / len
  const perpY = dx / len

  const amount = randomRange(opts.shiftAmountMin, opts.shiftAmountMax, rng)
  const sign = rng() < 0.5 ? 1 : -1
  const offsetX = sign * amount * perpX
  const offsetY = sign * amount * perpY

  const mid2: [number, number] = [midX + offsetX, midY + offsetY]

  return [
    [p0, [midX, midY]],
    [mid2, p1],
  ]
}

/**
 * Stage 2: Subdivide a 2-point segment into sub-segments of random length.
 * If min === max === 1 this is a pass-through (just return [p0, p1]).
 */
function subdivide(
  points: [number, number][],
  minLen: number,
  maxLen: number,
  rng: () => number,
): [number, number][] {
  const [p0, p1] = points
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const totalLen = Math.sqrt(dx * dx + dy * dy)

  // Pass-through when trivial subdivision requested
  if (minLen === 1 && maxLen === 1) return [p0, p1]
  if (totalLen < 1e-10) return [p0, p1]

  const result: [number, number][] = [p0]
  let walked = 0
  while (walked < totalLen) {
    const step = randomRange(minLen, maxLen, rng)
    walked += step
    if (walked >= totalLen) break
    const frac = walked / totalLen
    result.push([p0[0] + frac * dx, p0[1] + frac * dy])
  }
  result.push(p1)
  return result
}

/**
 * Simple 1D value noise: linearly interpolates between random values at integer positions.
 * Seeded via a pre-computed table using the given rng snapshot.
 */
function makeValueNoise(rng: () => number): (t: number) => number {
  // Build a table of 256 random values
  const TABLE_SIZE = 256
  const table: number[] = []
  for (let i = 0; i < TABLE_SIZE; i++) table.push(rng() * 2 - 1)

  return function noise(t: number): number {
    const i0 = Math.floor(t) & (TABLE_SIZE - 1)
    const i1 = (i0 + 1) & (TABLE_SIZE - 1)
    const frac = t - Math.floor(t)
    // Smoothstep interpolation
    const u = frac * frac * (3 - 2 * frac)
    return table[i0] * (1 - u) + table[i1] * u
  }
}

/**
 * Stage 3: Displace each point perpendicularly using value noise (scribble).
 */
function scribble(
  points: [number, number][],
  scale: number,
  amplitude: number,
  rng: () => number,
): [number, number][] {
  if (amplitude === 0 || points.length < 2) return points

  const noise = makeValueNoise(rng)

  const first = points[0]
  const last = points[points.length - 1]
  const mainDx = last[0] - first[0]
  const mainDy = last[1] - first[1]
  const mainLen = Math.sqrt(mainDx * mainDx + mainDy * mainDy)
  if (mainLen < 1e-10) return points

  const dirX = mainDx / mainLen
  const dirY = mainDy / mainLen
  const perpX = -dirY
  const perpY = dirX

  return points.map((pt): [number, number] => {
    const proj = (pt[0] - first[0]) * dirX + (pt[1] - first[1]) * dirY
    const t = proj * scale
    const disp = noise(t) * amplitude
    return [pt[0] + disp * perpX, pt[1] + disp * perpY]
  })
}

/**
 * Stage 4: Add slow lateral drift via low-frequency noise.
 */
function addBlemishes(
  points: [number, number][],
  noiseScale: number,
  amplitude: number,
  shift: number,
  rng: () => number,
): [number, number][] {
  if (amplitude === 0 || points.length < 2) return points

  const noise = makeValueNoise(rng)

  const first = points[0]
  const last = points[points.length - 1]
  const mainDx = last[0] - first[0]
  const mainDy = last[1] - first[1]
  const mainLen = Math.sqrt(mainDx * mainDx + mainDy * mainDy)
  if (mainLen < 1e-10) return points

  const dirX = mainDx / mainLen
  const dirY = mainDy / mainLen
  const perpX = -dirY
  const perpY = dirX

  return points.map((pt): [number, number] => {
    const proj = (pt[0] - first[0]) * dirX + (pt[1] - first[1]) * dirY
    const t = proj * noiseScale
    const raw = noise(t)
    const disp = Math.max(Math.abs(raw) - shift * amplitude, 0) * (raw < 0 ? -1 : 1)
    return [pt[0] + disp * perpX, pt[1] + disp * perpY]
  })
}

/**
 * Stage 5: Randomly drop sub-segments, optionally leaving dots at gaps.
 */
function addSkips(
  points: [number, number][],
  skipRate: number,
  noDotRate: number,
  rng: () => number,
): [number, number][][] {
  if (skipRate === 0) return [points]
  if (points.length < 2) return [points]

  const result: [number, number][][] = []
  let current: [number, number][] = [points[0]]

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]

    if (rng() < skipRate) {
      // Drop this sub-segment
      if (current.length >= 2) {
        result.push(current)
      }
      current = [b]
      // Optionally insert a tiny "dot" at the midpoint
      if (rng() >= noDotRate) {
        const mx = (a[0] + b[0]) / 2
        const my = (a[1] + b[1]) / 2
        const eps = 0.5
        result.push([[mx - eps, my], [mx + eps, my]])
      }
    } else {
      current.push(b)
    }
  }

  if (current.length >= 2) result.push(current)
  return result
}

/**
 * Convert clean 2-point segments into wobbly, gappy, hand-drawn-looking polylines.
 */
export function roughenSegments(
  segments: [number, number][][],
  opts: RoughLineOptions,
  seed = 0,
): [number, number][][] {
  const rng = makeLCG(seed)

  const result: [number, number][][] = []
  for (const seg of segments) {
    if (seg.length < 2) continue
    const p0 = seg[0] as [number, number]
    const p1 = seg[1] as [number, number]

    // Stage 1: maybe shift
    const shifted = shiftSegment(p0, p1, opts, rng)

    for (const [a, b] of shifted) {
      // Stage 2: subdivide
      const pts = subdivide([a, b], opts.segmentSizeMin, opts.segmentSizeMax, rng)
      // Stage 3: scribble
      const scribbled = scribble(pts, opts.scribbleScale, opts.scribbleAmplitude, rng)
      // Stage 4: blemishes
      const blemished = addBlemishes(scribbled, opts.majorNoiseScale, opts.majorNoiseAmplitude, opts.majorNoiseShift, rng)
      // Stage 5: add skips — produces multiple polylines
      const skipped = addSkips(blemished, opts.segmentSkipRate, opts.noDotRate, rng)
      for (const polyline of skipped) result.push(polyline)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Shadow cells (simplified stub for now)
// ---------------------------------------------------------------------------

export function drawShadow(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
): void {
  // TODO: Implement shadow pass with filled Voronoi cells near walls
  // For now, this is a placeholder to prevent import errors
}

// ---------------------------------------------------------------------------
// drawHatching — public canvas API
// ---------------------------------------------------------------------------

export function drawHatching(
  ctx: CanvasRenderingContext2D,
  grid: Uint8Array,
  cols: number,
  rows: number,
  tileSize: number,
  color: string,
): void {
  ctx.save()

  // Hard clip to wall tiles so floating-point geometry errors can't bleed onto floors
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (getLocalTile(grid, cols, c, r) === WALL) {
        ctx.rect(c * tileSize, r * tileSize, tileSize, tileSize)
      }
    }
  }
  ctx.clip()

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.lineCap = 'round'

  const segments = buildHatchLines(grid, cols, rows, tileSize, DEFAULT_HATCH_OPTS)
  const roughened = roughenSegments(segments, DEFAULT_ROUGH_OPTS, 42)

  for (const polyline of roughened) {
    if (polyline.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(polyline[0][0], polyline[0][1])
    for (let i = 1; i < polyline.length; i++) {
      ctx.lineTo(polyline[i][0], polyline[i][1])
    }
    ctx.stroke()
  }

  ctx.restore()
}
