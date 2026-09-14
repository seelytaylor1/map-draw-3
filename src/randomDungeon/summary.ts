import type { GenerationResult, GenerationSummary } from './types'

export function summarizeGeneration(result: Pick<GenerationResult, 'seed' | 'dungeonType' | 'startingLocation' | 'rooms' | 'hallways' | 'stamps' | 'labels' | 'failedAttempts'>): GenerationSummary {
  return { seed: result.seed, dungeonType: result.dungeonType, startingLocation: result.startingLocation, startingRoom: result.rooms.some(room => room.starting) ? 'accepted' : 'failed', rooms: result.rooms.length, hallways: result.hallways.length, terminalHallways: result.hallways.filter(h => h.terminal).length, visibleStamps: result.stamps.length, visibleLabels: result.labels.length, failedAttempts: result.failedAttempts.length }
}
