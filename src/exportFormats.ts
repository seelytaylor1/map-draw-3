export interface HtmlExportInput {
  title?: string
  mapImage: string
  playerMapImage: string
  ledgerText?: string
  initialPlayerView: boolean
}

export interface MarkdownExportInput {
  title?: string
  pngFileName: string
  ledgerText?: string
}

export type MapExportFormat = 'png' | 'webp' | 'jpg' | 'uvtt'

export function getMapExportMimeType(format: Exclude<MapExportFormat, 'uvtt'>): string {
  return format === 'jpg' ? 'image/jpeg' : `image/${format}`
}

export function getMapExportExtension(format: MapExportFormat): string {
  return format === 'uvtt' ? 'dd2vtt' : format
}

export interface UniversalVttExportInput {
  title: string
  imageDataUrl: string
  cols: number
  rows: number
  pixelsPerGrid: number
  region: { col: number; row: number; cols: number; rows: number }
  grid: Uint8Array
  stamps: Array<{ type: string; col: number; row: number; rotation: number; z?: number }>
  lights?: Array<{ col: number; row: number; range: number; intensity: number; color: string }>
}

/** Builds the widely supported Dungeondraft/Universal VTT JSON interchange. */
export function buildUniversalVttExport(input: UniversalVttExportInput): string {
  const comma = input.imageDataUrl.indexOf(',')
  const image = comma >= 0 ? input.imageDataUrl.slice(comma + 1) : input.imageDataUrl
  if (!image || !/^[A-Za-z0-9+/=\r\n]+$/.test(image)) throw new Error('The rendered map image is not valid base64 data.')

  const { region, grid, cols, pixelsPerGrid } = input
  const lineOfSight: Array<Array<{ x: number; y: number }>> = []
  const walkable = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= cols || row >= input.rows) return false
    return grid[row * cols + col] !== 0
  }
  for (let row = region.row; row < region.row + region.rows; row++) {
    for (let col = region.col; col < region.col + region.cols; col++) {
      if (!walkable(col, row)) continue
      const x = col - region.col
      const y = row - region.row
      if (!walkable(col, row - 1)) lineOfSight.push([{ x, y }, { x: x + 1, y }])
      if (!walkable(col + 1, row)) lineOfSight.push([{ x: x + 1, y }, { x: x + 1, y: y + 1 }])
      if (!walkable(col, row + 1)) lineOfSight.push([{ x: x + 1, y: y + 1 }, { x, y: y + 1 }])
      if (!walkable(col - 1, row)) lineOfSight.push([{ x, y: y + 1 }, { x, y }])
    }
  }

  const portals = input.stamps.flatMap(stamp => {
    if (stamp.z !== undefined && stamp.z !== 0) return []
    if (/archway|stair|step/i.test(stamp.type)) return []
    if (!/door/i.test(stamp.type)) return []
    if (stamp.col < region.col || stamp.row < region.row || stamp.col >= region.col + region.cols || stamp.row >= region.row + region.rows) return []
    const x = stamp.col - region.col + 0.5
    const y = stamp.row - region.row + 0.5
    const vertical = stamp.rotation % 180 === 0
    return [{
      position: { x, y },
      bounds: vertical
        ? [{ x, y: y - 0.5 }, { x, y: y + 0.5 }]
        : [{ x: x - 0.5, y }, { x: x + 0.5, y }],
      rotation: vertical ? Math.PI / 2 : 0,
      closed: !/open/i.test(stamp.type),
      freestanding: false,
    }]
  })

  return JSON.stringify({
    format: 0.3,
    resolution: {
      map_origin: { x: region.col, y: region.row },
      map_size: { x: region.cols, y: region.rows },
      pixels_per_grid: pixelsPerGrid,
    },
    line_of_sight: lineOfSight,
    portals,
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: (input.lights ?? []).map(light => ({
      position: { x: light.col, y: light.row },
      range: light.range,
      intensity: light.intensity,
      color: light.color,
      shadows: true,
    })),
    image,
    metadata: { title: input.title },
  }, null, 2)
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
}

