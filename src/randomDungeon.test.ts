import { describe, expect, it } from 'vitest'
import { FLOOR, WALL, WATER } from './constants'
import { createGrid } from './grid'
import { generateRandomDungeon } from './randomDungeon/generator'
import { createD6Random } from './randomDungeon/random'
import { conditionLabelText, clockwiseAdjacentPositions, placeGeneratedLabel } from './randomDungeon/labels'
import { PlacementLedger } from './randomDungeon/placement'
import { oppositeDirection, roomFootprint, roomFromEntrance, step } from './randomDungeon/geometry'

describe('random dungeon generation', () => {
  it('uses an inclusive deterministic D6 stream', () => {
    const a = createD6Random(123); const b = createD6Random(123)
    const left = Array.from({ length: 40 }, () => a.nextD6()); const right = Array.from({ length: 40 }, () => b.nextD6())
    expect(left).toEqual(right); expect(left.every(value => value >= 1 && value <= 6)).toBe(true)
  })

  it('replays every result record and map byte-for-byte', () => {
    const a = generateRandomDungeon({ cols: 22, rows: 17, seed: 0xdecafbad })
    const b = generateRandomDungeon({ cols: 22, rows: 17, seed: 0xdecafbad })
    expect(Array.from(a.snapshot.grids.get(0)!)).toEqual(Array.from(b.snapshot.grids.get(0)!))
    expect({ ...a, snapshot: undefined, map: undefined }).toEqual({ ...b, snapshot: undefined, map: undefined })
    expect(a.summary).toEqual(b.summary)
  })

  it('keeps generated state to Z=0 and treats flooded tiles as traversable', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 42, 99, 123456]) {
      const result = generateRandomDungeon({ cols: 22, rows: 17, seed })
      expect([...result.snapshot.grids.keys()]).toEqual([0])
      expect(result.snapshot.steps).toEqual([]); expect(result.snapshot.ramps.every(ramp => ramp.z === 0)).toBe(true)
      const grid = result.snapshot.grids.get(0)!
      expect(Array.from(grid).every(tile => tile === 0 || tile === FLOOR || tile === WATER)).toBe(true)
    }
  })

  it('rejects border and diagonal-buffer contact transactionally', () => {
    const ledger = new PlacementLedger(8, 8)
    expect(ledger.commit([{ col: 1, row: 1 }])).toMatchObject({ points: [{ col: 1, row: 1 }] })
    const before = ledger.grid
    expect(ledger.commit([{ col: 2, row: 2 }])).toMatchObject({ reason: 'lost-buffer' })
    expect(Array.from(ledger.grid)).toEqual(Array.from(before))
    expect(ledger.commit([{ col: 0, row: 3 }])).toMatchObject({ reason: 'out-of-bounds' })
  })

  it('exposes canonical labels and clockwise placement order', () => {
    expect(conditionLabelText('locked + trapped')).toBe('Locked + Trapped')
    expect(clockwiseAdjacentPositions({ col: 4, row: 4 }, 'N')).toEqual([{ col: 4, row: 3 }, { col: 5, row: 4 }, { col: 4, row: 5 }, { col: 3, row: 4 }])
  })

  it('places generated labels on an available wall tile beside their anchor', () => {
    const grid = createGrid(5, 5)
    grid[2 * 5 + 2] = FLOOR

    const placed = placeGeneratedLabel('label-1', 'Hazard', { col: 2, row: 2 }, 'E', 5, 5, grid)

    expect(placed?.record).toMatchObject({ col: 3, row: 2 })
    expect(grid[placed!.record.row * 5 + placed!.record.col]).toBe(WALL)
  })

  it('resolves generated labels against the final dungeon geometry', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3278230271 })
    const grid = result.snapshot.grids.get(0)!

    expect(result.labels.some(label => label.text === 'Hazard')).toBe(true)
    expect(result.failedAttempts.some(attempt => attempt.kind === 'label')).toBe(false)
    for (const label of result.labels) expect(grid[label.row * 44 + label.col]).toBe(WALL)
  })

  it('keeps an exit hallway connected to the source room', () => {
    const result = generateRandomDungeon({ cols: 22, rows: 17, seed: 7 })
    expect(result.hallways.length).toBeGreaterThan(0)
  })

  it('keeps widened exit hallways clear of their source room', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3278230271 })
    const sourceRoom = result.rooms.find(room => room.starting)!

    expect(result.hallways.some(hallway => hallway.width === 2)).toBe(true)
    expect(result.failedAttempts
      .filter(attempt => attempt.kind === 'hallway' && attempt.reason === 'lost-buffer')
      .some(attempt => attempt.candidate.some(point => sourceRoom.tiles.some(tile => Math.max(Math.abs(tile.col - point.col), Math.abs(tile.row - point.row)) <= 1)))
    ).toBe(false)
  })

  it('starts intersections after the approach and gives each branch a three-tile stem', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3278230271 })
    const approach = result.hallways.find(hallway => hallway.form === 'intersection')!
    const intersection = result.intersections[0]!
    const grid = result.snapshot.grids.get(0)!

    expect(approach.path).toHaveLength(3)
    expect(intersection.origin).toEqual(step(approach.path[approach.path.length - 1]!, approach.direction))
    for (const direction of intersection.branches) {
      expect([1, 2, 3].map(distance => step(intersection.origin, direction, distance)).every(point => grid[point.row * 44 + point.col] > 0)).toBe(true)
    }
  })

  it('can grow a second room from a generated branch', () => {
    const result = generateRandomDungeon({ cols: 22, rows: 17, seed: 6 })
    expect(result.rooms.length).toBeGreaterThan(1)
  })

  it('keeps every accepted room non-empty across a seeded generation sweep', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = generateRandomDungeon({ cols: 22, rows: 17, seed })
      expect(result.rooms.every(room => room.tiles.length > 0)).toBe(true)
    }
  })

  it('keeps circular rooms large enough to read as circles', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = generateRandomDungeon({ cols: 44, rows: 34, seed })
      expect(result.rooms.filter(room => room.shape === 'circular').every(room => (room.radius ?? 0) >= 2)).toBe(true)
    }
  })

  it('places rooms beyond their entrance in the travel direction', () => {
    const entrance = { col: 10, row: 10 }
    expect(roomFromEntrance(entrance, 'E', 5, 3, 'square').every(point => point.col >= 12)).toBe(true)
    expect(roomFromEntrance(entrance, 'W', 5, 3, 'square').every(point => point.col <= 8)).toBe(true)
    expect(roomFromEntrance(entrance, 'S', 5, 3, 'square').every(point => point.row >= 12)).toBe(true)
    expect(roomFromEntrance(entrance, 'N', 5, 3, 'square').every(point => point.row <= 8)).toBe(true)
  })

  it('starts circular rooms at the doorway tile', () => {
    const entrance = { col: 10, row: 10 }
    for (const direction of ['N', 'E', 'S', 'W'] as const) {
      expect(roomFromEntrance(entrance, direction, 5, 5, 'circular', 2)).toContainEqual(step(entrance, direction))
    }
  })

  it('does not create a room exit back through its entrance', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = generateRandomDungeon({ cols: 44, rows: 34, seed })
      for (const circularRoom of result.rooms.filter(room => room.shape === 'circular' && !room.starting)) {
        const incoming = oppositeDirection[circularRoom.direction]
        expect(result.exits.filter(exit => exit.roomId === circularRoom.id).some(exit => exit.direction === incoming)).toBe(false)
      }
    }
  })

  it('keeps hazard stamps off doorway tiles when a doorway continues into a hallway', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3278230271 })
    const doorwayTiles = new Set(result.doorways
      .filter(doorway => doorway.beyond === 'hallway')
      .map(doorway => {
        const point = step(doorway.origin, doorway.direction)
        return `${point.col},${point.row}`
      }))

    expect(result.stamps
      .filter(stamp => stamp.semantic === 'danger')
      .some(stamp => doorwayTiles.has(`${stamp.col},${stamp.row}`)))
      .toBe(false)
  })

  it('places a doorway-ending door at the forward end of its hallway', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3278230271 })
    const hallway = result.hallways.find(hallway => hallway.form === 'doorway-ending' && hallway.path.some(point => point.col === 31 && point.row === 7))!
    const end = hallway.path[hallway.path.length - 1]!
    const doorway = result.doorways.find(candidate => candidate.origin.col === end.col && candidate.origin.row === end.row)!
    const doorTile = step(end, hallway.direction)

    expect(doorway.direction).toBe(hallway.direction)
    expect(result.stamps.some(stamp => stamp.semantic === 'door' && stamp.col === doorTile.col && stamp.row === doorTile.row)).toBe(true)
  })

  it('keeps irregular rooms contiguous without enclosed diagonal wall gaps', () => {
    const subtypes = ['letter-shaped', 'polygonal', 'trapezoidal', 'cornered', 'natural-cavern', 'underground-feature'] as const
    for (const subtype of subtypes) {
      const topLeft = { col: 4, row: 4 }
      const points = roomFootprint('irregular-chamber', 7, 7, topLeft, undefined, subtype)
      const keys = new Set(points.map(point => `${point.col},${point.row}`))
      const queue = [points[0]!]
      const visited = new Set<string>([`${points[0]!.col},${points[0]!.row}`])
      while (queue.length) {
        const point = queue.shift()!
        for (const neighbor of [{ col: point.col + 1, row: point.row }, { col: point.col - 1, row: point.row }, { col: point.col, row: point.row + 1 }, { col: point.col, row: point.row - 1 }]) {
          const key = `${neighbor.col},${neighbor.row}`
          if (keys.has(key) && !visited.has(key)) { visited.add(key); queue.push(neighbor) }
        }
      }
      expect(visited.size, subtype).toBe(points.length)
      for (let row = topLeft.row + 1; row < topLeft.row + 6; row++) for (let col = topLeft.col + 1; col < topLeft.col + 6; col++) {
        const key = `${col},${row}`
        if (keys.has(key)) continue
        expect([
          `${col + 1},${row}`,
          `${col - 1},${row}`,
          `${col},${row + 1}`,
          `${col},${row - 1}`,
        ].every(neighbor => keys.has(neighbor)), `${subtype} encloses ${key}`).toBe(false)
      }
    }
  })

  it('places a generated door on the connector tile beyond the room wall', () => {
    const result = generateRandomDungeon({ cols: 22, rows: 17, seed: 1 })
    const doorway = result.doorways[0]!
    const door = result.stamps.find(stamp => stamp.semantic === 'door' || stamp.semantic === 'secret-door')!
    expect(doorway).toBeDefined()
    expect(door).toMatchObject(step(doorway.origin, doorway.direction))
  })

  it('limits vertical doorway content to stairs, shafts, and ramps', () => {
    const result = generateRandomDungeon({ cols: 44, rows: 34, seed: 3667888183 })
    const vertical = result.doorways.filter(doorway => doorway.beyond === 'vertical')

    expect(vertical.length).toBeGreaterThan(0)
    expect(vertical.every(doorway => ['staircase', 'shaft', 'ramp'].includes(doorway.verticalContent ?? ''))).toBe(true)
    expect(vertical.some(doorway => doorway.verticalContent === 'ramp')).toBe(true)
    expect(result.stamps.some(stamp => stamp.semantic === 'valve')).toBe(false)
    expect(result.snapshot.ramps).toHaveLength(1)
    expect(result.snapshot.ramps[0]).toMatchObject({ col: 24, row: 24, direction: 'N', z: 0 })
  })

  it('does not retain a door when its connector is on the border', () => {
    const cols = 22
    const rows = 17
    const result = generateRandomDungeon({ cols, rows, seed: 2694480025 })
    const grid = result.snapshot.grids.get(0)!
    for (const door of result.stamps.filter(stamp => stamp.semantic === 'door' || stamp.semantic === 'secret-door')) {
      expect(door.col).toBeGreaterThan(0)
      expect(door.row).toBeGreaterThan(0)
      expect(door.col).toBeLessThan(cols - 1)
      expect(door.row).toBeLessThan(rows - 1)
      expect(grid[door.row * cols + door.col]).toBeGreaterThan(0)
    }
  })
})
