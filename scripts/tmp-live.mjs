import { chromium } from "playwright-core";
const exe = process.env.USERPROFILE + "/AppData/Local/Google/Chrome/Application/chrome.exe";
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (m.type()==="error") errs.push(m.text()); });
await p.goto("https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__saddle?.ready === true, { timeout: 25000 });
await p.fill("#input", "Third gear jumps when I push hard uphill. It started at about 900 miles.");
await p.click("#send");
for (let i = 0; i < 8; i++) {
  const open = await p.waitForSelector("#modal.on", { timeout: 4000 }).then(()=>true).catch(()=>false);
  if (!open) break;
  await p.waitForTimeout(150);
  const t = p.locator("#modal .field-row input[type=text]");
  if (await t.count()) { await t.first().fill("A. Visitor"); await p.fill("#modal .field-row input[type=tel]", "07700 900123"); }
  await p.check("#trust-edits").catch(()=>{});
  await p.click("#modal-actions button.primary");
  await p.waitForTimeout(250);
}
await p.waitForTimeout(2200);
await p.screenshot({ path: "proof/shots/live.png.jpg".replace(".png",""), type: "jpeg", quality: 86 });
console.log("errors:", errs.slice(0,4));
console.log("state:", JSON.stringify(await p.evaluate(() => ({f: window.__saddle.store.state.findings.length, b: window.__saddle.store.state.bench.length, booked: !!window.__saddle.store.state.booked}))));
await b.close();
