// src/labels.test.ts
import { describe, it, expect } from 'vitest'
import { addLabel, removeLabel, updateLabel, type Label } from './labels'

describe('labels', () => {
  const label: Label = {
    id: 'label-1',
    col: 5,
    row: 3,
    text: 'Throne Room',
    number: undefined,
  }

  it('adds a label to the list', () => {
    const labels: Label[] = []
    const result = addLabel(labels, label)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(label)
  })

  it('removes a label by id', () => {
    const labels: Label[] = [label]
    const result = removeLabel(labels, 'label-1')
    expect(result).toHaveLength(0)
  })

  it('updates label text', () => {
    const labels: Label[] = [label]
    const result = updateLabel(labels, 'label-1', { text: 'Throne Chamber' })
    expect(result[0].text).toBe('Throne Chamber')
  })

  it('updates label position', () => {
    const labels: Label[] = [label]
    const result = updateLabel(labels, 'label-1', { col: 10, row: 8 })
    expect(result[0].col).toBe(10)
    expect(result[0].row).toBe(8)
  })

  it('updates label number', () => {
    const labels: Label[] = [label]
    const result = updateLabel(labels, 'label-1', { number: 1 })
    expect(result[0].number).toBe(1)
  })
})
