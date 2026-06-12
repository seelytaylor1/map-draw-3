import { describe, it, expect } from 'vitest'
import { deriveFaceColors } from './faceColors'

describe('deriveFaceColors', () => {
  it('front is base darkened by 15%', () => {
    const { front } = deriveFaceColors('#6a5040')
    expect(front).toBe('#5a4436')
  })

  it('east is base lightened by 15%', () => {
    const { east } = deriveFaceColors('#6a5040')
    expect(east).toBe('#7a5c4a')
  })

  it('east clamps channels to 255', () => {
    const { east } = deriveFaceColors('#ffffff')
    expect(east).toBe('#ffffff')
  })

  it('front clamps channels to 0', () => {
    const { front } = deriveFaceColors('#000000')
    expect(front).toBe('#000000')
  })
})
