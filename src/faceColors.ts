export function deriveFaceColors(baseHex: string): { front: string; east: string } {
  const r = parseInt(baseHex.slice(1, 3), 16)
  const g = parseInt(baseHex.slice(3, 5), 16)
  const b = parseInt(baseHex.slice(5, 7), 16)
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return {
    front: `#${toHex(r * 0.85)}${toHex(g * 0.85)}${toHex(b * 0.85)}`,
    east: `#${toHex(r * 1.15)}${toHex(g * 1.15)}${toHex(b * 1.15)}`,
  }
}
