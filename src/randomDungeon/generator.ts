/**
 * Compatibility Adapter for callers of the original table-driven generator.
 * The production App uses missionFirst.ts / missionGenerator.ts instead.
 */
export { generateLegacyRandomDungeon as generateRandomDungeon, generateLegacyRandomDungeon } from './legacy/generator'
