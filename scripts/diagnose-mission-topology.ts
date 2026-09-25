import { ALL_LOOP_CHALLENGES, assessMapTopology, generateMissionDungeon, validateLoopChallengeContract } from '../src/randomDungeon/missionFirst'
import type { GenerationRequest, LoopChallenge, MissionGenerationResult, SpatialConnection } from '../src/randomDungeon/missionFirst'
import { DARKNESS, FLOOR, WATER } from '../src/constants'

const sampleSize = Number(process.argv[2] ?? 20)
const firstSeed = Number(process.argv[3] ?? 1)
const requestedChallenge = process.argv[4] ?? 'alternate-paths'
const challenges: readonly LoopChallenge[] = requestedChallenge === 'all'
  ? ALL_LOOP_CHALLENGES
  : [requestedChallenge as LoopChallenge]
const loopCount = Number(process.argv[5] ?? 1)
const complexity = process.argv[6] ?? 'standard'
const requestedStyle = process.argv[7] ?? 'all'
const styles = requestedStyle === 'all'
  ? ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const
  : [requestedStyle] as const
if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || !Number.isSafeInteger(firstSeed) || !Number.isSafeInteger(loopCount) || loopCount < 0 || !['compact', 'standard', 'dense'].includes(complexity) || !styles.every(style => ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'].includes(style))) throw new Error('Usage: vite-node scripts/diagnose-mission-topology.ts [count] [firstSeed] [challenge] [loopCount] [compact|standard|dense] [spine-shortcuts|orbit-gates|cavern-pressure|all]')
if (!challenges.every(challenge => ALL_LOOP_CHALLENGES.includes(challenge))) throw new Error(`Unknown Loop Challenge: ${requestedChallenge}`)

const reports = []
for (const challenge of challenges) for (const style of styles) for (let offset = 0; offset < sampleSize; offset++) {
  const base: GenerationRequest = { style: 'spine-shortcuts', seed: firstSeed, cols: 88, rows: 68, tilesPerInch: 8, complexity: complexity as GenerationRequest['complexity'], loopCount, loopPreference: challenge, loopChallenges: Array.from({ length: loopCount }, () => challenge) }
  const result = generateMissionDungeon({ ...base, style, seed: firstSeed + offset })
  if (!result.ok || !result.space) reports.push({ challenge, style, seed: firstSeed + offset, generated: false, rejectedAttempts: result.summary.rejectedAttempts, diagnostics: result.diagnostics.map(diagnostic => diagnostic.code) })
  else {
    const assessment = assessMapTopology(result.mission, result.space)
    const contractDiagnostics = result.mission.cycles.flatMap(cycle => validateLoopChallengeContract(result.mission, cycle))
    const renderDiagnostics = validateContractRendering(result)
    reports.push({ challenge, style, seed: firstSeed + offset, generated: true, rejectedAttempts: result.summary.rejectedAttempts, contractDiagnostics, renderDiagnostics, supportsMeaningfulChoices: assessment.supportsMeaningfulChoices, firstChoiceDistance: assessment.firstChoiceDistance, cycles: assessment.cycles, findings: assessment.findings })
  }
}
const failing = reports.filter(report => !('supportsMeaningfulChoices' in report) || !report.supportsMeaningfulChoices || report.contractDiagnostics.length > 0 || report.renderDiagnostics.length > 0)
console.log(JSON.stringify({ challenges, loopCount, complexity, sampleSize, firstSeed, styles, generated: reports.length - reports.filter(report => !report.generated).length, contractAndRenderPassRate: `${reports.length - failing.length}/${reports.length}`, failures: failing, reports }, null, 2))
process.exitCode = failing.length ? 1 : 0

function validateContractRendering(result: MissionGenerationResult): string[] {
  if (!result.snapshot || !result.space) return ['No rendered snapshot or space plan was produced.']
  const problems: string[] = []
  const connectionsFor = (edgeId: string): SpatialConnection[] => result.space!.connections.filter(connection => connection.missionEdgeId === edgeId)
  const grid = result.snapshot.grids.get(0)!
  const gridState = (point: { col: number; row: number }) => grid[point.row * result.request.cols + point.col]

  for (const key of result.mission.keys) {
    if (!result.snapshot.stamps.some(stamp => stamp.id === `generated-${key.id}` && stamp.type === 'Key1x1')) problems.push(`${key.id} is missing its rendered Key marker.`)
  }
  for (const edge of result.mission.edges.filter(edge => edge.lockId)) {
    for (const connection of connectionsFor(edge.id)) {
      const lockPoint = connection.path[connection.path.length - 2]
      const hasLockedDoor = connection.doorways?.some(doorway => doorway.style === 'locked' && doorway.point.col === lockPoint?.col && doorway.point.row === lockPoint?.row)
      const hasLockedStamp = result.snapshot.stamps.some(stamp => stamp.type === 'DoorLocked1x1' && stamp.col === lockPoint?.col && stamp.row === lockPoint?.row)
      if (connection.semantic !== 'locked' || !hasLockedDoor || !hasLockedStamp) problems.push(`${edge.id} does not render as a locked entrance.`)
    }
  }
  for (const edge of result.mission.edges) {
    for (const connection of connectionsFor(edge.id)) {
      if (edge.secret && connection.semantic !== 'secret') problems.push(`${edge.id} is missing its secret-route rendering.`)
      if (edge.dangerous && connection.semantic !== 'dangerous') problems.push(`${edge.id} is missing its dangerous-route rendering.`)
      if (edge.oneWay && (connection.semantic !== 'one-way' || connection.traversable !== 'one-way')) problems.push(`${edge.id} is missing its one-way rendering.`)
      if (edge.blocked && connection.traversable !== 'blocked') problems.push(`${edge.id} is missing its blocked-route rendering.`)
    }
  }
  const dramaticCycle = result.mission.cycles.find(cycle => cycle.challenge === 'dramatic-arc')
  if (dramaticCycle) {
    const chamber = result.space.modules.find(module => module.id === result.space!.anchors[dramaticCycle.roles.objectiveNode])
    if (!chamber) problems.push(`${dramaticCycle.id} has no room for its dark barrier.`)
    else {
      const axis = chamber.width >= chamber.height ? 'row' : 'col'
      const axisOrigin = axis === 'row' ? chamber.origin.row : chamber.origin.col
      const span = axis === 'row' ? chamber.width : chamber.height
      const maximum = axis === 'row' ? chamber.height : chamber.width
      const bandLength = Math.min(6, Math.max(3, Math.min(4, maximum - 2)))
      const bandStart = Math.floor((maximum - bandLength) / 2)
      for (let offset = 0; offset < bandLength; offset++) {
        const coordinate = axisOrigin + bandStart + offset
        const cells = chamber.footprint.filter(point => point[axis] === coordinate)
        if (cells.length !== span || cells.some(point => gridState(point) !== DARKNESS)) problems.push(`${dramaticCycle.id} dark section does not span the chamber as a continuous barrier.`)
      }
      const chamberCells = new Map(chamber.footprint.filter(point => gridState(point) === FLOOR || gridState(point) === WATER).map(point => [`${point.col},${point.row}`, point]))
      let components = 0
      while (chamberCells.size > 0) {
        components++
        const first = chamberCells.values().next().value!
        const queue = [first]
        chamberCells.delete(`${first.col},${first.row}`)
        for (let head = 0; head < queue.length; head++) {
          const point = queue[head]!
          for (const neighbor of [{ col: point.col, row: point.row - 1 }, { col: point.col + 1, row: point.row }, { col: point.col, row: point.row + 1 }, { col: point.col - 1, row: point.row }]) {
            const key = `${neighbor.col},${neighbor.row}`
            const next = chamberCells.get(key)
            if (next) { chamberCells.delete(key); queue.push(next) }
          }
        }
      }
      if (components < 2) problems.push(`${dramaticCycle.id} dark section does not divide the chamber into separate sides.`)
    }
  }
  return problems
}
