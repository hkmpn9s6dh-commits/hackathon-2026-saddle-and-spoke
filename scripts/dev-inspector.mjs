import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
const exe = process.env.CHROME_PATH ?? `${process.env.USERPROFILE}/AppData/Local/Google/Chrome/Application/chrome.exe`;
if (!existsSync(exe)) throw new Error("chrome missing");
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__saddle?.ready === true);
await page.evaluate(() => window.__saddle.openInspector("checks"));
await page.waitForTimeout(400);
await page.screenshot({ path: "proof/shots/dev-checks.jpg, type: "jpeg", quality: 82" });
await page.click("#panel-checks .btn.primary");
await page.waitForTimeout(500);
for (let i = 0; i < 6; i++) {
  const open = await page.waitForSelector("#modal.on", { timeout: 5000 }).then(() => true).catch(() => false);
  if (!open) break;
  const text = await page.locator("#modal-title").textContent();
  console.log("modal:", text);
  const textInput = page.locator("#modal .field-row input[type=text]");
  if (await textInput.count()) {
    await textInput.first().fill("A. Visitor");
    await page.fill("#modal .field-row input[type=tel]", "07700 900123");
  }
  await page.check("#trust-edits").catch(() => {});
  await page.click("#modal-actions button.primary");
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: "proof/shots/dev-checks-done.jpg, type: "jpeg", quality: 82" });
for (const [name, label] of [["invalid","Invalid network"],["cycle","Composition cycle"],["budget","Over budget"],["denied","Denied origin"]]) {
  await page.click(`#panel-checks button:has-text("${label}")`);
  await page.waitForTimeout(900);
}
await page.screenshot({ path: "proof/shots/dev-break.jpg, type: "jpeg", quality: 82" });
const results = await page.evaluate(() => window.__saddle.checks.breakResults);
console.log(JSON.stringify(results, null, 1));
await browser.close();
