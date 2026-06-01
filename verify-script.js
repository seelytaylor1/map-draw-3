const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:5177");
  await page.waitForTimeout(1000);

  // Screenshot initial state
  await page.screenshot({ path: "D:\\Taylor Projects\\code\\map-draw-3\\verify-01-initial.png" });

  // Paint some floor tiles (left-click drag across canvas)
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy);
  await page.mouse.move(cx + 100, cy + 100);
  await page.mouse.move(cx, cy + 100);
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "D:\\Taylor Projects\\code\\map-draw-3\\verify-02-floor-painted.png" });

  // Find and click grid toggle button
  const gridBtn = page.getByText(/floor grid/i);
  const btnText = await gridBtn.textContent();
  console.log("Grid button text:", btnText);
  await gridBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "D:\\Taylor Projects\\code\\map-draw-3\\verify-03-grid-on.png" });

  // Check button text changed to ON
  const btnTextAfter = await gridBtn.textContent();
  console.log("Grid button after click:", btnTextAfter);

  // Toggle off
  await gridBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "D:\\Taylor Projects\\code\\map-draw-3\\verify-04-grid-off.png" });
  const btnTextOff = await gridBtn.textContent();
  console.log("Grid button after toggle off:", btnTextOff);

  // Toggle back on for inspection
  await gridBtn.click();
  await page.waitForTimeout(300);

  // Probe: toggle rapidly (stress test)
  for (let i = 0; i < 10; i++) {
    await gridBtn.click();
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: "D:\\Taylor Projects\\code\\map-draw-3\\verify-05-rapid-toggle.png" });

  await browser.close();
  console.log("Done");
})();
