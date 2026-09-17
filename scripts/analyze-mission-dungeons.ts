import { mkdirSync, writeFileSync } from 'node:fs'
import { generateMissionDungeon } from '../src/randomDungeon/missionFirst'
import type { GenerationRequest } from '../src/randomDungeon/missionFirst'

const base: GenerationRequest = { style: 'spine-shortcuts', seed: 42, cols: 88, rows: 68, tilesPerInch: 8, complexity: 'standard', loopCount: 1, loopPreference: 'lock-and-key' }
const samples: string[] = []
const failures: unknown[] = []
let passed = 0
const started = Date.now()
for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) {
  for (const [cols, rows, tilesPerInch] of [[88, 68, 8], [44, 34, 4], [22, 17, 2]]) {
    for (const seed of [1, 42, 123456789, 0xffffffff]) {
      const result = generateMissionDungeon({ ...base, style, seed, cols, rows, tilesPerInch, complexity: tilesPerInch === 2 ? 'compact' : 'standard', loopCount: tilesPerInch === 2 ? 0 : 1 })
      if (!result.ok) { failures.push({ style, seed, cols, rows, diagnostics: result.diagnostics.map(d => d.code) }); continue }
      passed++
      if (seed !== 42 || tilesPerInch === 2) continue
      const tile = 10
      const grid = result.snapshot!.grids.get(0)!
      const floors = Array.from(grid).flatMap((value, i) => value === 1 ? [`<rect x="${i % cols * tile}" y="${Math.floor(i / cols) * tile}" width="10" height="10"/>`] : []).join('')
      const labels = result.space!.modules.map(m => {
        const node = result.mission.nodes.find(n => n.id === m.missionNodeId)
        const label = node?.kind === 'task' ? node.id.replace('task-', '') : node?.kind ?? 'return'
        return `<text x="${(m.origin.col + m.width / 2) * tile}" y="${(m.origin.row + m.height / 2) * tile}" text-anchor="middle" dominant-baseline="middle">${label}</text>`
      }).join('')
      const locks = result.snapshot!.stamps.filter(s => s.type === 'DoorLocked1x1').map(s => `<rect x="${s.col * tile}" y="${s.row * tile}" width="10" height="10" fill="#bf4339"/>`).join('')
      samples.push(`<section><h2>${style} · ${cols}×${rows} · seed 42</h2><p>${result.space!.modules.length} rooms · ${result.summary.rejectedAttempts} placement retries · red = locked entrance</p><svg viewBox="0 0 ${cols * tile} ${rows * tile}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#202a30"/><g fill="#f4ebd4" stroke="#202a30" stroke-width="0.15">${floors}</g>${locks}<g fill="#2c4c5b" font-family="sans-serif" font-size="9" font-weight="bold">${labels}</g></svg></section>`)
    }
  }
}
mkdirSync('.scratch/dungeon-review', { recursive: true })
writeFileSync('.scratch/dungeon-review/layouts.html', `<!doctype html><meta charset="utf-8"><title>Dungeon layout review</title><style>body{background:#121a20;color:#eee;font:14px system-ui;margin:28px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}svg{width:100%}h2{font-size:17px}p{color:#adbcc5}</style><h1>Mission dungeon layout review</h1><main>${samples.join('')}</main>`)
console.log(JSON.stringify({ passed, failed: failures.length, milliseconds: Date.now() - started, failures }, null, 2))
