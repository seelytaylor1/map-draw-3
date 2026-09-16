export function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (Math.trunc(seed) >>> 0)
  const text = String(seed)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface D6Random {
  readonly seed: number
  nextD6(): number
}

export function createD6Random(seed: number | string): D6Random {
  const normalized = normalizeSeed(seed)
  let state = normalized || 0x6d2b79f5
  return {
    seed: normalized,
    nextD6() {
      // Mulberry32 is a small, reproducible PRNG. This is the only stream
      // consumed by the pure generator; all table rerolls are explicit.
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
      return 1 + Math.floor(value * 6)
    },
  }
}

export function createRandomSeed(): number {
  const cryptoObject = globalThis.crypto
  if (cryptoObject?.getRandomValues) {
    return cryptoObject.getRandomValues(new Uint32Array(1))[0]!
  }
  // This fallback is only for the UI command in runtimes without Web Crypto;
  // replay and generation always use an explicit normalized seed.
  return Date.now() >>> 0
}
