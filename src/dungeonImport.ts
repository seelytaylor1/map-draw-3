import type { Stamp } from './stamps'

export interface DungeonImportResult {
  source: 'Watabou One Page Dungeon' | 'donjon Random Dungeon'
  cols: number
  rows: number
  grid: Uint8Array
  stamps: Stamp[]
  labels: Array<{ id: string; col: number; row: number; text: string }>
  diagnostics: string[]
}

const DONJON_FLAGS = { room: 0x02, corridor: 0x04, arch: 0x10000, door: 0x20000, locked: 0x40000, trapped: 0x80000, secret: 0x100000, portcullis: 0x200000, stairsDown: 0x400000, stairsUp: 0x800000 }
const MAX_IMPORT_DIMENSION = 400

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function numberField(value: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = finite(value[key])
    if (n !== null) return n
  }
  return null
}

function stamp(type: string, col: number, row: number, rotation: 0 | 90 | 180 | 270): Stamp {
  return { id: crypto.randomUUID(), type, col, row, rotation, z: 0, layerId: 'map' }
}

function parseDonjon(root: Record<string, unknown>): DungeonImportResult {
  const matrix = [root.cell, root.cells, root.map].find(Array.isArray) as unknown[] | undefined
  if (!matrix || matrix.length === 0 || !Array.isArray(matrix[0])) {
    throw new Error('This looks like a donjon export, but it has no rectangular cell matrix. Import the dungeon JSON export, not the image or HTML file.')
  }
  const sourceRows = matrix as unknown[][]
  const cols = sourceRows[0].length
  const rows = sourceRows.length
  if (cols < 1 || cols > MAX_IMPORT_DIMENSION || rows > MAX_IMPORT_DIMENSION || sourceRows.some(line => !Array.isArray(line) || line.length !== cols)) {
    throw new Error(`The donjon cell matrix must be rectangular and no larger than ${MAX_IMPORT_DIMENSION} × ${MAX_IMPORT_DIMENSION} cells.`)
  }
  const grid = new Uint8Array(cols * rows)
  const stamps: Stamp[] = []
  const diagnostics: string[] = []
  const nameByFlag: Array<[number, string]> = [
    [DONJON_FLAGS.arch, 'DoorArchway1x1'], [DONJON_FLAGS.locked, 'DoorLocked1x1'],
    [DONJON_FLAGS.trapped, 'DoorTrapped1x1'], [DONJON_FLAGS.secret, 'DoorSecret1x1'],
    [DONJON_FLAGS.portcullis, 'DoorPortcullis1x1'], [DONJON_FLAGS.door, 'Door1x1'],
  ]
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = sourceRows[row][col]
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        const flags = cell >>> 0
        if ((flags & (DONJON_FLAGS.room | DONJON_FLAGS.corridor)) !== 0) grid[row * cols + col] = 1
        const door = nameByFlag.find(([flag]) => (flags & flag) !== 0)
        if (door) {
          const vertical = (col > 0 && (Number(sourceRows[row]?.[col - 1]) & 6) !== 0) || (col + 1 < cols && (Number(sourceRows[row]?.[col + 1]) & 6) !== 0)
          stamps.push(stamp(door[1], col, row, vertical ? 90 : 0))
        }
        if (flags & DONJON_FLAGS.stairsDown) stamps.push(stamp('StairSpiralSquareDown1x1', col, row, 0))
        else if (flags & DONJON_FLAGS.stairsUp) stamps.push(stamp('StairSpiralSquareUp1x1', col, row, 0))
      } else if (typeof cell === 'string') {
        const glyph = cell.trim().toLowerCase()
        if (glyph === '.' || glyph === ' ' || glyph === 'f' || glyph === 'r' || glyph === 'c') grid[row * cols + col] = 1
      }
    }
  }
  if (!grid.some(value => value !== 0)) throw new Error('The donjon matrix contains no room or corridor cells. The file may use an unsupported generator format.')
  diagnostics.push('Donjon cell flags were converted to floor, doors, and stairs. Generator room descriptions and custom symbols are not imported.')
  if (Array.isArray(root.room)) diagnostics.push(`${root.room.length} room records were present; their descriptive text was not copied.`)
  return { source: 'donjon Random Dungeon', cols, rows, grid, stamps, labels: [], diagnostics }
}

