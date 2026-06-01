import { describe, expect, it } from 'vitest'
import { createHistory, push, undo, redo } from './history'

const a = new Uint8Array([0, 0, 0])
const b = new Uint8Array([1, 0, 0])
const c = new Uint8Array([1, 1, 0])

describe('createHistory', () => {
  it('holds initial state as present', () => {
    const h = createHistory(a)
    expect(h.present).toBe(a)
    expect(h.past).toHaveLength(0)
    expect(h.future).toHaveLength(0)
  })
})

describe('push', () => {
  it('moves present to past and sets new present', () => {
    const h = push(createHistory(a), b)
    expect(h.present).toBe(b)
    expect(h.past).toEqual([a])
  })

  it('clears future on push', () => {
    const h0 = push(createHistory(a), b)
    const h1 = undo(h0)          // future = [b]
    const h2 = push(h1, c)       // should clear future
    expect(h2.future).toHaveLength(0)
  })
})

describe('undo', () => {
  it('restores previous state', () => {
    const h = undo(push(createHistory(a), b))
    expect(h.present).toBe(a)
  })

  it('moves current present to future', () => {
    const h = undo(push(createHistory(a), b))
    expect(h.future).toEqual([b])
  })

  it('is a no-op at bottom of stack', () => {
    const h = createHistory(a)
    const h2 = undo(h)
    expect(h2).toBe(h)
  })
})

describe('redo', () => {
  it('restores future state', () => {
    const h = redo(undo(push(createHistory(a), b)))
    expect(h.present).toBe(b)
  })

  it('is a no-op when future is empty', () => {
    const h = createHistory(a)
    expect(redo(h)).toBe(h)
  })
})
