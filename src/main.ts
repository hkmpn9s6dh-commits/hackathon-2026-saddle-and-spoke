/**
 * Boot.
 *
 * The page reads its own published artifacts from its own origin, validates them
 * before anything else happens, mounts the drawing, registers the site actions, and
 * then hands the visitor a composer. If any of that fails, the page says why and
 * refuses to run — a broken network is never half-run.
 */

import "./styles.css";

import { ActionRegistry } from "./runtime/actions.js";
import { Engine } from "./runtime/engine.js";
import { parseNetworkSource } from "./runtime/hocon.js";
import { activeRouter, OpenAICompatibleRouter } from "./runtime/llm.js";
import { buildNetwork, type NetworkModel } from "./runtime/network.js";
import { PeerLoader, type SiteManifest } from "./runtime/peer.js";
import { PrivateContext } from "./runtime/private.js";
import { ReplayRouter } from "./runtime/replay.js";
import { TraceBus, type TraceEvent } from "./runtime/trace.js";

import { annotate, bikeSvg, calloutLegend, focusPart } from "./site/bike.js";
import { ConformanceChecks } from "./site/checks.js";
import { askApproval, askConsent, askReview, editsTrusted, resetTrust } from "./site/dialogs.js";
import { SHOP } from "./site/data.js";
import { Inspector } from "./site/inspector.js";
import { JobStore, registerJobActions } from "./site/job.js";
import { pickScenario, SCENARIOS, scenarioById, SUITE_SCENARIO } from "./site/scenarios.js";
import { SettingsPanel } from "./site/settings.js";
import { renderBench, renderSheet } from "./site/sheet.js";
import { $, clockDate, clear, h } from "./site/ui.js";

const base = new URL("./", location.href);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return await response.text();
}

function fatal(title: string, detail: string): void {
  const boot = $("#boot");
  boot.classList.add("gone");
  const main = document.querySelector("main");
  if (main) main.remove();
  document.body.append(
    h("div", { class: "fatal" }, [
      h("span", { class: "label", text: "The page stopped" }),
      h("h1", { text: title }),
      h("p", { text: "A published network that does not validate is not run, not partly run, and not repaired in the browser." }),
      h("pre", { text: detail }),
    ]),
  );
}