export function buildHtmlExport({ title = 'Dungeon Map', mapImage, playerMapImage, ledgerText, initialPlayerView }: HtmlExportInput): string {
  const payload = safeJson({ title, mapImage, playerMapImage, ledgerText: ledgerText ?? '', initialPlayerView })
  const hasLedger = Boolean(ledgerText)
  const escapedTitle = escapeHtml(title)
  const gridColumns = hasLedger
    ? 'minmax(320px, 1fr) 14px minmax(260px, var(--ledger-width))'
    : 'minmax(0, 1fr)'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #151311; color: #eee8dd; }
    body { margin: 0; min-height: 100vh; padding: 24px; box-sizing: border-box; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    .header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    h1, h2 { margin: 0; font-weight: 600; }
    h1 { font-size: 22px; }
    h2 { font-size: 15px; letter-spacing: .08em; text-transform: uppercase; color: #caa875; }
    button { border: 1px solid #765d3e; border-radius: 6px; background: #2a2119; color: #f4eadb; padding: 8px 12px; cursor: pointer; }
    button[aria-pressed="true"] { background: #caa875; color: #211a13; }
    main { --ledger-width: 360px; --map-height: 640px; --ledger-height: 640px; display: grid; grid-template-columns: ${gridColumns}; gap: 12px; align-items: start; }
    .viewport { position: relative; min-width: 0; min-height: 280px; box-sizing: border-box; overflow: auto; padding: 16px; border: 1px solid #40362d; border-radius: 8px; }
    .map-frame { height: var(--map-height); background: #0d0c0b; }
    img { display: block; max-width: 100%; height: auto; image-rendering: auto; }
    aside { height: var(--ledger-height); background: #211c18; }
    .resize-handle { position: relative; flex: none; border: 0; border-radius: 4px; background: transparent; padding: 0; }
    .resize-handle:hover, .resize-handle:focus-visible { background: rgba(202, 168, 117, .28); outline: none; }
    .resize-handle::after { color: #caa875; opacity: .75; font-size: 14px; line-height: 1; }
    .resize-handle-vertical { cursor: col-resize; min-height: 280px; }
    .resize-handle-vertical::after { content: '⋮'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
    .resize-handle-corner { position: absolute; right: 4px; bottom: 4px; width: 22px; height: 22px; cursor: nwse-resize; }
    .resize-handle-corner::after { content: '◢'; position: absolute; right: 3px; bottom: 3px; }
    pre { margin: 14px 0 0; white-space: pre-wrap; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; color: #e6ddcf; }
    @media (max-width: 800px) { main { grid-template-columns: 1fr; } .resize-handle-vertical { display: none; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapedTitle}</h1>
    <div class="header-actions">
      <button id="player-view-toggle" type="button" aria-pressed="false">Player view</button>
      <button id="reset-layout" type="button">Reset layout</button>
    </div>
  </header>
  <main id="workspace">
    <section id="map-viewport" class="viewport map-frame" aria-label="Dungeon map">
      <img id="map-image" alt="Dungeon map" src="">
      <div id="map-height-handle" class="resize-handle resize-handle-corner" role="separator" aria-label="Resize map viewport" aria-orientation="horizontal" aria-valuemin="280" aria-valuemax="1200" aria-valuenow="640" tabindex="0"></div>
    </section>
    ${hasLedger ? '<div id="ledger-width-handle" class="resize-handle resize-handle-vertical" role="separator" aria-label="Resize room ledger viewport" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="640" aria-valuenow="360" tabindex="0"></div><aside id="ledger-viewport" class="viewport" aria-label="Room ledger"><h2>Room ledger</h2><pre id="room-ledger"></pre><div id="ledger-height-handle" class="resize-handle resize-handle-corner" role="separator" aria-label="Resize room ledger height" aria-orientation="horizontal" aria-valuemin="280" aria-valuemax="1200" aria-valuenow="640" tabindex="0"></div></aside>' : ''}
  </main>
  <script>
    const exportData = ${payload};
    const workspace = document.getElementById('workspace');
    const image = document.getElementById('map-image');
    const toggle = document.getElementById('player-view-toggle');
    const resetLayout = document.getElementById('reset-layout');
    const ledger = document.getElementById('room-ledger');
    const layout = { ledgerWidth: 360, mapHeight: 640, ledgerHeight: 640 };
    const limits = { ledgerWidth: [260, 640], mapHeight: [280, 1200], ledgerHeight: [280, 1200] };
    function setLayoutSize(name, value) {
      const [minimum, maximum] = limits[name];
      layout[name] = Math.min(maximum, Math.max(minimum, Math.round(value)));
      const cssName = name.replace(/[A-Z]/g, character => '-' + character.toLowerCase());
      workspace.style.setProperty('--' + cssName, layout[name] + 'px');
      const handle = document.getElementById(name === 'ledgerWidth' ? 'ledger-width-handle' : name === 'mapHeight' ? 'map-height-handle' : 'ledger-height-handle');
      if (handle) handle.setAttribute('aria-valuenow', String(layout[name]));
    }
    function resetLayoutSize() {
      setLayoutSize('ledgerWidth', 360);
      setLayoutSize('mapHeight', 640);
      setLayoutSize('ledgerHeight', 640);
    }
    function attachResize(handle, name, axis) {
      if (!handle) return;
      handle.addEventListener('pointerdown', event => {
        event.preventDefault();
        const start = axis === 'x' ? event.clientX : event.clientY;
        const original = layout[name];
        const onMove = moveEvent => {
          const current = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
          const delta = current - start;
          setLayoutSize(name, name === 'ledgerWidth' ? original - delta : original + delta);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      });
      handle.addEventListener('keydown', event => {
        const step = 16;
        if (axis === 'x' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (axis === 'y' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const direction = axis === 'x' ? (event.key === 'ArrowLeft' ? 1 : -1) : (event.key === 'ArrowUp' ? -1 : 1);
        setLayoutSize(name, layout[name] + direction * step);
      });
    }
    attachResize(document.getElementById('ledger-width-handle'), 'ledgerWidth', 'x');
    attachResize(document.getElementById('map-height-handle'), 'mapHeight', 'y');
    attachResize(document.getElementById('ledger-height-handle'), 'ledgerHeight', 'y');
    resetLayout.addEventListener('click', resetLayoutSize);
    function setPlayerView(enabled) {
      image.src = enabled ? exportData.playerMapImage : exportData.mapImage;
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = enabled ? 'Player view on' : 'Player view';
    }
    if (ledger) ledger.textContent = exportData.ledgerText;
    toggle.addEventListener('click', () => setPlayerView(toggle.getAttribute('aria-pressed') !== 'true'));
    resetLayoutSize();
    setPlayerView(exportData.initialPlayerView);
  </script>
</body>
</html>
`
}

export function buildMarkdownExport({ title = 'Dungeon Map', pngFileName, ledgerText }: MarkdownExportInput): string {
  const ledgerSection = ledgerText ? `\n## Room ledger\n\n\`\`\`text\n${ledgerText}\`\`\`\n` : ''
  return `# ${title}\n\n![${title}](${pngFileName.replace(/\\/g, '/')})\n${ledgerSection}`
}

export function siblingFilePath(path: string, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`
  return path.replace(/\.[^./\\]*$/, '') + normalizedExtension
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