function parseWatabou(root: Record<string, unknown>): DungeonImportResult {
  const w = numberField(root, 'cols', 'width', 'w')
  const h = numberField(root, 'rows', 'height', 'h')
  const unit = Math.max(1, numberField(root, 'cellSize', 'cell_size', 'scale') ?? 1)
  const rooms = Array.isArray(root.rects) ? root.rects : Array.isArray(root.rooms) ? root.rooms : Array.isArray(root.room) ? root.room : []
  const corridors = Array.isArray(root.corridors) ? root.corridors : Array.isArray(root.paths) ? root.paths : []
  const doors = Array.isArray(root.doors) ? root.doors : Array.isArray(root.door) ? root.door : []
  const notes = Array.isArray(root.notes) ? root.notes : Array.isArray(root.labels) ? root.labels : []
  const roundRooms = Array.isArray(root.roundRects) ? root.roundRects : []
  const geometry = [...rooms, ...roundRooms, ...corridors].map(object).filter((item): item is Record<string, unknown> => item !== null)
  if (!geometry.length) throw new Error('This is not a Map Draw save or a recognized Watabou One Page Dungeon export. Expected room/corridor geometry or a donjon cell matrix.')

  let maxX = w ?? 0
  let maxY = h ?? 0
  let minX = Infinity
  let minY = Infinity
  const polygons: Array<{ points: Array<{ x: number; y: number }>; label?: string }> = []
  for (const item of geometry) {
    const x = numberField(item, 'x', 'col', 'left')
    const y = numberField(item, 'y', 'row', 'top')
    const width = numberField(item, 'width', 'w', 'cols')
    const height = numberField(item, 'height', 'h', 'rows')
    const rawPoints = Array.isArray(item.points) ? item.points : Array.isArray(item.vertices) ? item.vertices : null
    const points: Array<{ x: number; y: number }> = []
    if (rawPoints) {
      for (const point of rawPoints) {
        if (Array.isArray(point) && finite(point[0]) !== null && finite(point[1]) !== null) points.push({ x: point[0] as number, y: point[1] as number })
        else {
          const p = object(point)
          const px = p && numberField(p, 'x', 'col')
          const py = p && numberField(p, 'y', 'row')
          if (px !== null && px !== undefined && py !== null && py !== undefined) points.push({ x: px, y: py })
        }
      }
    }
    if (!points.length && x !== null && y !== null && width !== null && height !== null) {
      if (item.rotunda === true || roundRooms.includes(item)) {
        const centerX = x + width / 2, centerY = y + height / 2
        for (let index = 0; index < 32; index++) {
          const angle = index * Math.PI * 2 / 32
          points.push({ x: centerX + Math.cos(angle) * width / 2, y: centerY + Math.sin(angle) * height / 2 })
        }
      } else {
        points.push({ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height })
      }
    }
    if (points.length < 3) continue
    for (const point of points) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
    }
    polygons.push({ points, label: typeof item.name === 'string' ? item.name : typeof item.label === 'string' ? item.label : undefined })
  }
  if (!polygons.length) throw new Error('Watabou export had no closed room or corridor shapes. No map data was changed.')
  const coordinateScale = maxX > MAX_IMPORT_DIMENSION || maxY > MAX_IMPORT_DIMENSION ? unit : 1
  const cols = Math.min(MAX_IMPORT_DIMENSION, Math.max(1, Math.ceil((maxX - Math.min(0, minX)) / coordinateScale)))
  const rows = Math.min(MAX_IMPORT_DIMENSION, Math.max(1, Math.ceil((maxY - Math.min(0, minY)) / coordinateScale)))
  if (maxX / coordinateScale > MAX_IMPORT_DIMENSION || maxY / coordinateScale > MAX_IMPORT_DIMENSION) throw new Error(`Watabou map geometry is larger than ${MAX_IMPORT_DIMENSION} × ${MAX_IMPORT_DIMENSION} cells.`)
  const offsetX = Math.max(0, -minX / coordinateScale)
  const offsetY = Math.max(0, -minY / coordinateScale)
  const grid = new Uint8Array(cols * rows)
  for (const polygon of polygons) {
    const pts = polygon.points.map(point => ({ x: point.x / coordinateScale + offsetX, y: point.y / coordinateScale + offsetY }))
    const left = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x))))
    const right = Math.min(cols - 1, Math.ceil(Math.max(...pts.map(p => p.x))))
    const top = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y))))
    const bottom = Math.min(rows - 1, Math.ceil(Math.max(...pts.map(p => p.y))))
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const x = col + 0.5, y = row + 0.5
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j]
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
      }
      if (inside) grid[row * cols + col] = 1
    }
  }
  const stamps: Stamp[] = []
  for (const entry of doors) {
    const door = object(entry)
    if (!door) continue
    const col = numberField(door, 'col', 'x'), row = numberField(door, 'row', 'y')
    if (col === null || row === null) continue
    const numericType = numberField(door, 'type')
    const kind = String(door.kind ?? door.type ?? '').toLowerCase()
    if (numericType === 0) continue
    if (numericType === 3 || numericType === 9 || kind.includes('stair') || kind.includes('step')) {
      stamps.push(stamp('Stairs1x1_01', Math.floor(col / coordinateScale + offsetX), Math.floor(row / coordinateScale + offsetY), 0))
      continue
    }
    const type = numericType === 2 || kind.includes('arch') ? 'DoorArchway1x1'
      : numericType === 4 || kind.includes('port') ? 'DoorPortcullis1x1'
        : numericType === 6 || kind.includes('secret') ? 'DoorSecret1x1'
          : numericType === 7 || kind.includes('bar') ? 'DoorGate1x1'
            : numericType === 5 || kind.includes('special') ? 'DoorMagic1x1'
              : numericType === 8 ? 'Door1x1'
                : kind.includes('lock') ? 'DoorLocked1x1' : 'Door1x1'
    const dir = object(door.dir)
    const dirX = dir ? numberField(dir, 'x') : null
    const dirY = dir ? numberField(dir, 'y') : null
    const rotation = dirX !== null && dirX !== undefined && dirX !== 0 ? 0
      : dirY !== null && dirY !== undefined && dirY !== 0 ? 90
        : (Math.abs(numberField(door, 'rotation', 'angle') ?? 0) % 180 === 90 ? 90 : 0)
    stamps.push(stamp(type, Math.floor(col / coordinateScale + offsetX), Math.floor(row / coordinateScale + offsetY), rotation))
  }
  const labels = notes.flatMap(entry => {
    const note = object(entry)
    if (!note) return []
    const pos = object(note.pos)
    const col = numberField(note, 'col', 'x') ?? (pos ? numberField(pos, 'x', 'col') : null)
    const row = numberField(note, 'row', 'y') ?? (pos ? numberField(pos, 'y', 'row') : null)
    const text = typeof note.text === 'string' ? note.text : typeof note.description === 'string' ? note.description : typeof note.note === 'string' ? note.note : ''
    if (col === null || row === null || !text) return []
    return [{ id: crypto.randomUUID(), col: Math.max(0, Math.floor(col / coordinateScale + offsetX)), row: Math.max(0, Math.floor(row / coordinateScale + offsetY)), text: text.slice(0, 500) }]
  })
  const diagnostics = ['Watabou JSON does not provide a documented stable schema. Imported room rectangles, round rooms, door/stair records, and notes in the supported fields.']
  const omitted = [
    Array.isArray(root.water) && root.water.length > 0 ? 'water features' : '',
    Array.isArray(root.columns) && root.columns.length > 0 ? 'columns' : '',
    Array.isArray(root.props) && root.props.length > 0 ? 'props' : '',
    typeof root.story === 'string' && root.story ? 'story text' : '',
    typeof root.title === 'string' && root.title ? 'generator title' : '',
  ].filter(Boolean)
  if (omitted.length) diagnostics.push(`Not imported: ${omitted.join(', ')}.`)
  const source = 'Watabou One Page Dungeon'
  return { source, cols, rows, grid, stamps, labels, diagnostics }
}

export function importExternalDungeon(raw: unknown): DungeonImportResult {
  const root = object(raw)
  if (!root) throw new Error('The import file must contain a JSON object.')
  if (root.version === 1 && root.grids) throw new Error('This is already a Map Draw file. Use Load instead of Dungeon import.')
  const nested = object(root.dungeon) ?? root
  if (Array.isArray(nested.cell) || Array.isArray(nested.cells) || (Array.isArray(nested.map) && Array.isArray(nested.map[0]))) return parseDonjon(nested)
  if (Array.isArray(nested.rects) || Array.isArray(nested.rooms) || Array.isArray(nested.room)) return parseWatabou(nested)
  throw new Error('Unrecognized dungeon JSON. Expected a Watabou One Page Dungeon rects array or a donjon dungeon cell matrix.')
}
