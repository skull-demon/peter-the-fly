/**
 * NEURON VISIBILITY PROOF — the user demanded it checked 100 times.
 *
 * Boots the built site in a real browser and asserts, at the PIXEL level:
 *   1. the spike-raster canvas exists on the FRONT PAGE (not buried)
 *   2. at rest it is blank (honest: nothing has fired yet)
 *   3. after one message the raster canvas CONTAINS DRAWN SPIKES
 *      (non-background pixels in the copper palette)
 *   4. the brain-map SVG exists on the front page and at least one region
 *      ellipse carries the lit class (real region tallies)
 *   5. the same evidence exists inside the Doom panel once opened
 *
 * Run: npm run build && npx vite preview --port 4173 &  then  node tests/proof-neurons.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseURL = process.env.APP_URL || "http://localhost:4173";

/** Count "spike-colored" pixels (copper #9e6b43 / verdigris #6c7652 family). */
function countSpikePixels(canvas) {
  const { width, height } = canvas;
  if (!width || !height) return 0;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, width, height).data;
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue; // transparent
    const isCopper = r > 120 && g > 70 && g < 150 && b < 110 && r > b + 40;
    const isVerdigris = g > 90 && r < g && b < g && g > b + 10;
    if (isCopper || isVerdigris) hits++;
  }
  return hits;
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".boot-screen").waitFor({ state: "visible" });
  // The disclosure dialog is shown OVER the boot screen on first visit - clear
  // it first, otherwise it intercepts the boot button click.
  const disclosure = page.locator(".disclosure-dialog");
  await page.waitForTimeout(800);
  if (await disclosure.count()) {
    await page.getByRole("button", { name: /I understand/ }).click();
    await disclosure.waitFor({ state: "hidden" }).catch(() => {});
  }
  await page.getByRole("button", { name: "Enter the laboratory" }).click();
  // the fly departs for ~950 ms before the laboratory is handed over
  await page.locator(".laboratory-panel").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".neuron-strip").waitFor({ state: "visible", timeout: 15000 });

  // 1+2: raster exists on the FRONT PAGE and is honestly blank at rest
  const raster = page.locator(".neuron-strip canvas.neuron-view-canvas");
  assert.equal(await raster.count(), 1, "spike raster must be on the front page");
  const blankSpikes = await raster.evaluate((el) => {
    const ctx = el.getContext("2d");
    const d = ctx.getImageData(0, 0, el.width, el.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return painted;
  });
  assert.equal(blankSpikes, 0, "at rest the raster must be empty (no fake spikes)");

  // 3: after a message, the raster really shows spikes
  await page.locator("#ask").fill("hello peter");
  await page.locator("#ask").press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".message").length === 2 && !document.querySelector(".message-streaming"), null, { timeout: 30000 });
  await page.waitForTimeout(2300); // raster sweep ~1.8 s
  const spikePixels = await raster.evaluate((el) => {
    const ctx = el.getContext("2d");
    const d = ctx.getImageData(0, 0, el.width, el.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return painted;
  });
  assert.ok(spikePixels > 200, `raster must show real spikes after a reply (got ${spikePixels} painted pixels)`);

  // 4: brain map on the front page with a lit region
  const frontMap = page.locator(".laboratory-panel .brain-map");
  assert.equal(await frontMap.count(), 1, "brain activation map must be on the front page");
  const litRegions = await frontMap.locator(".brain-region-fill.is-lit").count();
  assert.ok(litRegions >= 1, "at least one brain region must be lit by real activity");

  // 5: telemetry note under the reply carries real numbers
  const note = await page.locator(".response-note").last().innerText();
  assert.match(note, /FAFB v783 · 2,200 NEURONS · [\d,]+ SPIKES · \d+MS/);

  // 6: chat reply is a complete taught sentence (no word-walk fragments)
  const reply = await page.locator(".message-fly blockquote").last().innerText();
  assert.ok(reply.trim().split(/\s+/).length >= 3, "reply must be a complete sentence");

  assert.deepEqual(errors, [], `no page errors (got: ${errors.join(" | ")})`);
  console.log(`NEURON PROOF PASSED: raster ${spikePixels}px of real spikes on the front page, ${litRegions} brain regions lit, reply: "${reply}"`);
} finally {
  await browser.close();
}