async function main(): Promise<void> {
  const manifestUrl = new URL("agent-manifest.json", base).href;
  const manifest = await fetchJson<SiteManifest>(manifestUrl);
  const entry = manifest.networks?.[0];
  if (!entry) throw new Error("agent-manifest.json lists no network.");
  const definitionUrl = new URL(entry.hocon, base).href;
  const definitionText = await fetchText(definitionUrl);
  const parsed = parseNetworkSource(definitionText);

  let links: Record<string, string> = {};
  try {
    const linkDoc = await fetchJson<{ networks?: Record<string, Record<string, string>> }>(
      new URL("links.json", base).href,
    );
    links = linkDoc.networks?.[entry.name] ?? {};
  } catch {
    links = {};
  }

  const trace = new TraceBus();
  const store = new JobStore();
  let inspector: Inspector;
  const privateContext = new PrivateContext(
    { trade_account: "SS-1042" },
    [
      { destination: "shop", fields: ["contact", "bike_serial", "trade_account"] },
      { destination: "spare_room", fields: ["trade_account"] },
    ],
  );

  // ── the drawing ───────────────────────────────────────────────────
  $("#bike-holder").innerHTML = bikeSvg();
  const svg = $<SVGSVGElement>("#bike-holder svg");
  let annotations: Array<{ partId: string; note?: string }> = [];
  let dimTimer: number | null = null;

  const highlight = (partId: string | null, note = ""): void => {
    if (dimTimer !== null) window.clearTimeout(dimTimer);
    if (!partId) {
      focusPart(svg, null);
      annotations = [];
      annotate(svg, []);
      $("#callouts").innerHTML = "";
      return;
    }
    focusPart(svg, partId);
    // The drawing steps back while the agent points, then returns to full weight and
    // keeps the callouts. A permanently dimmed drawing would read as broken.
    dimTimer = window.setTimeout(() => focusPart(svg, null), 7000);
    const existing = annotations.filter((item) => item.partId !== partId);
    annotations = [{ partId, note }, ...existing].slice(0, 3);
    annotate(svg, annotations);
    $("#callouts").innerHTML = calloutLegend(annotations);
  };

  const registry = new ActionRegistry({
    origin: base.href,
    trace,
    confirm: async (proposal) => {
      const ok = await askApproval(proposal, {
        collectContact: proposal.action === "book_dropoff",
        onSubmit: (contact) => {
          privateContext.set({
            contact: `${contact.name} · ${contact.phone}`,
            bike_serial: contact.serial || "not given",
          });
          inspector?.refreshSecondary();
        },
      });
      window.setTimeout(() => inspector?.refreshSecondary(), 40);
      return ok;
    },
  });

  // The actions are registered before the network is validated, so an agent may name
  // a site action as one of its tools and the validator can resolve it.
  registerJobActions(registry, {
    store,
    privateContext,
    onHighlight: (partId, note) => highlight(partId, note),
    coOpDown: () => (window as unknown as { __coOpDown?: boolean }).__coOpDown === true,
  });

  const { model, issues } = buildNetwork({
    name: entry.name,
    frontMan: entry.front_man,
    description: entry.description ?? "",
    document: parsed.data,
    sourceFormat: parsed.format,
    linkedNames: Object.keys(links),
    actionNames: registry.list().map((action) => action.name),
  });
  if (!model) {
    $("#boot").classList.add("gone");
    fatal(`The published network does not validate`, issues.errors.join("\n"));
    return;
  }

  const consentLog: Array<{ origin: string; approved: boolean; at: number }> = [];
  const peerLoader = new PeerLoader({
    trace,
    policy: (manifest.peer_policy as { mode: "closed" | "allowlist" | "open" }) ?? { mode: "allowlist" },
    purpose: "ask the parts co-op about a part this shop does not stock",
    note: () => {
      const view = privateContext.view("spare_room");
      return `Private fields held here: ${privateContext.names().join(", ") || "none"}. Withheld from the co-op: ${
        view.withheld.join(", ") || "none"
      }. Allowed: ${Object.keys(view.allowed).join(", ") || "none"}.`;
    },
    consent: async (request) => {
      const approved = await askConsent(request);
      consentLog.push({ origin: request.origin, approved, at: Date.now() });
      inspector?.refreshSecondary();
      return approved;
    },
  });

  let router = activeRouter() ?? new ReplayRouter(pickScenario(""));
  const engine = new Engine({
    originUrl: base.href,
    model,
    links,
    trace,
    actions: registry,
    router,
    privateContext,
    peerLoader,
    limits: { maxSteps: 18, maxDepth: 4, maxPeerCalls: 2, maxSeconds: 90, maxConcurrent: 2 },
    historyLimit: 26,
    mcpConsent: async () => false,
    review: async (proposals) => {
      const irreversible = proposals.some((proposal) => proposal.effect === "irreversible");
      if (editsTrusted() && !irreversible) {
        trace.emit("action.receipt", "runtime", `${proposals.length} edit(s) approved by the standing consent for this job`, {
          actions: proposals.map((proposal) => proposal.action),
        });
        return proposals.map(() => true);
      }
      const answers = await askReview(proposals, {
        collectContact: proposals.some((proposal) => proposal.action === "book_dropoff"),
        onSubmit: (contact) => {
          privateContext.set({
            contact: `${contact.name} · ${contact.phone}`,
            bike_serial: contact.serial || "not given",
          });
          inspector?.refreshSecondary();
        },
      });
      window.setTimeout(() => inspector?.refreshSecondary(), 40);
      return answers;
    },
  });

  const activeRouterLabel = (): string => engine.routerInfo.label;

  const checks = new ConformanceChecks({
    trace,
    engine,
    peerLoader,
    privateContext,
    network: model,
    siteBase: base.href,
    links,
    hasKey: () => Boolean(activeRouter()),
    activeRouterLabel,
    runSuite: async () => {
      const previous = router;
      router = new ReplayRouter(SUITE_SCENARIO);
      engine.setRouter(router);
      try {
        await run(SUITE_SCENARIO.complaint, { reset: true });
      } finally {
        router = previous;
        engine.setRouter(router);
        updateBadge();
      }
    },
    probeByok: async () => {
      const visitor = activeRouter();
      if (!visitor) throw new Error("no visitor router is configured.");
      let text = "";
      for await (const delta of visitor.stream({
        agent: "probe",
        messages: [
          { role: "system", content: "Answer with one word." },
          { role: "user", content: "Say: ready." },
        ],
        tools: [],
        model: visitor.model,
        temperature: 0,
      })) {
        if (delta.type === "text") text += delta.text;
      }
      return `${text.trim().slice(0, 40) || "(empty answer)"} via ${visitor.model}`;
    },
  });

  inspector = new Inspector({
    trace,
    registry,
    privateContext,
    network: model,
    manifest,
    manifestUrl,
    siteBase: base.href,
    checks,
    peerConsentLog: consentLog,
  });

  const settings = new SettingsPanel({
    onChange: () => {
      router = activeRouter() ?? new ReplayRouter(pickScenario(""));
      engine.setRouter(router);
      updateBadge();
    },
    currentLabel: activeRouterLabel,
  });

  // The two drawers occupy the same edge, so opening one closes the other.
  $("#open-inspector").addEventListener("click", () => settings.toggle(false));
  $("#open-settings").addEventListener("click", () => inspector.toggle(false));

  function updateBadge(): void {
    const label = engine.routerInfo.label;
    $("#router-name").textContent = label;
    $("#router-dot").classList.toggle("live", engine.routerInfo.needsKey);
    $("#notes-state").textContent =
      router.id === "replay" ? "replay · no key needed" : `${label} · ${engine.routerInfo.model}`;
  }

  // ── notes ─────────────────────────────────────────────────────────
  const notes = $("#notes");
  let currentNote: HTMLElement | null = null;
  let currentAgent = "";

  const liveNote = (): HTMLElement | null => currentNote;

  const addNote = (who: string, text: string, kind = ""): HTMLElement => {
      const body = h("span", { class: "txt", text });
    const note = h("div", { class: `note ${kind}` }, [h("span", { class: "who", text: who }), body]);
    notes.append(note);
    notes.scrollTop = notes.scrollHeight;
    return note;
  };

  trace.subscribe((event: TraceEvent) => {
    if (event.kind === "text.delta") {
      const agent = String(event.data?.["agent"] ?? "");
      const chunk = String(event.data?.["text"] ?? "");
      if (agent !== model.frontMan) return;
      if (!currentNote || currentAgent !== agent) {
        currentNote = addNote("Front desk", "");
        currentAgent = agent;
      }
      const target = currentNote.querySelector(".txt");
      if (target) target.textContent = (target.textContent ?? "") + chunk;
      notes.scrollTop = notes.scrollHeight;
    }
    if (event.kind === "agent.enter" && Number(event.data?.["depth"] ?? 0) > 0) {
      const name = event.actor.includes(":") ? event.actor.split(":")[1] : event.actor;
      $("#notes-state").textContent = `${name} is on it…`;
    }
    if (event.kind === "agent.leave" && Number(event.data?.["depth"] ?? 0) > 0) {
      currentNote = null;
      currentAgent = "";
    }
    if (event.kind === "peer.consent") {
      $("#notes-state").textContent = `${event.message}`;
    }
    if (event.kind === "run.error") {
      currentNote = null;
      addNote("Runtime", event.message, "system");
    }
  });

  // ── running ───────────────────────────────────────────────────────
  let busy = false;

  async function run(input: string, options: { reset?: boolean } = {}): Promise<void> {
    if (busy) return;
    busy = true;
    const send = $<HTMLButtonElement>("#send");
    send.disabled = true;
    $("#notes-state").textContent = "on the bench…";
    currentNote = null;
    currentAgent = "";

    const already = store.state.complaint;
    if (options.reset || (already && already !== input)) {
      store.reset();
      highlight(null);
      resetTrust();
    }
    store.setComplaint(input);
    addNote("You", input);

    engine.setRouter(router);
    const result = await engine.run(input);
    if (result.error) {
      addNote("Runtime", result.error, "system");
      $("#notes-state").textContent = "stopped";
    } else if (result.text) {
      const text = result.text.replace(/\{job\}/g, store.state.number);
      const note = liveNote();
      const target = note?.querySelector(".txt");
      if (target) target.textContent = text;
      else addNote("Front desk", text);
    }
    inspector.refreshSecondary();
    checks.refresh();
    send.disabled = false;
    busy = false;
    $("#notes-state").textContent = result.halted ? "stopped" : `${router.id === "replay" ? "replay" : "live"} · ${result.steps} steps`;
    window.__saddle.lastRun = result;
  }

  // ── chrome ────────────────────────────────────────────────────────
  $("#job-number").textContent = store.state.number;
  $("#sheet-date").textContent = clockDate();
  $("#mark-sub").textContent = `${SHOP.street}, ${SHOP.town} · Thu 16–20, Sat 09–13`;

  store.subscribe((state) => {
    renderSheet(state);
    renderBench(state);
  });

  const chips = $("#chips");
  for (const scenario of SCENARIOS) {
    const chip = h("button", { class: "chip", type: "button" }, [scenario.chip]);
    chip.addEventListener("click", () => {
      const input = $<HTMLInputElement>("#input");
      input.value = scenario.complaint;
      if (router.id === "replay") {
        router = new ReplayRouter(scenario);
        engine.setRouter(router);
      }
      input.focus();
    });
    chips.append(chip);
  }

  $("#composer").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("#input");
    const text = input.value.trim();
    if (text === "") return;
    input.value = "";
    if (router.id === "replay") {
      router = new ReplayRouter(scenarioById(pickScenario(text).id) ?? pickScenario(""));
      engine.setRouter(router);
    }
    void run(text);
  });

  $("#scrim").addEventListener("click", () => {
    inspector.toggle(false);
    settings.toggle(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "i" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      inspector.toggle();
    }
    if (event.key === "Escape") {
      inspector.toggle(false);
      settings.toggle(false);
    }
  });

  // The suite needs a deterministic router so its report does not depend on a model.
  const suiteRouter = new ReplayRouter(SUITE_SCENARIO);

  updateBadge();
  checks.mount($("#panel-checks"));

  // ── test hooks: the e2e driver reads these; nothing else does ──────
  window.__saddle = {
    ready: true,
    manifest,
    network: model,
    store,
    trace,
    registry,
    engine,
    checks,
    privateContext,
    links,
    run,
    highlight,
    setRouter: (next: "replay" | "live") => {
      router = next === "live" ? activeRouter() ?? new ReplayRouter(SUITE_SCENARIO) : suiteRouter;
      engine.setRouter(router);
      updateBadge();
    },
    suite: () => checks.runSuite(),
    breakIt: {
      invalid: () => checks.breakInvalid(),
      cycle: () => checks.breakCycle(),
      budget: () => checks.breakBudget(),
      denied: () => checks.breakDenied(),
    },
    openInspector: (panel = "checks") => {
      inspector.toggle(true);
      document.querySelector<HTMLButtonElement>(`.tab[data-panel="${panel}"]`)?.click();
    },
    lastRun: null as unknown,
  };

  $("#boot").classList.add("gone");
  setTimeout(() => $("#boot").remove(), 500);
  $("#notes-state").textContent = "replay · no key needed";
}

declare global {
  interface Window {
    __saddle: {
      ready: boolean;
      manifest: SiteManifest;
      network: NetworkModel;
      store: JobStore;
      trace: TraceBus;
      registry: ActionRegistry;
      engine: Engine;
      checks: ConformanceChecks;
      privateContext: PrivateContext;
      links: Record<string, string>;
      run: (input: string, options?: { reset?: boolean }) => Promise<void>;
      highlight: (partId: string | null, note?: string) => void;
      setRouter: (next: "replay" | "live") => void;
      suite: () => Promise<void>;
      breakIt: {
        invalid: () => Promise<void>;
        cycle: () => Promise<void>;
        budget: () => Promise<void>;
        denied: () => Promise<void>;
      };
      openInspector: (panel?: string) => void;
      lastRun: unknown;
    };
    __coOpDown?: boolean;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fatal("The page could not read its own published network", message);
  console.error(error);
});
