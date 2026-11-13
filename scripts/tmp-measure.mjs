import { chromium } from "playwright-core";
const exe = process.env.USERPROFILE + "/AppData/Local/Google/Chrome/Application/chrome.exe";
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__saddle?.ready === true, { timeout: 20000 });
console.log(JSON.stringify(await p.evaluate(() => {
  const r = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    inner: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    bench: r(".bench"), drawing: r(".drawing"), desk: r(".desk"), sheet: r("#sheet"), notes: r(".notes"),
    jobno: getComputedStyle(document.querySelector(".jobno")).fontSize,
    body: getComputedStyle(document.body).fontSize,
    gridCols: getComputedStyle(document.querySelector(".bench")).gridTemplateColumns,
  };
}), null, 1));
await b.close();
