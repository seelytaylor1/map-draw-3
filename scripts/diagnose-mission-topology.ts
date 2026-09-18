import { ALL_LOOP_CHALLENGES, assessMapTopology, generateMissionDungeon } from '../src/randomDungeon/missionFirst'
import type { GenerationRequest, LoopChallenge } from '../src/randomDungeon/missionFirst'

const sampleSize = Number(process.argv[2] ?? 20)
const firstSeed = Number(process.argv[3] ?? 1)
const challenge = (process.argv[4] ?? 'alternate-paths') as LoopChallenge
if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || !Number.isSafeInteger(firstSeed)) throw new Error('Usage: vite-node scripts/diagnose-mission-topology.ts [count] [firstSeed]')
if (!ALL_LOOP_CHALLENGES.includes(challenge)) throw new Error(`Unknown Loop Challenge: ${challenge}`)

const base: GenerationRequest = { style: 'spine-shortcuts', seed: firstSeed, cols: 88, rows: 68, tilesPerInch: 8, complexity: 'standard', loopCount: 1, loopPreference: challenge, loopChallenges: [challenge] }
const reports = []
for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) for (let offset = 0; offset < sampleSize; offset++) {
  const result = generateMissionDungeon({ ...base, style, seed: firstSeed + offset })
  if (!result.ok || !result.space) reports.push({ style, seed: firstSeed + offset, generated: false, diagnostics: result.diagnostics.map(diagnostic => diagnostic.code) })
  else {
    const assessment = assessMapTopology(result.mission, result.space)
    reports.push({ style, seed: firstSeed + offset, generated: true, supportsMeaningfulChoices: assessment.supportsMeaningfulChoices, firstChoiceDistance: assessment.firstChoiceDistance, cycles: assessment.cycles, findings: assessment.findings })
  }
}
const failing = reports.filter(report => !('supportsMeaningfulChoices' in report) || !report.supportsMeaningfulChoices)
console.log(JSON.stringify({ challenge, sampleSize, firstSeed, generated: reports.length - reports.filter(report => !report.generated).length, meaningfulChoiceRate: `${reports.length - failing.length}/${reports.length}`, failures: failing, reports }, null, 2))
process.exitCode = failing.length ? 1 : 0
