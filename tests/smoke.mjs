import { chromium } from "playwright";
import assert from "node:assert/strict";

// Start the Vite preview first, then run: node tests/smoke.mjs
const baseURL = process.env.APP_URL || "http://localhost:4173";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  // Boot screen with the fly choreography
  await page.locator(".boot-screen").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Enter the laboratory" }).click();
  // Disclosure on first visit
  const disclosure = page.locator(".disclosure-dialog");
  if (await disclosure.count()) {
    await page.getByRole("button", { name: /I understand/ }).click();
  }
  assert.equal(await page.locator(".bench-photograph").evaluate((img) => img.complete && img.naturalWidth > 0), true);
  // Transcript starts EMPTY - nothing canned
  assert.equal(await page.locator(".message").count(), 0);
  assert.equal(await page.locator(".transcript-empty-note").count(), 1);
  assert.equal(await page.locator("#translation-cable").count(), 1);
  assert.equal(await page.locator(".transmit-button").isDisabled(), true);
  await page.getByRole("button", { name: "Field notes" }).click();
  await page.getByRole("dialog", { name: "Notes from the laboratory" }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  // Peter answers from the real brain (bundle must be live in the preview build)
  await page.locator("#ask").fill("hello peter");
  await page.locator("#ask").press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".message").length === 2 && !document.querySelector(".message-streaming"), null, { timeout: 30000 });
  const replyNote = await page.locator(".response-note").last().innerText();
  assert.match(replyNote, /FAFB v783/, "reply must carry real simulation telemetry");
  assert.doesNotMatch(replyNote, /SCRIPTED/);
  // The live spike raster appears after the first real reply
  await page.locator(".bench-raster-overlay").waitFor({ state: "visible" });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enter the laboratory" }).click();
  // Nothing persists: a reload is a fresh page, like real speech
  assert.equal(await page.locator(".message").count(), 0);

  await page.getByRole("button", { name: "Pause motion" }).click();
  await page.getByRole("button", { name: "Field notes" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Notes from the laboratory" }).evaluate((el) => getComputedStyle(el).opacity), "1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Resume motion" }).click();
  await page.getByRole("button", { name: "Inspect in 3D" }).click();
  await page.locator(".inspection-canvas canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Test the signal" }).click();
  await page.getByText("SIGNAL PASSING THROUGH", { exact: true }).waitFor();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#ask").scrollIntoViewIfNeeded();
  assert.equal(await page.locator("#ask").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log("Peter the Fly smoke checks passed.");
} finally {
  await browser.close();
}
