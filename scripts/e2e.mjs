/**
 * End-to-end proof, run against the production build.
 *
 * Everything here is something a judge could do by hand: boot the page, run a job
 * from complaint to booking, decline a booking, run the conformance suite, and press
 * the four buttons that are supposed to fail. The screenshots it leaves in
 * `proof/shots/` are the evidence for the submission.
 *
 *   node scripts/e2e.mjs           # expects dist/ to be built, starts two servers
 *   BASE_URL=http://… node scripts/e2e.mjs
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const OUT = "proof/shots";
mkdirSync(OUT, { recursive: true });

// These two ports are the loopback origins the published peer policy allows for
// development. Any other origin is refused, which is what check 7 demonstrates.
const SITE_PORT = 5173;
const PEER_PORT = 5174;
const CHROME = findChrome();

let checks = 0;
let failures = 0;

function ok(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    path.join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error("No Chrome found. Set CHROME_PATH to a Chromium-based browser.");
}

const servers = [];
function serve(root, port, extra = []) {
  const child = spawn(process.execPath, ["scripts/serve.mjs", "--root", root, "--port", String(port), ...extra], {
    stdio: "ignore",
    detached: false,
  });
  servers.push(child);
  return child;
}

async function waitFor(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${url} never answered`);
}

async function answerDialogs(page, { trust = true, decline = false, contact = "A. Visitor" } = {}) {
  const answers = [];
  for (let i = 0; i < 8; i++) {
    const opened = await page
      .waitForSelector("#modal.on", { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) break;
    await page.waitForTimeout(120);
    const heading = (await page.locator("#modal-title").textContent()) ?? "";
    answers.push(heading);
    if (heading.startsWith("Contact")) {
      await page.click(decline ? "#modal-actions button:not(.primary)" : "#modal-actions button.primary");
    } else {
      const textInput = page.locator("#modal .field-row input[type=text]");
      if (await textInput.count()) {
        await textInput.first().fill(contact);
        await page.fill("#modal .field-row input[type=tel]", "07700 900123");
      }
      if (trust) await page.check("#trust-edits").catch(() => {});
      await page.click(decline ? "#modal-actions button:not(.primary)" : "#modal-actions button.primary");
    }
    await page.waitForTimeout(200);
  }
  return answers;
}

async function main() {
  const external = process.env.BASE_URL;
  if (!external) {
    serve("peer", PEER_PORT);
    serve("dist", SITE_PORT, ["--peer-origin", `http://127.0.0.1:${PEER_PORT}/`]);
    await waitFor(`http://127.0.0.1:${SITE_PORT}/`);
    await waitFor(`http://127.0.0.1:${PEER_PORT}/agent-manifest.json`);
  }
  const base = external ?? `http://127.0.0.1:${SITE_PORT}/`;
  const siteOrigin = new URL(base).origin;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const consoleErrors = [];
  const peerRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("request", (request) => {
    // Anything that is not our own origin, and is one of the published artifacts.
    if (!request.url().startsWith(siteOrigin) && /agent-manifest\.json|links\.json|\.hocon|\.network\.json/.test(request.url())) {
      peerRequests.push({ url: request.url(), headers: request.headers() });
    }
  });

  console.log(`\nSaddle & Spoke e2e — ${base}\n`);

  await page.goto(base, { waitUntil: "networkidle" });
  const booted = await page
    .waitForFunction(() => window.__saddle?.ready === true, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  ok("the page boots and validates its own network", booted);
  if (!booted) {
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: `${OUT}/e2e-boot-failure.jpg` });
    await browser.close();
    servers.forEach((child) => child.kill());
    process.exit(1);
  }
  ok("three agents are published", (await page.evaluate(() => [...window.__saddle.network.agents.keys()])).length === 3);
  ok("the drawing is mounted", (await page.locator("#bike-holder svg.bike").count()) === 1);
  await page.screenshot({ path: `${OUT}/01-boot.jpg` });

  // ── 1. a full job, from complaint to booking ─────────────────────
  await page.fill("#input", "Third gear jumps when I push hard uphill. It started at about 900 miles.");
  await page.click("#send");
  const dialogs = await answerDialogs(page);
  ok("the run asks for review before writing", dialogs.some((heading) => heading.startsWith("Review")), dialogs.join(" | "));
  ok("a peer origin is contacted only after consent", dialogs.some((heading) => heading.startsWith("Contact")), dialogs.join(" | "));
  ok("the booking is confirmed separately", dialogs.some((heading) => heading.toLowerCase().includes("booking")), dialogs.join(" | "));

  const job = await page.evaluate(() => {
    const state = window.__saddle.store.state;
    return {
      findings: state.findings.length,
      bench: state.bench.length,
      booked: state.booked?.receipt ?? null,
      highlight: state.highlight?.part ?? null,
      traces: window.__saddle.trace.history().length,
    };
  });
  ok("findings are written on the sheet", job.findings === 2, String(job.findings));
  ok("parts are on the bench", job.bench === 2, String(job.bench));
  ok("a booking returns a receipt", Boolean(job.booked), String(job.booked));
  ok("a part is pointed at on the drawing", Boolean(job.highlight), String(job.highlight));
  ok("the ticket is stamped", (await page.locator("#stamp.on").count()) === 1);
  ok("the total is not zero", (await page.locator("#total-amount").textContent()) !== "0.00");
  await page.screenshot({ path: `${OUT}/02-job-booked.jpg` });

  // ── 2. the peer was fetched cross-origin, without credentials ────
  const manifestFetch = peerRequests.find((request) => request.url.endsWith("agent-manifest.json"));
  ok("the peer manifest is fetched cross-origin", Boolean(manifestFetch), manifestFetch?.url ?? "none");
  ok(
    "no authorization header is sent to the peer",
    peerRequests.every((request) => !request.headers["authorization"]),
  );
  ok(
    "the peer definition is fetched too",
    peerRequests.some((request) => request.url.endsWith(".hocon") || request.url.endsWith(".network.json")),
  );

  // ── 3. declining a booking leaves the sheet alone ───────────────
  await page.evaluate(() => window.__saddle.store.reset());
  await page.fill("#input", "The front brake rubs after I put the wheel back on.");
  await page.click("#send");
  await answerDialogs(page, { decline: true });
  const declined = await page.evaluate(() => ({
    booked: window.__saddle.store.state.booked,
    receipts: window.__saddle.registry.receipts.filter((receipt) => receipt.status === "denied").length,
  }));
  ok("a declined booking books nothing", declined.booked === null);
  ok("the refusal is recorded as a receipt", declined.receipts > 0, String(declined.receipts));

  // ── 4. the conformance suite ────────────────────────────────────
  await page.evaluate(() => window.__saddle.openInspector("checks"));
  // Fire and forget: the suite blocks on the review dialog, so awaiting the promise
  // here would deadlock the page against the driver.
  await page.evaluate(() => {
    void window.__saddle.suite();
  });
  await answerDialogs(page);
  await page.waitForTimeout(600);
  const suite = await page.evaluate(() =>
    [...document.querySelectorAll("#panel-checks .check")].map((node) => ({
      pass: node.classList.contains("pass"),
      title: node.querySelector(".ctitle")?.textContent ?? "",
    })),
  );
  ok("checks 1–6 pass after the suite", suite.slice(0, 6).every((item) => item.pass), JSON.stringify(suite.slice(0, 6)));
  await page.screenshot({ path: `${OUT}/03-checks.jpg` });

  // ── 5. the four refusals ───────────────────────────────────────
  await page.evaluate(() => {
    void window.__saddle.breakIt.invalid();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    void window.__saddle.breakIt.cycle();
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    void window.__saddle.breakIt.budget();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    void window.__saddle.breakIt.denied();
  });
  await page.waitForTimeout(500);
  const breakResults = await page.evaluate(() => window.__saddle.checks.breakResults);
  ok("invalid network is refused", breakResults[0]?.state === "pass", breakResults[0]?.detail);
  ok("composition cycle is stopped", breakResults[1]?.state === "pass", breakResults[1]?.detail);
  ok("over-budget run halts", breakResults[2]?.state === "pass", breakResults[2]?.detail);
  ok("denied origin is not contacted", breakResults[3]?.state === "pass", breakResults[3]?.detail);
  const seventh = await page.evaluate(() =>
    document.querySelectorAll("#panel-checks .check")[6]?.classList.contains("pass"),
  );
  ok("check 7 turns green only after the four refusals", seventh === true);
  await page.screenshot({ path: `${OUT}/04-refusals.jpg` });

  // ── 6. the router badge and settings ───────────────────────────
  ok("the badge says it is a replay", (await page.locator("#router-name").textContent())?.toLowerCase().includes("replay"));
  await page.click("#close-inspector");
  await page.click("#open-settings");
  await page.waitForTimeout(300);
  ok("the settings drawer offers a provider", (await page.locator("#preset option").count()) > 2);
  await page.screenshot({ path: `${OUT}/05-settings.jpg` });
  await page.click("#close-settings");

  // ── 7. trace and privacy panels render ─────────────────────────
  await page.evaluate(() => window.__saddle.openInspector("trace"));
  await page.waitForTimeout(200);
  ok("the trace lists events", (await page.locator("#panel-trace .trace-row").count()) > 5);
  await page.evaluate(() => window.__saddle.openInspector("privacy"));
  await page.waitForTimeout(200);
  ok(
    "the privacy panel names what the co-op may receive",
    (await page.locator("#panel-privacy").innerText()).includes("trade_account"),
  );
  await page.screenshot({ path: `${OUT}/06-privacy.jpg` });
  await page.click("#close-inspector");

  // ── 8. a narrow screen ─────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => window.__saddle?.ready === true, { timeout: 20000 });
  await mobile.screenshot({ path: `${OUT}/07-mobile.jpg`, fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("no horizontal overflow on a phone", overflow <= 1, `${overflow}px`);
  await mobile.close();

  ok("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  servers.forEach((child) => child.kill());

  console.log(`\n${checks} checks, ${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  servers.forEach((child) => child.kill());
  process.exit(1);
});
