// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MapLegend } from './MapLegend'
import { STAMP_ASSET_MAP } from './stamps'
import { GENERATED_STAMP_TYPES } from './randomDungeon/generatedStampCatalog'

describe('map legend', () => {
  it('opens a compact, accessible legend for generated map symbols', () => {
    render(<MapLegend />)

    const disclosure = screen.getByText('Dungeon legend').closest('details')!
    expect(disclosure).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Dungeon legend'))

    expect(disclosure).toHaveAttribute('open')
    expect(screen.getByText('Dungeon entrance')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ascending steps or ramp' })).toHaveTextContent('↑')
    expect(screen.getByText('Trap')).toBeInTheDocument()
    expect(screen.getByText('Locked door')).toBeInTheDocument()
    expect(screen.getByText('Spiral stairs')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Monster' })).not.toBeInTheDocument()

    const stampImages = Array.from(disclosure.querySelectorAll('img'))
    expect(stampImages).toHaveLength(GENERATED_STAMP_TYPES.length)
    for (const type of GENERATED_STAMP_TYPES) {
      const image = stampImages.find(candidate => candidate.getAttribute('src') === STAMP_ASSET_MAP[type])
      expect(image, `${type} should be represented in the legend`).toBeDefined()
      expect(image?.alt).not.toBe('')
    }
  })
})
