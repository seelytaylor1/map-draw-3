// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MapLegend } from './MapLegend'

describe('map legend', () => {
  it('opens a compact, accessible legend for generated map symbols', () => {
    render(<MapLegend />)

    const disclosure = screen.getByText('Dungeon legend').closest('details')!
    expect(disclosure).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Dungeon legend'))

    expect(disclosure).toHaveAttribute('open')
    expect(screen.getByText('Monster')).toBeInTheDocument()
    expect(screen.getByText('Trap')).toBeInTheDocument()
    expect(screen.getByText('Locked door')).toBeInTheDocument()
    expect(screen.getByText('Spiral stairs')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Monster' })).toHaveAttribute('src', expect.stringContaining('TriangleArrowhead1x1'))
  })
})
