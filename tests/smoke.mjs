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
  assert.equal(await page.locator(".bench-photograph").evaluate((img) => img.complete && img.naturalWidth > 0), true);
  assert.equal(await page.locator(".message").count(), 4);
  assert.equal(await page.locator("#translation-cable").count(), 1);
  assert.equal(await page.locator(".transmit-button").isDisabled(), true);
  await page.getByRole("button", { name: "Field notes" }).click();
  await page.getByRole("dialog", { name: "Notes from the laboratory" }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  await page.locator("#ask").fill("Do you dream?");
  await page.locator("#ask").press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".message").length === 6 && !document.querySelector(".message-streaming"));
  assert.ok((await page.locator(".message-fly").last().innerText()).length > 40);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".message").count(), 6);
  await page.getByRole("button", { name: "Start a new conversation" }).click();
  await page.getByRole("button", { name: "Begin again", exact: true }).click();
  assert.equal(await page.locator(".message").count(), 4);

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
  console.log("FlyBrain smoke checks passed.");
} finally {
  await browser.close();
}