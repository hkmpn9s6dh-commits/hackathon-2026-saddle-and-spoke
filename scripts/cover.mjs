/**
 * The submission cover, rendered from the same page styles at 1500×1000.
 * No stock photography: the cover is the drawing, the sheet and the one sentence.
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe");
mkdirSync("submission", { recursive: true });

const font = (name) => `data:font/woff2;base64,${readFileSync(`src/fonts/${name}`).toString("base64")}`;
const fraunces = font("fraunces-latin-wght-normal.woff2");
const plexSans = font("ibm-plex-sans-latin-400-normal.woff2");
const plexMono = font("ibm-plex-mono-latin-400-normal.woff2");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(${fraunces}) format("woff2");font-weight:100 900}
@font-face{font-family:S;src:url(${plexSans}) format("woff2");font-weight:400}
@font-face{font-family:M;src:url(${plexMono}) format("woff2");font-weight:400}
*{box-sizing:border-box;margin:0}
body{width:1500px;height:1000px;background:#f2eee4;color:#1c1916;overflow:hidden;position:relative;
     font-family:S,system-ui,sans-serif}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E")}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:baseline}
.mark{font:600 46px/1 F,Georgia,serif;letter-spacing:-.02em}
.mark i{color:#b4441f;font-style:italic}
.kicker{font:400 15px/1 M,monospace;letter-spacing:.18em;text-transform:uppercase;color:#8c3a1e}
h1{font:600 78px/1.03 F,Georgia,serif;letter-spacing:-.03em;margin:52px 0 0;max-width:9ch}
h1 em{font-style:italic;color:#8c3a1e}
.sub{font:400 25px/1.45 S,sans-serif;color:#423b34;max-width:26ch;margin-top:20px}
.art{position:absolute;right:56px;top:272px;width:790px;height:510px}
.foot{position:absolute;left:72px;bottom:70px;max-width:760px;font:400 13px/1.9 M,monospace;letter-spacing:.08em;
      text-transform:uppercase;color:#6b635a}
.foot b{display:block;color:#1c1916;font-weight:400}
.bk-frame path{fill:none;stroke:#1c1916;stroke-width:6.5;stroke-linecap:round;stroke-linejoin:round}
.bk-fork,.bk-stay{fill:none;stroke:#1c1916;stroke-width:4.5;stroke-linecap:round}
.bk-tyre{fill:none;stroke:#423b34;stroke-width:5.4}
.bk-rim{fill:none;stroke:#868b8e;stroke-width:2.2}
.bk-spokes line{stroke:#868b8e;stroke-width:.9;opacity:.85}
.bk-hub{fill:none;stroke:#423b34;stroke-width:1.6}
.bk-post,.bk-stem{stroke:#1c1916;stroke-width:4;stroke-linecap:round}
.bk-saddle{fill:none;stroke:#1c1916;stroke-width:4;stroke-linejoin:round}
.bk-bar{fill:none;stroke:#1c1916;stroke-width:5;stroke-linecap:round}
.bk-chainring{fill:none;stroke:#423b34;stroke-width:2.4}
.bk-teeth{fill:none;stroke:#6b635a;stroke-width:3.4;stroke-dasharray:2.6 4.2}
.bk-cassette{fill:none;stroke:#6b635a;stroke-width:1.8}
.bk-crank line{stroke:#1c1916;stroke-width:5;stroke-linecap:round}
.bk-crank rect{fill:#1c1916}
.bk-chain-line{fill:none;stroke:#423b34;stroke-width:2.1}
.bk-mech path{fill:none;stroke:#423b34;stroke-width:2.6}
.bk-mech circle{fill:none;stroke:#423b34;stroke-width:2.2}
.bk-brake{fill:none;stroke:#423b34;stroke-width:2.6;stroke-linecap:round}
.bk-dim line{stroke:#868b8e;stroke-width:.7;opacity:.7}
.bk-dim path{fill:#868b8e;opacity:.7}
.bk-dim text{font:400 17px M,monospace;fill:#868b8e}
.bk-titleblock line{stroke:rgba(28,25,22,.14);stroke-width:1}
.bk-tb-1{font:400 14px M,monospace;fill:#6b635a;letter-spacing:.1em}
.bk-tb-2{font:400 14px M,monospace;fill:#868b8e;letter-spacing:.1em}
.bk-part{opacity:0}
.bk-anno circle{opacity:0}
</style></head><body>
<div class="wrap">
  <div class="top"><div class="mark">Saddle <i>&amp;</i> Spoke</div><div class="kicker">Open Agentic Web Challenge</div></div>
  <h1>A workshop that <em>answers agents</em>.</h1>
  <div class="sub">Describe a fault. Three agents read the shop's own stock, quote the bench and book the slot — and the drawing annotates itself as they work.</div>
</div>
<div class="art" id="art"></div>
<div class="foot"><b>Saddle &amp; Spoke · 11 Quay Street, Saltcoats</b>One network · three agents · a peer parts co-op on another origin</div>
<div class="grain"></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
// Reuse the real drawing from the built page, so the cover is the product.
const svg = readFileSync("dist/index.html", "utf8").includes("bike")
  ? await (async () => {
      const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await live.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" }).catch(() => {});
      const markup = await live.evaluate(() => document.querySelector("#bike-holder svg")?.outerHTML ?? "").catch(() => "");
      await live.close();
      return markup;
    })()
  : "";
if (svg) {
  await page.evaluate((markup) => {
    document.querySelector("#art").innerHTML = markup;
    const target = document.querySelector("#art svg");
    if (!target) return;
    target.setAttribute("viewBox", "-20 -20 1040 690");
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.innerHTML = `
      <circle cx="475" cy="382" r="27" fill="none" stroke="#b4441f" stroke-width="2" opacity=".45"/>
      <circle cx="475" cy="382" r="16" fill="#b4441f"/>
      <text x="475" y="388.5" text-anchor="middle" font-family="M,monospace" font-size="17" fill="#fdf9f1">1</text>
      <circle cx="392" cy="486" r="27" fill="none" stroke="#b4441f" stroke-width="2" opacity=".45"/>
      <circle cx="392" cy="486" r="16" fill="#b4441f"/>
      <text x="392" y="492.5" text-anchor="middle" font-family="M,monospace" font-size="17" fill="#fdf9f1">2</text>`;
    target.appendChild(layer);
  }, svg);
}
await page.waitForTimeout(400);
await page.screenshot({ path: "submission/cover-1500x1000.jpg", type: "jpeg", quality: 92 });
await page.screenshot({ path: "submission/cover-3x2.jpg", type: "jpeg", quality: 92 });
await browser.close();
console.log("wrote submission/cover-1500x1000.jpg and cover-3x2.jpg");
