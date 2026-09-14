import { FLOOR, WATER } from '../constants'
import { createGrid } from '../grid'
import { type Stamp, STAMP_TYPES } from '../stamps'
import { createD6Random, type D6Random, normalizeSeed } from './random'
import { rollBeyondDoorway, rollDifficultHallwayCondition, rollDoorCondition, rollDoorway, rollDungeonType, rollExitType, rollFeature, rollHallway, rollHallwayCondition, rollIntersection, rollIntersectionBranch, rollIrregularSubtype, rollLeftOrRight, rollRoom, rollRoomExits, rollStartingLocation, rollStartingRoom, rollVerticalContent } from './tables'
import { DIRECTIONS, directionVector, hallwayFootprint, intersectionFootprint, oppositeDirection, perimeterExits, roomFromEntrance, roomFootprint, step, turnLeft, turnRight, uniquePoints } from './geometry'
import { PlacementLedger } from './placement'
import { conditionLabelText, placeGeneratedLabel } from './labels'
import { makeGeneratedStamp, resolveStamp, type StampSemantic } from './stamps'
import { summarizeGeneration } from './summary'
import type { AppSnapshotShape, Direction, DoorCondition, DoorwayRecord, ExitRecord, FeatureType, GenerationAttempt, GenerationInput, GenerationResult, GeneratedLabelRecord, GeneratedStampRecord, HallwayCondition, HallwayForm, HallwayRecord, IntersectionRecord, Point, RoomRecord, RoomShape, StartingLocation } from './types'

type Branch = { id: string; origin: Point; direction: Direction; kind: 'hallway' | 'doorway' | 'room' | 'intersection'; sourceExitId?: string }

function directionAt(random: D6Random): Direction { return DIRECTIONS[(random.nextD6() - 1) % 4]! }
function d6(random: D6Random): number { return random.nextD6() }
function dimensionsFor(shape: RoomShape, random: D6Random): { width: number; height: number; radius?: number } {
  if (shape === 'square') { const n = d6(random); return { width: n, height: n } }
  if (shape === 'large-square') { const n = d6(random) + 3; return { width: n, height: n } }
  if (shape === 'rectangle') return { width: d6(random), height: d6(random) + 3 }
  if (shape === 'circular') { const radius = d6(random); return { width: radius * 2 + 1, height: radius * 2 + 1, radius } }
  if (shape === 'cave-opening') return { width: d6(random) + 3, height: d6(random) }
  return { width: d6(random), height: d6(random) }
}

function startingTopLeft(location: StartingLocation, cols: number, rows: number, width: number, height: number, random: D6Random): Point {
  if (location === 'center') return { col: Math.floor((cols - width) / 2), row: Math.floor((rows - height) / 2) }
  if (location === 'bottom-left') return { col: 1, row: rows - height - 1 }
  if (location === 'bottom-right') return { col: cols - width - 1, row: rows - height - 1 }
  if (location === 'top-left') return { col: 1, row: 1 }
  if (location === 'top-right') return { col: cols - width - 1, row: 1 }
  // `random` has already consumed its selector D6 in tables.ts. The two
  // coordinate rolls below choose a deterministic point in the legal range;
  // this is a bounded coordinate rule, not a fit-search or reroll.
  const colRange = Math.max(1, cols - width - 1); const rowRange = Math.max(1, rows - height - 1)
  return { col: 1 + Math.floor((colRange - 1) * (d6(random) - 1) / 5), row: 1 + Math.floor((rowRange - 1) * (d6(random) - 1) / 5) }
}

function exitsFor(room: RoomRecord, random: D6Random, nextId: () => string): ExitRecord[] {
  if (room.exits === 'none') return []
  const count = room.exits === 'opposite-doorways' ? 2 : room.exits === 'three-doorways' ? 3 : room.exits === 'three-and-secret' ? 4 : 1
  const first = directionAt(random)
  const directions = room.exits === 'opposite-doorways' ? [first, oppositeDirection[first]] : room.exits === 'three-doorways' || room.exits === 'three-and-secret' ? [first, turnLeft[first], turnRight[first], oppositeDirection[first]].slice(0, count) : [first]
  return directions.map((direction, index) => {
    const wall = perimeterExits(room.tiles, direction, count)[index % Math.max(1, perimeterExits(room.tiles, direction, count).length)] ?? room.tiles[0]!
    return { id: nextId(), roomId: room.id, origin: wall, direction, exitType: rollExitType(random), secret: room.exits === 'secret-doorway' || room.exits === 'three-and-secret' && index === count - 1, roll: 0 }
  })
}

