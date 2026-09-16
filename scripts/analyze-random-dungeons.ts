import { FLOOR, WATER } from '../src/constants'
import { generateLegacyRandomDungeon } from '../src/randomDungeon/legacy/generator'
import type { GenerationResult } from '../src/randomDungeon/legacy/types'

const cols = Number(process.argv[2] ?? 88)
const rows = Number(process.argv[3] ?? 68)
const sampleSize = Number(process.argv[4] ?? 100)
const firstSeed = Number(process.argv[5] ?? 1)

if (![cols, rows, sampleSize, firstSeed].every(Number.isFinite) || cols < 3 || rows < 3 || sampleSize < 1) {
  throw new Error('Usage: vite-node scripts/analyze-random-dungeons.ts [cols] [rows] [count] [firstSeed]')
}

const results = Array.from({ length: sampleSize }, (_, index) => generateLegacyRandomDungeon({
  cols,
  rows,
  seed: firstSeed + index,
}))

function countBy(values: Iterable<unknown>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = String(value ?? 'none')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function pct(count: number, total: number): string {
  return `${count} (${(count * 100 / total).toFixed(1)}%)`
}

function printCounts(title: string, counts: Map<string, number>, total: number): void {
  console.log(`\n${title}`)
  for (const [key, count] of counts) console.log(`  ${key}: ${pct(count, total)}`)
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function range(values: number[]): string {
  return values.length === 0 ? '0–0' : `${Math.min(...values)}–${Math.max(...values)}`
}

function connectedComponents(result: GenerationResult): { traversable: number; water: number; components: number; largest: number; sizes: number[]; points: Array<Array<{ col: number; row: number }>> } {
  const grid = result.snapshot.grids.get(0)!
  const key = (col: number, row: number) => `${col},${row}`
  const seen = new Set<string>()
  const componentSizes: number[] = []
  const componentPoints: Array<Array<{ col: number; row: number }>> = []
  let traversable = 0
  let water = 0
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const state = grid[row * cols + col]
    if (state === FLOOR || state === WATER) {
      traversable++
      if (state === WATER) water++
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const startKey = key(col, row)
    if (seen.has(startKey) || !result.snapshot.grids.get(0)![row * cols + col] || result.snapshot.grids.get(0)![row * cols + col] === 0) continue
    const queue = [{ col, row }]
    const points: Array<{ col: number; row: number }> = []
    seen.add(startKey)
    let size = 0
    while (queue.length) {
      const point = queue.shift()!
      size++
      points.push(point)
      for (const next of [
        { col: point.col + 1, row: point.row },
        { col: point.col - 1, row: point.row },
        { col: point.col, row: point.row + 1 },
        { col: point.col, row: point.row - 1 },
      ]) {
        if (next.col < 0 || next.row < 0 || next.col >= cols || next.row >= rows) continue
        const nextKey = key(next.col, next.row)
        const state = result.snapshot.grids.get(0)![next.row * cols + next.col]
        if (!seen.has(nextKey) && (state === FLOOR || state === WATER)) {
          seen.add(nextKey)
          queue.push(next)
        }
      }
    }
    componentSizes.push(size)
    componentPoints.push(points)
  }
  const ordered = componentPoints.map((points, index) => ({ points, size: componentSizes[index]! })).sort((a, b) => b.size - a.size)
  return { traversable, water, components: componentSizes.length, largest: Math.max(0, ...componentSizes), sizes: ordered.map(item => item.size), points: ordered.map(item => item.points) }
}

const allRooms = results.flatMap(result => result.rooms)
const allHallways = results.flatMap(result => result.hallways)
const allDoorways = results.flatMap(result => result.doorways)
const allIntersections = results.flatMap(result => result.intersections)
const allExits = results.flatMap(result => result.exits)
const allStamps = results.flatMap(result => result.stamps)
const allLabels = results.flatMap(result => result.labels)
const allFailures = results.flatMap(result => result.failedAttempts)
const topology = results.map(connectedComponents)

console.log(`Random dungeon sample: ${sampleSize} generations, seeds ${firstSeed}–${firstSeed + sampleSize - 1}, canvas ${cols}×${rows}`)
console.log(`Accepted records: ${allRooms.length} rooms, ${allHallways.length} hallways, ${allDoorways.length} doorways, ${allIntersections.length} intersections`)
console.log(`Averages: ${mean(results.map(result => result.rooms.length)).toFixed(1)} rooms, ${mean(results.map(result => result.hallways.length)).toFixed(1)} hallways, ${mean(results.map(result => result.failedAttempts.length)).toFixed(1)} failed attempts, ${mean(topology.map(item => item.traversable)).toFixed(1)} traversable tiles`)
console.log(`Ranges: rooms ${range(results.map(result => result.rooms.length))}, hallways ${range(results.map(result => result.hallways.length))}, failed attempts ${range(results.map(result => result.failedAttempts.length))}`)
console.log(`Room targets: ${pct(results.filter(result => result.rooms.length >= 10 && result.rooms.length <= 15).length, sampleSize)} in the 10–15 range; ${pct(results.filter(result => result.rooms.length === result.roomTarget).length, sampleSize)} hit their exact target`)
console.log(`Compact fallbacks: ${allRooms.filter(room => room.placement === 'compact-fallback').length} rooms, ${allHallways.filter(hallway => hallway.placement === 'compact-fallback').length} hallways`)
console.log(`Starting rooms accepted: ${pct(results.filter(result => result.summary.startingRoom === 'accepted').length, sampleSize)}`)
console.log(`Single-room maps with no accepted hallway: ${pct(results.filter(result => result.rooms.length === 1 && result.hallways.length === 0).length, sampleSize)}; maps with at least one follow-up room: ${pct(results.filter(result => result.rooms.length > 1).length, sampleSize)}`)
console.log(`Connected traversable maps: ${pct(topology.filter(item => item.components === 1).length, sampleSize)}; average components ${mean(topology.map(item => item.components)).toFixed(2)}; water present ${pct(topology.filter(item => item.water > 0).length, sampleSize)}`)
for (const [index, item] of topology.entries()) if (item.components > 1) console.log(`  Disconnected seed ${results[index]!.seed}: components ${item.sizes.join('+')} / ${item.traversable} traversable tiles`)
for (const [index, item] of topology.entries()) if (item.components > 1) {
  const details = item.points.slice(1).map(points => {
    const minCol = Math.min(...points.map(point => point.col)); const maxCol = Math.max(...points.map(point => point.col))
    const minRow = Math.min(...points.map(point => point.row)); const maxRow = Math.max(...points.map(point => point.row))
    return `${points.length} tiles bbox ${minCol},${minRow}–${maxCol},${maxRow}`
  })
  console.log(`    small components: ${details.join('; ')}`)
  for (const points of item.points.slice(1)) {
    const keys = new Set(points.map(point => `${point.col},${point.row}`))
    const rooms = results[index]!.rooms.filter(room => room.tiles.some(point => keys.has(`${point.col},${point.row}`))).map(room => `${room.id}:${room.shape}/${room.irregularSubtype ?? '-'} ${room.width}x${room.height} ${room.direction}`)
    const hallways = results[index]!.hallways.filter(hallway => hallway.path.some(point => keys.has(`${point.col},${point.row}`))).map(hallway => `${hallway.id}:${hallway.form}`)
    const intersections = results[index]!.intersections.filter(intersection => keys.has(`${intersection.origin.col},${intersection.origin.row}`)).map(intersection => `${intersection.id}:${intersection.kind}`)
    console.log(`    records: rooms [${rooms.join(', ')}], hallways [${hallways.join(', ')}], intersections [${intersections.join(', ')}]`)
  }
}

printCounts('Dungeon type', countBy(results.map(result => result.dungeonType)), sampleSize)
printCounts('Starting location', countBy(results.map(result => result.startingLocation)), sampleSize)
printCounts('Starting room shape', countBy(results.map(result => result.rooms.find(room => room.starting)?.shape ?? 'failed')), sampleSize)
printCounts('Room shape', countBy(allRooms.map(room => room.shape)), allRooms.length)
printCounts('Irregular room subtype', countBy(allRooms.filter(room => room.irregularSubtype).map(room => room.irregularSubtype)), allRooms.filter(room => room.irregularSubtype).length)
printCounts('Room feature metadata', countBy(allRooms.filter(room => room.feature).map(room => room.feature)), allRooms.filter(room => room.feature).length)
printCounts('Room exit pattern', countBy(allRooms.map(room => room.exits)), allRooms.length)
printCounts('Exit type', countBy(allExits.map(exit => exit.exitType)), allExits.length)
printCounts('Hallway form', countBy(allHallways.map(hallway => hallway.form)), allHallways.length)
printCounts('Hallway condition', countBy(allHallways.map(hallway => hallway.condition)), allHallways.length)
printCounts('Hallway width', countBy(allHallways.map(hallway => hallway.width)), allHallways.length)
printCounts('Hallway terminal status', countBy(allHallways.map(hallway => hallway.terminal ? 'terminal' : 'continues')), allHallways.length)
printCounts('Doorway category', countBy(allDoorways.map(doorway => doorway.category)), allDoorways.length)
printCounts('Door condition', countBy(allDoorways.map(doorway => doorway.condition)), allDoorways.length)
printCounts('Beyond doorway', countBy(allDoorways.map(doorway => doorway.beyond)), allDoorways.length)
printCounts('Vertical content', countBy(allDoorways.filter(doorway => doorway.verticalContent).map(doorway => doorway.verticalContent)), allDoorways.filter(doorway => doorway.verticalContent).length)
printCounts('Intersection kind', countBy(allIntersections.map(intersection => intersection.kind)), allIntersections.length)
printCounts('Stamp semantic', countBy(allStamps.map(stamp => stamp.semantic)), allStamps.length)
printCounts('Label text', countBy(allLabels.map(label => label.text)), allLabels.length)
printCounts('Failure reason', countBy(allFailures.map(attempt => attempt.reason)), allFailures.length)
printCounts('Failure kind', countBy(allFailures.map(attempt => attempt.kind)), allFailures.length)

console.log('\nDungeon type by average result')
for (const type of ['Caves', 'Tombs', 'Ruins']) {
  const subset = results.filter(result => result.dungeonType === type)
  console.log(`  ${type}: n=${subset.length}, rooms=${mean(subset.map(result => result.rooms.length)).toFixed(1)}, hallways=${mean(subset.map(result => result.hallways.length)).toFixed(1)}, failures=${mean(subset.map(result => result.failedAttempts.length)).toFixed(1)}, tiles=${mean(subset.map(result => connectedComponents(result).traversable)).toFixed(1)}`)
}

console.log('\nHighest-density seeds')
for (const result of results.slice().sort((a, b) => (b.rooms.length + b.hallways.length) - (a.rooms.length + a.hallways.length)).slice(0, 5)) {
  console.log(`  ${result.seed}: ${result.rooms.length} rooms, ${result.hallways.length} hallways, ${result.failedAttempts.length} failures, ${connectedComponents(result).traversable} tiles`)
}

console.log('\nLowest-density seeds')
for (const result of results.slice().sort((a, b) => (a.rooms.length + a.hallways.length) - (b.rooms.length + b.hallways.length)).slice(0, 5)) {
  console.log(`  ${result.seed}: ${result.rooms.length} rooms, ${result.hallways.length} hallways, ${result.failedAttempts.length} failures, ${connectedComponents(result).traversable} tiles`)
}
