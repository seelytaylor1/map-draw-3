import { describe, expect, it } from 'vitest'
import { buildHtmlExport, buildMarkdownExport, siblingFilePath } from './exportFormats'

describe('document export formats', () => {
  it('builds a self-contained HTML map with a player-view toggle and ledger', () => {
    const html = buildHtmlExport({
      mapImage: 'data:image/png;base64,gm',
      playerMapImage: 'data:image/png;base64,player',
      ledgerText: 'ROOM LEDGER\nROOM 01',
      initialPlayerView: true,
    })

    expect(html).toContain('data:image/png;base64,gm')
    expect(html).toContain('data:image/png;base64,player')
    expect(html).toContain('Player view')
    expect(html).toContain('ROOM LEDGER\\nROOM 01')
    expect(html).toContain('setPlayerView')
  })

  it('adds resizable map and ledger viewports with keyboard-accessible handles', () => {
    const html = buildHtmlExport({
      mapImage: 'data:image/png;base64,gm',
      playerMapImage: 'data:image/png;base64,player',
      ledgerText: 'ROOM LEDGER',
      initialPlayerView: false,
    })

    expect(html).toContain('Resize map viewport')
    expect(html).toContain('Resize room ledger viewport')
    expect(html).toContain('id="reset-layout"')
    expect(html).toContain('--ledger-width')
    expect(html).toContain('setLayoutSize')
  })

  it('links the markdown map to a PNG and includes the ledger when present', () => {
    const markdown = buildMarkdownExport({ title: 'My Dungeon', pngFileName: 'my-dungeon.png', ledgerText: 'ROOM LEDGER' })
    expect(markdown).toContain('![My Dungeon](my-dungeon.png)')
    expect(markdown).toContain('## Room ledger')
    expect(markdown).toContain('ROOM LEDGER')
  })

  it('derives sibling export paths without changing the directory', () => {
    expect(siblingFilePath('C:\\maps\\dungeon-map.png', '.txt')).toBe('C:\\maps\\dungeon-map.txt')
    expect(siblingFilePath('dungeon-map', 'html')).toBe('dungeon-map.html')
  })
})
