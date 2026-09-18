import { describe, expect, it } from 'vitest'
import { FLOOR, WATER } from './constants'
import { ALL_LOOP_CHALLENGES, generateMissionDungeon, validateSpacePlan, connectionFootprint } from './randomDungeon/missionFirst'
import type { GenerationRequest, MissionGenerationResult } from './randomDungeon/missionFirst'

const request: GenerationRequest = { style: 'spine-shortcuts', seed: 42, cols: 88, rows: 68, tilesPerInch: 8, complexity: 'standard', loopCount: 1, loopPreference: 'lock-and-key' }

// Independent flood fill over traversable Floor and Water tiles. Closing a
// stamped door must cut the route, irrespective of the abstract graph.
function reachable(result: MissionGenerationResult, missingKey?: string): Set<number> {
  const { cols, rows } = result.request
  const grid = result.snapshot!.grids.get(0)!
  const index = (p: { col: number; row: number }) => p.row * cols + p.col
  const center = (id: string) => {
    const m = result.space!.modules.find(m => m.missionNodeId === id)!
    return index({ col: m.origin.col + Math.floor(m.width / 2), row: m.origin.row + Math.floor(m.height / 2) })
  }
  const keys = new Set<string>()
  let reached = new Set<number>()
  for (;;) {
    const closed = new Set<number>()
    const reverse = new Set<string>()
    for (const c of result.space!.connections) {
      const e = result.mission.edges.find(e => e.id === c.missionEdgeId)!
      const lock = result.mission.locks.find(l => l.id === e.lockId)
      if (e.blocked || (lock && !keys.has(lock.keyId))) closed.add(index(c.path[c.path.length - 2]!))
      if (e.oneWay) {
        const middle = Math.floor(c.path.length / 2)
        reverse.add(`${index(c.path[middle + 1]!)}/${index(c.path[middle]!)}`)
      }
    }
    const queue = [center('start')]
    reached = new Set(queue)
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]!
      for (const next of [at - cols, at + cols, at - 1, at + 1]) {
        if (next < 0 || next >= cols * rows || Math.abs(next % cols - at % cols) + Math.abs(Math.floor(next / cols) - Math.floor(at / cols)) !== 1) continue
        if ((grid[next] !== FLOOR && grid[next] !== WATER) || closed.has(next) || reached.has(next) || reverse.has(`${at}/${next}`)) continue
        reached.add(next); queue.push(next)
      }
    }
    const before = keys.size
    for (const key of result.mission.keys) if (key.id !== missingKey && reached.has(center(key.nodeId))) keys.add(key.id)
    if (before === keys.size) return reached
  }
}

describe('committed dungeon geometry', () => {
  it('has a playable floor route to every room for every challenge and style', () => {
    for (const style of ['spine-shortcuts', 'orbit-gates', 'cavern-pressure'] as const) for (const challenge of ALL_LOOP_CHALLENGES) {
      const result = generateMissionDungeon({ ...request, style, loopPreference: challenge })
      expect(result.ok, `${style}/${challenge}: ${JSON.stringify(result.diagnostics)}`).toBe(true)
      const visited = reachable(result)
      for (const m of result.space!.modules) expect(m.footprint.some(p => visited.has(p.row * request.cols + p.col)), `${style}/${challenge}/${m.id}`).toBe(true)
    }
  }, 30_000)

  it('cannot bypass either required key through floor geometry', () => {
    for (const challenge of ['lock-and-key', 'double-lock', 'unknown-return'] as const) {
      const result = generateMissionDungeon({ ...request, loopPreference: challenge })
      expect(result.ok).toBe(true)
      for (const key of result.mission.keys) {
        const visited = reachable(result, key.id)
        const objective = result.space!.modules.find(m => m.missionNodeId === result.mission.cycles[0]!.roles.objectiveNode)!
        expect(objective.footprint.some(p => visited.has(p.row * request.cols + p.col)), `${challenge}/${key.id}`).toBe(false)
      }
      const entries = result.space!.connections.filter(c => result.mission.edges.some(e => e.id === c.missionEdgeId && e.lockId))
      for (const entry of entries) {
        const point = entry.path[entry.path.length - 2]!
        expect(result.snapshot!.stamps.some(stamp => stamp.type === 'DoorLocked1x1' && stamp.col === point.col && stamp.row === point.row)).toBe(true)
      }
    }
  })

  it('varies room shapes, sizes and seeded placement while replaying exactly', () => {
    const a = generateMissionDungeon(request), b = generateMissionDungeon({ ...request, seed: 43 })
    expect(a.space).toEqual(generateMissionDungeon(request).space)
    expect(a.space).not.toEqual(b.space)
    expect(new Set(a.space!.modules.map(m => `${m.width}x${m.height}`)).size).toBeGreaterThan(3)
    expect(a.space!.modules.some(m => m.footprint.length < m.width * m.height)).toBe(true)
    expect(a.space!.modules.find(m => m.missionNodeId === 'goal')!.footprint.length).toBeGreaterThan(9)
    for (const m of a.space!.modules) {
      const cells = new Set(m.footprint.map(p => `${p.col},${p.row}`))
      const col = m.origin.col + Math.floor(m.width / 2)
      const row = m.origin.row + Math.floor(m.height / 2)
      for (let y = row - 1; y <= row + 1; y++) for (let x = col - 1; x <= col + 1; x++) expect(cells.has(`${x},${y}`), `${m.id} readable interior`).toBe(true)
    }
  })

  it('rejects a physical shortcut even when corridors share cycle metadata', () => {
    const result = generateMissionDungeon(request)
    const plan = structuredClone(result.space!)
    const connection = plan.connections[0]!
    plan.connections.push({ ...connection, id: 'undeclared-shortcut' })
    expect(validateSpacePlan(request, plan, result.mission).diagnostics.some(d => d.code === 'accidental-crossing')).toBe(true)
  })

  it('expands even corridor widths to their exact cell width', () => {
    expect(connectionFootprint({ path: [{ col: 5, row: 5 }, { col: 6, row: 5 }], width: 2 })).toHaveLength(4)
    expect(connectionFootprint({ path: [{ col: 5, row: 5 }, { col: 6, row: 5 }], width: 4 })).toHaveLength(8)
  })
})
