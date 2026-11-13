/**
 * A quick look at the built site: does it boot, does a replay run complete, and what
 * does it look like? Used during development; the real proof is scripts/e2e.mjs.
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    path.join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
}

mkdirSync("proof/shots", { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(process.env.BASE_URL ?? "http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__saddle?.ready === true, { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: "proof/shots/dev-boot.jpg, type: "jpeg", quality: 82", fullPage: false });

const state = await page.evaluate(() => ({
  ready: Boolean(window.__saddle?.ready),
  network: window.__saddle?.network?.name ?? null,
  agents: window.__saddle?.network ? [...window.__saddle.network.agents.keys()] : [],
}));
console.log("boot:", JSON.stringify(state));

await page.fill("#input", "Third gear jumps when I push hard uphill. It started at about 900 miles.");
await page.click("#send");
await page.waitForTimeout(1200);
await page.screenshot({ path: "proof/shots/dev-consent.jpg, type: "jpeg", quality: 82" });

// Answer every dialog the run raises, in order, until it finishes.
for (let i = 0; i < 10; i++) {
  const opened = await page
    .waitForSelector("#modal.on", { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) break;
  await page.waitForTimeout(150);
  await page.screenshot({ path: `proof/shots/dev-modal-${i}.jpg` });
  const heading = await page.locator("#modal-title").textContent();
  const names = await page.locator("#modal .review-name").allTextContents();
  console.log(`modal[${i}]:`, heading, "|", names.join(", "));
  const textInput = page.locator("#modal .field-row input[type=text]");
  if (await textInput.count()) {
    await textInput.first().fill("A. Visitor");
    await page.fill("#modal .field-row input[type=tel]", "07700 900123");
  }
  await page.click("#modal-actions button.primary");
  await page.waitForTimeout(250);
}

await page.waitForTimeout(2500);
await page.screenshot({ path: "proof/shots/dev-after.jpg, type: "jpeg", quality: 82" });

const after = await page.evaluate(() => ({
  findings: window.__saddle.store.state.findings.length,
  bench: window.__saddle.store.state.bench.length,
  booked: window.__saddle.store.state.booked,
  trace: window.__saddle.trace.history().length,
  events: window.__saddle.trace.history().slice(-14).map((e) => `${e.kind} ${e.message}`),
}));
console.log("after:", JSON.stringify(after, null, 1));
console.log("errors:", errors.slice(0, 8));
await browser.close();
