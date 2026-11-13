/**
 * Builds the blind-ranking set for gate D: this site's main screen plus five external
 * references, each saved as a plain 16:10 JPEG with no labels, then lettered A–F in a
 * shuffled order recorded in proof/rank/order.json.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe");
mkdirSync("proof/rank/src", { recursive: true });

const sources = [
  { id: "saddle", url: "http://127.0.0.1:5173/", wait: 1500, local: true },
  { id: "linear", url: "https://linear.app/", wait: 3500 },
  { id: "teenage", url: "https://teenage.engineering/", wait: 3000 },
  { id: "arena", url: "https://www.are.na/", wait: 3000 },
  { id: "wwaw", url: "https://worldwideagenticweb.org/", wait: 5000 },
  { id: "guesthouse", url: "http://127.0.0.1:5176/", wait: 1200 },
  { id: "pizza", url: "http://127.0.0.1:5175/", wait: 1200, local: true },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const source of sources) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(source.wait ?? 2000);
    await page.screenshot({ path: `proof/rank/src/${source.id}.jpg`, type: "jpeg", quality: 86 });
    console.log("captured", source.id);
  } catch (error) {
    console.log("failed", source.id, error.message);
  }
  await page.close();
}
await browser.close();

// Shuffle deterministically so the order can be regenerated, then never shown to a judge.
import { existsSync } from "node:fs";
const ids = sources.map((source) => source.id).filter((id) => existsSync(`proof/rank/src/${id}.jpg`));
let seed = 20261113;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
for (let i = ids.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [ids[i], ids[j]] = [ids[j], ids[i]];
}
const order = ids.map((id, index) => ({ letter: String.fromCharCode(65 + index), id }));
writeFileSync("proof/rank/order.json", `${JSON.stringify(order, null, 2)}\n`);
console.log(order.map((entry) => `${entry.letter} ${entry.id}`).join("\n"));
