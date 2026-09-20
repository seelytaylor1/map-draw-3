// src/labels.ts
export interface Label {
  id: string
  col: number
  row: number
  text: string
  number?: number // Optional number for keyed entries (1, 2, 3...)
  numberOnly?: boolean // Render numbered room labels without their descriptive text.
  color?: string
  details?: string // Optional room record notes, kept with generated room labels.
}

export function getLabelDisplayText(label: Label): string {
  if (label.number === undefined) return label.text
  if (label.numberOnly) return `${label.number}`
  return label.text ? `${label.number} ${label.text}` : `${label.number}`
}

export function addLabel(labels: Label[], label: Label): Label[] {
  return [...labels, label]
}

export function removeLabel(labels: Label[], id: string): Label[] {
  return labels.filter(l => l.id !== id)
}

export function updateLabel(labels: Label[], id: string, updates: Partial<Omit<Label, 'id'>>): Label[] {
  return labels.map(l => l.id === id ? { ...l, ...updates } : l)
}