export function generateRandomDungeon(input: GenerationInput): GenerationResult {
  if (!Number.isInteger(input.cols) || !Number.isInteger(input.rows) || input.cols < 3 || input.rows < 3) throw new Error('Canvas must be at least 3×3 tiles.')
  const seed = normalizeSeed(input.seed); const random = createD6Random(seed); let idCounter = 0
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`
  const ledger = new PlacementLedger(input.cols, input.rows, createGrid(input.cols, input.rows))
  const rooms: RoomRecord[] = []; const exits: ExitRecord[] = []; const hallways: GenerationResult['hallways'] = []; const stamps: GeneratedStampRecord[] = []; const labels: GeneratedLabelRecord[] = []; const failedAttempts: GenerationAttempt[] = []; const intersections: IntersectionRecord[] = []; const connectors: Point[] = []; const doorways: DoorwayRecord[] = []; const unmetRequirements: GenerationResult['unmetRequirements'] = []
  const queue: Branch[] = []
  const available = input.availableStampTypes ?? STAMP_TYPES
  const fail = (branchId: string, kind: GenerationAttempt['kind'], reason: GenerationAttempt['reason'], candidate: Point[], message: string) => failedAttempts.push({ id: nextId('attempt'), branchId, kind, reason, candidate: candidate.map(p => ({ ...p })), message })

  const addLabelIfPossible = (text: string, anchor: Point, facing: Direction, anchorKind: 'stamp' | 'hallway', branchId: string) => {
    const result = placeGeneratedLabel(nextId('label'), text, anchor, facing, input.cols, input.rows, ledger.grid, [...stamps.map(s => ({ col: s.col, row: s.row })), ...labels.map(l => ({ col: l.col, row: l.row }))])
    if (!result) { fail(branchId, 'label', 'unavailable-label-position', [anchor], `No valid adjacent tile was available for the ${text} label.`); return }
    labels.push({ ...result.record, anchorKind });
  }

  const addStamp = (semantic: StampSemantic, position: Point, direction: Direction, branchId: string, required: boolean, category?: string): boolean => {
    const resolved = makeGeneratedStamp(nextId('stamp'), { semantic, col: position.col, row: position.row, direction, required, category }, available)
    if (!resolved) { fail(branchId, 'stamp', 'unavailable-required-stamp', [position], `No available ${semantic} stamp can represent required content.`); return false }
    if (resolved.unmet) unmetRequirements.push({ branchId, semantic, position: { ...position } })
    else stamps.push({ id: resolved.stamp.id, semantic, sourceCategory: category, type: resolved.stamp.type, col: position.col, row: position.row, rotation: resolved.stamp.rotation, required });
    return true
  }

  const enqueueRoomExits = (room: RoomRecord) => { const rolled = exitsFor(room, random, () => nextId('exit')); for (const exit of rolled) { exits.push(exit); queue.push({ id: nextId('branch'), origin: exit.origin, direction: exit.direction, kind: exit.exitType, sourceExitId: exit.id }) } }

  const recordRoom = (id: string, origin: Point, direction: Direction, shape: RoomShape, width: number, height: number, radius: number | undefined, feature: FeatureType | undefined, tiles: Point[], starting: boolean, exitKind: RoomRecord['exits']) => {
    const room: RoomRecord = { id, origin: { ...origin }, direction, shape, width, height, ...(radius === undefined ? {} : { radius }), ...(feature === undefined ? {} : { feature }), tiles: tiles.map(p => ({ ...p })), starting, exits: exitKind }; rooms.push(room); enqueueRoomExits(room); return room
  }

  const makeRoom = (branch: Branch, starting: boolean, shape: RoomShape, location?: StartingLocation): boolean => {
    let irregularSubtype: RoomRecord['irregularSubtype']; let feature: FeatureType | undefined
    let dimensions = dimensionsFor(shape, random)
    if (shape === 'underground-feature') {
      irregularSubtype = 'underground-feature'
      const nested = rollRoom(random)
      shape = nested === 'underground-feature' ? 'square' : nested
      dimensions = dimensionsFor(shape, random)
      feature = rollFeature(random)
    } else if (shape === 'irregular-chamber') {
      irregularSubtype = rollIrregularSubtype(random)
      if (irregularSubtype === 'underground-feature') {
        const nested = rollRoom(random)
        shape = nested === 'underground-feature' ? 'square' : nested
        dimensions = dimensionsFor(shape, random)
        feature = rollFeature(random)
      } else if (irregularSubtype === 'natural-cavern') shape = 'natural-cavern'
    }
    const topLeft = starting ? startingTopLeft(location!, input.cols, input.rows, dimensions.width, dimensions.height, random) : undefined
    const tiles = starting ? roomFootprint(shape, dimensions.width, dimensions.height, topLeft!, dimensions.radius) : roomFromEntrance(branch.origin, branch.direction, dimensions.width, dimensions.height, shape, dimensions.radius)
    const candidate = starting ? tiles : uniquePoints([step(branch.origin, branch.direction), ...tiles])
    const placement = ledger.commit(candidate, FLOOR, starting ? [] : ledger.connectionEntrances(branch.origin))
    if ('reason' in placement) { fail(branch.id, starting ? 'starting-room' : 'room', placement.reason, candidate, placement.message); return false }
    if (!starting) connectors.push(step(branch.origin, branch.direction))
    const room = recordRoom(nextId(starting ? 'starting-room' : 'room'), starting ? topLeft! : branch.origin, branch.direction, shape, dimensions.width, dimensions.height, dimensions.radius, feature, tiles, starting, starting ? (rollRoomExits(random)) : rollRoomExits(random))
    if (irregularSubtype) room.irregularSubtype = irregularSubtype
    return true
  }

  const maybeCondition = (): { condition: HallwayCondition; width: number } => {
    let width = 1; let result = rollHallwayCondition(random)
    if (result === 'width-reroll') { width++; result = rollHallwayCondition(random) }
    if (result === 'width-reroll') { width++; result = rollHallwayCondition(random) }
    if (result === 'width-reroll') result = 'open'
    if (result === 'difficult') result = rollDifficultHallwayCondition(random)
    if (result === 'open' && width === 1) return { condition: 'open', width }
    if (result === 'open') return { condition: 'open', width }
    if (result === 'flooded' || result === 'collapsed' || result === 'converted' || result === 'hazard') return { condition: result, width }
    return { condition: rollDifficultHallwayCondition(random), width }
  }

  const generateHallway = (branch: Branch, forcedForm?: HallwayForm): boolean => {
    const roll = forcedForm ? 1 : rollHallway(random); const form: HallwayForm = forcedForm ?? (roll === 1 ? 'straight' : roll === 2 ? 'intersection' : roll === 3 ? 'turn' : roll === 4 ? 'side-passage' : roll === 5 ? 'doorway-ending' : 'room-ending')
    const length = roll === 2 ? 3 : roll === 3 ? 3 : d6(random); const condition = maybeCondition(); const geometry = hallwayFootprint(branch.origin, branch.direction, length, condition.width, form)
    const state = condition.condition === 'flooded' ? WATER : FLOOR; const placement = ledger.commit(geometry.footprint, state, ledger.connectionEntrances(branch.origin))
    if ('reason' in placement) { fail(branch.id, 'hallway', placement.reason, geometry.footprint, placement.message); return false }
    const hallway: HallwayRecord = { id: nextId('hallway'), branchId: branch.id, origin: branch.origin, direction: branch.direction, form, path: geometry.path, width: condition.width, condition: condition.condition, terminal: false, ...(condition.width >= 4 ? { pillarRequirement: { requested: true } } : {}) }
    hallways.push(hallway)
    const end = geometry.end
    if (condition.condition === 'collapsed') { addStamp('rubble', end, geometry.direction, branch.id, false); addLabelIfPossible(conditionLabelText('collapsed'), end, geometry.direction, 'hallway', branch.id) }
    if (condition.condition === 'hazard') { if (addStamp('danger', end, geometry.direction, branch.id, true)) addLabelIfPossible(conditionLabelText('hazard'), end, geometry.direction, 'stamp', branch.id) }
    if (condition.condition === 'flooded' || condition.condition === 'converted') addLabelIfPossible(conditionLabelText(condition.condition), geometry.path[Math.floor(geometry.path.length / 2)] ?? end, geometry.direction, 'hallway', branch.id)
    if (condition.width >= 4) { for (let i = 2; i < geometry.path.length; i += 3) { const pillar = geometry.path[i]!; if (!addStamp('pillar', pillar, geometry.direction, branch.id, false)) hallway.pillarRequirement!.unmet = true } }
    if (roll === 6) {
      const ending = d6(random); if (ending <= 1) hallway.terminal = true
      else if (ending <= 4) return generateDoorway({ id: nextId('branch'), origin: end, direction: geometry.direction, kind: 'doorway', sourceExitId: branch.sourceExitId }) || (hallway.terminal = true)
      else { const roomBranch = { id: nextId('branch'), origin: end, direction: geometry.direction, kind: 'room' as const, sourceExitId: branch.sourceExitId }; if (!makeRoom(roomBranch, false, rollRoom(random) as RoomShape)) hallway.terminal = true }
    } else if (roll === 2) {
      const intersectionBranch = { id: nextId('branch'), origin: end, direction: geometry.direction, kind: 'intersection' as const, sourceExitId: branch.sourceExitId }; queue.push(intersectionBranch)
    } else if (roll === 3) {
      const turn = rollLeftOrRight(random) === 'left' ? turnLeft[geometry.direction] : turnRight[geometry.direction]; queue.push({ id: nextId('branch'), origin: end, direction: turn, kind: 'hallway', sourceExitId: branch.sourceExitId })
    } else if (roll === 4) {
      const side = rollLeftOrRight(random) === 'left' ? turnLeft[branch.direction] : turnRight[branch.direction]; queue.push({ id: nextId('branch'), origin: geometry.path[Math.floor(geometry.path.length / 2)] ?? end, direction: side, kind: 'hallway', sourceExitId: branch.sourceExitId })
    } else if (roll === 5) {
      const side = rollLeftOrRight(random) === 'left' ? turnLeft[branch.direction] : turnRight[branch.direction]; generateDoorway({ id: nextId('branch'), origin: geometry.path[Math.floor(geometry.path.length / 2)] ?? end, direction: side, kind: 'doorway', sourceExitId: branch.sourceExitId })
    } else { hallway.terminal = true }
    return true
  }

  const generateIntersection = (branch: Branch): boolean => {
    const kind = rollIntersection(random); const shape = intersectionFootprint(branch.origin, kind); const id = nextId('intersection'); const validDirections: Direction[] = []
    for (const direction of shape.branches) {
      const point = step(branch.origin, direction); const entrances = direction === branch.direction ? ledger.connectionEntrances(branch.origin) : [branch.origin]
      const failure = ledger.validate([point], [...entrances, ...shape.footprint])
      if (failure) { fail(branch.id, 'intersection', failure.reason, [point], failure.message); continue }
      const committed = ledger.commit([point], FLOOR, [...entrances, ...shape.footprint]); if ('reason' in committed) { fail(branch.id, 'intersection', committed.reason, [point], committed.message); continue }
      validDirections.push(direction)
    }
    intersections.push({ id, branchId: branch.id, kind, origin: branch.origin, branches: validDirections })
    for (const direction of validDirections) { const branchKind = rollIntersectionBranch(random); queue.push({ id: nextId('branch'), origin: step(branch.origin, direction), direction, kind: branchKind, sourceExitId: branch.sourceExitId }) }
    return true
  }

  function generateDoorway(branch: Branch): boolean {
    const gridBefore = ledger.grid; const stampLength = stamps.length; const labelLength = labels.length; const failureLength = failedAttempts.length; const category = rollDoorway(random); const condition = rollDoorCondition(random, category); const beyond = rollBeyondDoorway(random); let verticalContent: GenerationResult['doorways'][number]['verticalContent']
    if (beyond === 'vertical') verticalContent = rollVerticalContent(random)
    const sourceExit = exits.find(e => e.id === branch.sourceExitId)
    const isSecret = condition === 'secret' || sourceExit?.secret === true
    const semantic: StampSemantic = isSecret ? 'secret-door' : 'door'
    const destination = step(branch.origin, branch.direction)
    const beyondDestination = step(branch.origin, branch.direction, 2)
    const connector = ledger.commit([destination], FLOOR, ledger.connectionEntrances(branch.origin))
    if ('reason' in connector) {
      fail(branch.id, 'doorway', connector.reason, [branch.origin, destination], connector.message)
      return false
    }
    if (!addStamp(semantic, destination, branch.direction, branch.id, true, category)) {
      ledger.restore(gridBefore)
      return false
    }
    if (condition === 'locked' || condition === 'locked + trapped') addLabelIfPossible(conditionLabelText(condition), destination, branch.direction, 'stamp', branch.id)
    else if (isSecret) addLabelIfPossible(conditionLabelText('secret'), destination, branch.direction, 'stamp', branch.id)
    else if (condition === 'trapped') addLabelIfPossible(conditionLabelText('trapped'), destination, branch.direction, 'stamp', branch.id)
    let contentOk = true
    if (beyond === 'hallway') contentOk = generateHallway({ id: nextId('branch'), origin: branch.origin, direction: branch.direction, kind: 'hallway', sourceExitId: branch.sourceExitId })
    else if (beyond === 'room') contentOk = makeRoom({ id: nextId('branch'), origin: branch.origin, direction: branch.direction, kind: 'room', sourceExitId: branch.sourceExitId }, false, rollRoom(random) as RoomShape)
    else if (beyond === 'intersection') contentOk = generateIntersection({ id: nextId('branch'), origin: branch.origin, direction: branch.direction, kind: 'intersection', sourceExitId: branch.sourceExitId })
    else {
      const vertical = verticalContent!
      const placed = ledger.commitTransaction([
        { points: [destination], state: FLOOR, entrances: ledger.connectionEntrances(branch.origin) },
        { points: [beyondDestination], state: FLOOR, entrances: [destination] },
      ])
      contentOk = !('reason' in placed) && addStamp(vertical === 'staircase' ? 'stairs' : vertical === 'shaft' ? 'shaft' : 'valve', beyondDestination, branch.direction, branch.id, true, vertical)
    }
    if (condition === 'trapped' || condition === 'locked + trapped') { if (!contentOk || !addStamp('trap', beyondDestination, branch.direction, branch.id, true, 'trapped')) contentOk = false }
    if (!contentOk) { ledger.restore(gridBefore); stamps.splice(stampLength); labels.splice(labelLength); failedAttempts.splice(failureLength); fail(branch.id, 'doorway', 'invalid-path', [branch.origin, destination], 'Required beyond-doorway content could not be committed; doorway transaction rolled back.'); return false }
    // Exact source category and condition are retained on the accepted exit.
    const exit = exits.find(e => e.id === branch.sourceExitId); if (exit) { exit.secret = condition === 'secret' || exit.secret; exit.doorwayCategory = category; exit.condition = condition; exit.beyond = beyond; exit.verticalContent = verticalContent }
    doorways.push({ id: nextId('doorway'), branchId: branch.id, origin: { ...branch.origin }, direction: branch.direction, category, condition, beyond, verticalContent })
    return true
  }

  const dungeonType = input.dungeonType ?? rollDungeonType(random); const startingLocation = input.startingLocation ?? rollStartingLocation(random); const startingShape = rollStartingRoom(random); const startingBranch: Branch = { id: 'starting', origin: { col: 0, row: 0 }, direction: 'S', kind: 'room' }
  makeRoom(startingBranch, true, startingShape, startingLocation)
  while (queue.length) { const branch = queue.shift()!; if (branch.kind === 'hallway') generateHallway(branch); else if (branch.kind === 'doorway') generateDoorway(branch); else if (branch.kind === 'room') makeRoom(branch, false, rollRoom(random) as RoomShape); else generateIntersection(branch) }

  const snapshot: AppSnapshotShape = { grids: new Map([[0, ledger.grid]]), stamps: stamps.map(s => ({ id: s.id, type: s.type, col: s.col, row: s.row, rotation: s.rotation, z: 0 } as Stamp)), steps: [], ramps: [], labels: labels.map(l => ({ id: l.id, col: l.col, row: l.row, text: l.text })), environmentalColors: new Map() }
  const result = { seed, dungeonType, startingLocation, snapshot, map: snapshot, replacement: snapshot, appSnapshot: snapshot, rooms, exits, hallways, intersections, connectors, doorways, unmetRequirements, stamps, labels, failedAttempts } as GenerationResult
  result.summary = summarizeGeneration(result)
  return result
}

export const generate = generateRandomDungeon
