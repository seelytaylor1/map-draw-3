import { chromium } from 'playwright'
import type { IsoDiagnosticConfig, IsoDiagnosticReport, IsoInteractionReport } from '../src/isoDiagnostics'

const baseUrl = process.env.ISO_DIAGNOSTIC_URL ?? 'http://127.0.0.1:4173/'
const diagnosticUrl = new URL(baseUrl)
diagnosticUrl.searchParams.set('iso-diagnostic', '1')

const fixtures: IsoDiagnosticConfig[] = [false, true].flatMap(cacheBatches =>
  [1, 5, 10, 20].map(levelCount => ({
    levelCount,
    cols: 88,
    rows: 68,
    density: 0.8,
    show3D: true,
    cacheBatches,
  })),
)

type Run = {
  fixture: IsoDiagnosticReport['config']
  render: Omit<IsoDiagnosticReport, 'config'>
  pan: IsoInteractionReport
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(diagnosticUrl.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__mapDrawDiagnostics), undefined, { timeout: 10000 })

  const runs: Run[] = []
  for (const fixture of fixtures) {
    const requestId = await page.evaluate(config => window.__mapDrawDiagnostics!.setFixture(config), fixture)
    const report = await page.evaluate(id => window.__mapDrawDiagnostics!.waitForReport(id), requestId)
    const pan = await page.evaluate(() => window.__mapDrawDiagnostics!.measurePan(1000))
    const { config, ...render } = report
    runs.push({ fixture: config, render, pan })
  }

  console.log(JSON.stringify({ diagnosticUrl: diagnosticUrl.toString(), runs }, null, 2))
} finally {
  await browser.close()
}
