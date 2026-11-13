/**
 * Records the demo, in one take, against the production build.
 *
 * The film is silent on purpose: the challenge requires the entrant's own voice, so this
 * leaves a picture lock with burned-in captions that can be narrated over, or watched
 * without sound. `scripts/video.mjs` muxes a voice track onto it.
 *
 *   node scripts/record.mjs            # writes video/raw/*.webm
 */
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const OUT = "video/raw";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173/";
const PEER = process.env.PEER_URL ?? "http://127.0.0.1:5174/";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

const CSS = `
  #film-caption {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
    padding: 22px 40px 26px; pointer-events: none;
    font: 400 25px/1.35 "Plex Sans", system-ui, sans-serif; color: #f4f1ea;
    background: linear-gradient(180deg, rgba(28,25,22,0) 0%, rgba(28,25,22,.82) 46%, rgba(28,25,22,.92) 100%);
    opacity: 0; transition: opacity 320ms ease; text-align: left; letter-spacing: .01em;
  }
  #film-caption.on { opacity: 1; }
  #film-caption b { color: #f0a07f; font-weight: 500; }
`;

async function caption(text) {
  await page.evaluate(
    ({ css, text }) => {
      let style = document.getElementById("film-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "film-style";
        style.textContent = css;
        document.head.append(style);
      }
      let box = document.getElementById("film-caption");
      if (!box) {
        box = document.createElement("div");
        box.id = "film-caption";
        document.body.append(box);
      }
      box.innerHTML = text;
      box.classList.add("on");
    },
    { css: CSS, text },
  );
}

const wait = (ms) => page.waitForTimeout(ms);

async function clickPrimary() {
  await page.waitForSelector("#modal.on", { timeout: 8000 });
  await wait(650);
}

async function typeInto(selector, text, perChar = 26) {
  await page.click(selector);
  await page.type(selector, text, { delay: perChar });
}

async function run() {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__saddle?.ready === true, { timeout: 20000 });
  await wait(2600);

  await caption("<b>Saddle &amp; Spoke.</b> A workshop's website — and there is no chat window.");
  await wait(3200);

  await caption("Describe the fault the way you would say it out loud.");
  await typeInto("#input", "Third gear jumps when I push hard uphill. It started at about 900 miles.", 22);
  await wait(900);
  await page.click("#send");

  // Review sheet
  await clickPrimary();
  await caption("Three agents read the shop's own stock and diary. Every change is reviewed first.");
  await wait(2400);
  await page.check("#trust-edits").catch(() => {});
  await page.click("#modal-actions button.primary");
  await wait(700);

  // Consent
  await clickPrimary();
  await caption("<b>Spare Room</b> is a parts co-op on a different origin. It runs here, on your model.");
  await wait(2600);
  await page.click("#modal-actions button.primary");
  await wait(600);

  await caption("It is told the shop's trade account. Not the customer's name, phone or frame number.");
  await wait(3000);

  // Booking
  await clickPrimary();
  await caption("A booking is irreversible, so it always asks. The details stay in this browser.");
  await wait(2200);
  await typeInto("#modal .field-row input[type=text]", "A. Visitor", 40);
  await typeInto("#modal .field-row input[type=tel]", "07700 900123", 40);
  await wait(700);
  await page.click("#modal-actions button.primary");
  await wait(2600);

  await caption("Findings, parts, labour, a slot, a receipt. The drawing annotated itself.");
  await wait(2600);

  // Inspector
  await page.click("#open-inspector");
  await wait(900);
  await caption("The Inspector reports the seven interoperability checks from the specification.");
  await wait(2200);
  await page.evaluate(() => {
    void window.__saddle.suite();
  });
  for (let i = 0; i < 4; i++) {
    const open = await page
      .waitForSelector("#modal.on", { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!open) break;
    await wait(400);
    await page.check("#trust-edits").catch(() => {});
    await page.click("#modal-actions button.primary");
    await wait(250);
  }
  await wait(1800);
  await caption("Six of seven observed — with the evidence each one saw, not a claim.");
  await wait(2400);

  await page.evaluate(() => {
    void window.__saddle.breakIt.invalid();
  });
  await wait(1200);
  await page.evaluate(() => {
    void window.__saddle.breakIt.cycle();
  });
  await wait(1800);
  await page.evaluate(() => {
    void window.__saddle.breakIt.budget();
  });
  await wait(1200);
  await page.evaluate(() => {
    void window.__saddle.breakIt.denied();
  });
  await wait(1600);
  await caption("An invalid network, a cycle, an over-budget run, a denied origin. All refused.");
  await wait(2800);

  // Settings
  await page.click("#close-inspector");
  await page.click("#open-settings");
  await wait(1200);
  await caption("No publisher-funded model. Paste your own key, pick any router — the graph is the same.");
  await wait(3400);
  await page.click("#close-settings");
  await wait(600);

  // Peer site
  await page.goto(PEER, { waitUntil: "networkidle" });
  await wait(1400);
  await caption("<b>Spare Room</b> publishes its counter as an agent network. It answers agents, not people.");
  await wait(3600);
  await page.evaluate(() => {
    const box = document.getElementById("film-caption");
    if (box) box.classList.remove("on");
  });
  await wait(900);
}

await run();
await context.close();
await browser.close();

// Playwright names each recording with a random id; keep the single take.
const files = readdirSync(OUT).filter((name) => name.endsWith(".webm"));
if (files.length === 1) renameSync(path.join(OUT, files[0]), path.join(OUT, "take.webm"));
console.log(`recorded ${OUT}/${files.length === 1 ? "take.webm" : files.join(", ")}`);
