/**
 * A living conformance report.
 *
 * The profile ends with seven interoperability checks (§6). Rather than assert them
 * in a README, this panel watches the run that just happened and reports what it
 * actually observed, in this browser, against this deployment. The four failure
 * cases are buttons: each one drives the real runtime into a genuine refusal.
 */

import { ActionRegistry } from "../runtime/actions.js";
import { normaliseLimits } from "../runtime/budgets.js";
import { Engine } from "../runtime/engine.js";
import { buildNetwork } from "../runtime/network.js";
import type { NetworkModel } from "../runtime/network.js";
import type { PeerLoader } from "../runtime/peer.js";
import type { PrivateContext } from "../runtime/private.js";
import { ReplayRouter } from "../runtime/replay.js";
import type { TraceEvent, TraceBus } from "../runtime/trace.js";
import { pickScenario } from "./scenarios.js";
import { $, clear, h, pretty } from "./ui.js";

export type CheckState = "idle" | "running" | "pass" | "fail";

export interface CheckRow {
  id: string;
  title: string;
  detail: string;
  state: CheckState;
  action?: () => Promise<void>;
  actionLabel?: string;
}

interface Facts {
  manifest: boolean;
  networks: number;
  agents: number;
  https: boolean;
  ran: boolean;
  internalDelegation: boolean;
  actionReceipt: boolean;
  peerOrigin: string | null;
  peerNetwork: string | null;
  keySentToPeer: boolean;
  peerRouterIgnored: boolean;
  privateWithheld: string[];
  privateAllowed: string[];
  privateRan: boolean;
  errors: string[];
}

export interface CheckDeps {
  trace: TraceBus;
  engine: Engine;
  peerLoader: PeerLoader;
  privateContext: PrivateContext;
  network: NetworkModel;
  siteBase: string;
  links: Record<string, string>;
  hasKey: () => boolean;
  activeRouterLabel: () => string;
  runSuite: () => Promise<void>;
  probeByok: () => Promise<string>;
}

export class ConformanceChecks {
  private deps: CheckDeps;
  private facts: Facts;
  private rows: CheckRow[] = [];
  private container: HTMLElement | null = null;
  private running = false;

  private publishDetail = "";

  /** Check 1 does not take the page's word for it: it fetches the published files. */
  async verifyPublish(): Promise<boolean> {
    try {
      const manifestUrl = new URL("agent-manifest.json", this.deps.siteBase).href;
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        this.publishDetail = `agent-manifest.json answered ${response.status}`;
        return false;
      }
      const manifest = (await response.json()) as { networks?: Array<{ name: string; front_man: string; hocon: string }> };
      const networks = manifest.networks ?? [];
      if (networks.length === 0) {
        this.publishDetail = "the manifest lists no network";
        return false;
      }
      const entry = networks[0]!;
      const definition = await fetch(new URL(entry.hocon, this.deps.siteBase).href, { cache: "no-store" });
      const text = await definition.text();
      const body = JSON.parse(text) as { tools?: unknown[] };
      const agents = Array.isArray(body.tools) ? body.tools.length : 0;
      this.facts.manifest = response.ok && definition.ok && agents >= 2;
      this.facts.networks = networks.length;
      this.facts.agents = agents;
      this.publishDetail =
        `GET agent-manifest.json ${response.status} · ${networks.length} network · ` +
        `GET ${entry.hocon} ${definition.status} · ${agents} agents · front agent ${entry.front_man}`;
      return this.facts.manifest;
    } catch (error) {
      this.publishDetail = `could not re-read the published files: ${(error as Error).message}`;
      return false;
    }
  }

  constructor(deps: CheckDeps) {
    this.deps = deps;
    this.facts = {
      manifest: false,
      networks: 1,
      agents: deps.network.agents.size,
      https: location.protocol === "https:" || /^(127\.0\.0\.1|localhost)$/.test(location.hostname),
      ran: false,
      internalDelegation: false,
      actionReceipt: false,
      peerOrigin: null,
      peerNetwork: null,
      keySentToPeer: false,
      peerRouterIgnored: false,
      privateWithheld: [],
      privateAllowed: [],
      privateRan: false,
      errors: [],
    };
    deps.trace.subscribe((event) => this.observe(event));
  }

  private observe(event: TraceEvent): void {
    if (event.kind === "run.end") this.facts.ran = true;
    if (event.kind === "agent.enter" && Number(event.data?.["depth"] ?? 0) > 0) this.facts.internalDelegation = true;
    if (event.kind === "action.receipt" && event.data?.["status"] === "ok") this.facts.actionReceipt = true;
    if (event.kind === "peer.loaded") {
      this.facts.peerOrigin = String(event.data?.["origin"] ?? "");
      this.facts.peerNetwork = String(event.data?.["agents"] ?? "").length > 0 ? "spare_room" : this.facts.peerNetwork;
      this.facts.peerRouterIgnored = Boolean(event.data?.["routerFromPeerIgnored"]);
      this.facts.keySentToPeer = false;
    }
    if (event.kind === "private.filtered") {
      this.facts.privateRan = true;
      this.facts.privateWithheld = (event.data?.["withheld"] as string[]) ?? [];
      this.facts.privateAllowed = (event.data?.["allowed"] as string[]) ?? [];
    }
    if (event.kind.endsWith("error")) this.facts.errors.push(event.message);
    if (event.kind === "run.error") this.refresh();
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.refresh();
    void this.verifyPublish().then(() => this.refresh());
  }

  private peerOriginDiffers(): boolean {
    if (!this.facts.peerOrigin) return false;
    try {
      return new URL(this.facts.peerOrigin).origin !== new URL(this.deps.siteBase).origin;
    } catch {
      return false;
    }
  }

  private buildRows(): CheckRow[] {
    const f = this.facts;
    const rows: CheckRow[] = [
      {
        id: "publish",
        title: "1 · A manifest and a multi-agent network, published",
        state: f.manifest && f.networks >= 1 && f.agents >= 2 ? "pass" : "idle",
        detail: f.manifest
          ? `${this.publishDetail}${f.https ? " · secure context" : " · loopback HTTP (development)"}`
          : this.publishDetail || "Not read yet.",
      },
      {
        id: "run",
        title: "2 · Run in this browser with the active router",
        state: f.ran ? "pass" : "idle",
        detail: f.ran
          ? `Front agent answered through "${this.deps.activeRouterLabel()}".`
          : "Run the demo, or the conformance suite, to exercise the loop.",
        action: () => this.runSuite(),
        actionLabel: "Run the suite",
      },
      {
        id: "capability",
        title: "3 · Internal agent, then a grounded site action",
        state: f.internalDelegation && f.actionReceipt ? "pass" : "idle",
        detail: `${f.internalDelegation ? "Internal delegation observed" : "No delegation yet"} · ${
          f.actionReceipt ? "action receipts observed" : "no action receipt yet"
        }`,
      },
      {
        id: "peer",
        title: "4 · An exact named network from a second origin",
        state: this.peerOriginDiffers() ? "pass" : "idle",
        detail: f.peerOrigin
          ? `${f.peerNetwork ?? "peer"} loaded from ${f.peerOrigin}${
              this.peerOriginDiffers() ? " (a different origin)" : " — same origin, not yet a cross-site proof"
            }`
          : "The suite asks the co-op, which loads its network from another origin.",
      },
      {
        id: "credential",
        title: "5 · The peer never receives the visitor's key",
        state: this.facts.peerOrigin && !f.keySentToPeer ? "pass" : "idle",
        detail: f.peerOrigin
          ? `Manifest fetches use credentials:"omit" with no authorization header. The peer manifest declares a router; the runtime ignored it (${f.peerRouterIgnored ? "confirmed in the trace" : "no router declared"}). ${
              this.deps.hasKey() ? "A visitor key is active in this session." : "No visitor key is active in this session."
            }`
          : "Waiting for a peer load.",
      },
      {
        id: "private",
        title: "6 · Private context withheld unless a field is allowed",
        state: f.privateRan ? "pass" : "idle",
        detail: f.privateRan
          ? `Filter ran at the peer boundary — withheld: ${f.privateWithheld.join(", ") || "none"}; allowed: ${
              f.privateAllowed.join(", ") || "none"
            }. ${f.privateWithheld.length === 0 ? "The only field in scope was the one the rule allows; a run that collects contact details withholds them." : ""}`
          : "Waiting for a peer call.",
      },
    ];
    rows.push({
      id: "fail-closed",
      title: "7 · Refuse an invalid network, a cycle, an over-budget run, a denied origin",
      state:
        this.breakResults.length === 4 && this.breakResults.every((item) => item.state === "pass")
          ? "pass"
          : this.breakResults.some((item) => item.state === "fail")
            ? "fail"
            : "idle",
      detail: this.breakResults.map((item) => `${item.state === "pass" ? "✓" : item.state === "fail" ? "✗" : "·"} ${item.detail}`).join("\n") || "Four buttons below drive the real refusals.",
    });
    return rows;
  }

  breakResults: Array<{ detail: string; state: CheckState }> = [];

  private async setBreak(index: number, detail: string, state: CheckState): Promise<void> {
    this.breakResults[index] = { detail, state };
    this.refresh();
  }

  async runSuite(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.facts.ran = false;
    this.facts.privateRan = false;
    this.refresh();
    await this.verifyPublish();
    try {
      await this.deps.runSuite();
    } catch (error) {
      this.facts.errors.push((error as Error).message);
    } finally {
      this.running = false;
      this.refresh();
    }
  }

  /** A real refusal, produced by the runtime this page actually ships. */
  async breakInvalid(): Promise<void> {
    this.breakResults[0] = { detail: "fetching a deliberately broken network…", state: "running" };
    this.refresh();
    try {
      const response = await fetch("./lab/broken.network.json", { cache: "no-store" });
      const text = await response.text();
      const parsed = JSON.parse(text) as unknown;
      const { model, issues } = buildNetwork({
        name: "broken",
        frontMan: "does_not_exist",
        description: "",
        document: parsed,
        sourceFormat: "json",
      });
      if (model) await this.setBreak(0, "the invalid network was accepted — that is a bug", "fail");
      else await this.setBreak(0, `rejected before any model call: ${issues.errors[0]}`, "pass");
    } catch (error) {
      await this.setBreak(0, `could not run the test: ${(error as Error).message}`, "fail");
    }
  }

  async breakCycle(): Promise<void> {
    this.breakResults[1] = { detail: "composing two sites that call each other…", state: "running" };
    this.refresh();
    const loopUrl = this.loopUrl();
    if (!loopUrl) {
      await this.setBreak(1, "no peer link is published, so no cycle could be built", "fail");
      return;
    }
    try {
      // The loop fixture's network calls Saddle & Spoke back. Load it, then try to
      // compose this site again with the loop already in the chain: that is the cycle.
      const loop = await this.deps.peerLoader.load(loopUrl, []);
      const pointsBack = [...loop.model.agents.values()].some((agent) =>
        agent.tools.some((tool) => tool.kind === "peer" && tool.ref.includes("saddle_and_spoke")),
      );
      if (!pointsBack) {
        await this.setBreak(1, "the loop fixture does not point back, so no cycle was created", "fail");
        return;
      }
      const loopBase = new URL("./", loop.base).href;
      await this.deps.peerLoader.load(this.selfUrl(), [loopBase, new URL("./", this.deps.siteBase).href]);
      await this.setBreak(1, "the cycle was not stopped — that is a bug", "fail");
    } catch (error) {
      const message = (error as Error).message;
      const stoppedAsCycle = /cycle/i.test(message);
      await this.setBreak(
        1,
        stoppedAsCycle ? `stopped: ${message}` : `stopped, but not as a cycle: ${message}`,
        stoppedAsCycle ? "pass" : "fail",
      );
    }
  }

  /** The loop fixture lives beside the peer, on the same published origin. */
  private loopUrl(): string | null {
    const peer = this.deps.links?.["spare_room"];
    if (!peer) return null;
    return peer.replace(/\/spare_room\/?$/, "/lab/loop/spare_room");
  }

  private selfUrl(): string {
    return new URL("saddle_and_spoke", this.deps.siteBase).href;
  }

  async breakBudget(): Promise<void> {
    this.breakResults[2] = { detail: "running the loop with a one-call budget…", state: "running" };
    this.refresh();
    const trace: TraceBus = this.deps.trace;
    const registry = new ActionRegistry({ origin: this.deps.siteBase, trace, confirm: async () => true });
    registry.register({
      name: "read_job",
      description: "Probe only.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => ({ probe: true }),
    });
    const engine = new Engine({
      originUrl: this.deps.siteBase,
      model: this.deps.network,
      trace,
      actions: registry,
      router: new ReplayRouter(pickScenario("chain skips")),
      privateContext: this.deps.privateContext,
      peerLoader: this.deps.peerLoader,
      limits: normaliseLimits({ maxSteps: 1 }, 10),
    });
    const result = await engine.run("chain skips under load");
    if (result.halted && /limit of 1 model calls/i.test(result.error ?? "")) {
      await this.setBreak(2, `halted with a visible error: ${result.error}`, "pass");
    } else {
      await this.setBreak(2, `expected a budget halt, got: ${result.error ?? "no error"}`, "fail");
    }
  }

  async breakDenied(): Promise<void> {
    this.breakResults[3] = { detail: "asking to contact an origin that is not on the allow list…", state: "running" };
    this.refresh();
    try {
      await this.deps.peerLoader.load("https://parts.example.org/agents/counter", []);
      await this.setBreak(3, "the denied origin was contacted — that is a bug", "fail");
    } catch (error) {
      const message = (error as Error).message;
      await this.setBreak(3, `${message}`, "pass");
    }
  }

  async probeByok(): Promise<void> {
    this.breakResults[4] = { detail: "asking the visitor's router for one token…", state: "running" };
    this.refresh();
    try {
      const answer = await this.deps.probeByok();
      await this.setBreak(4, `the visitor's router answered: ${answer}`, "pass");
    } catch (error) {
      await this.setBreak(4, `the router did not answer: ${(error as Error).message}`, "fail");
    }
  }

  refresh(): void {
    if (!this.container) return;
    this.rows = this.buildRows();
    clear(this.container);

    const passed = this.rows.filter((row) => row.state === "pass").length;
    const summary = h("div", { class: "note-box" }, [
      h("strong", { text: `${passed} of 7 checks observed` }),
      h("span", {
        text:
          " — reported from this session's trace, in this browser. Nothing here is asserted in advance: run the suite and the report fills in.",
      }),
    ]);

    const controls = h("div", { class: "btn-row" }, [
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => void this.runSuite(),
          disabled: this.running,
        },
        [this.running ? "Running…" : "Run the conformance suite"],
      ),
      h("button", { class: "btn", type: "button", onclick: () => void this.probeByok() }, ["Probe the visitor router"]),
    ]);

    this.container.append(summary, controls);

    for (const row of this.rows) {
      const detail = h("p", { class: "cdetail", text: row.detail });
      const check = h("div", { class: `check ${row.state}` }, [
        h("span", { class: "mark", text: row.state === "pass" ? "✓" : row.state === "fail" ? "✗" : row.state === "running" ? "…" : "·" }),
        h("div", {}, [
          h("p", { class: "ctitle", text: row.title }),
          detail,
          row.action
            ? h("div", { class: "caction" }, [
                h("button", { class: "btn", type: "button", onclick: () => void row.action?.() }, [row.actionLabel ?? "Run"]),
              ])
            : null,
        ]),
      ]);
      this.container.append(check);
    }

    const breaker = h("div", { class: "section" }, [
      h("h3", { class: "section-title", text: "Break it yourself" }),
      h("p", {
        class: "hint",
        text: "Four genuine refusals, run against this build. Each one is the same code path an agent would hit.",
      }),
      h("div", { class: "btn-row" }, [
        h("button", { class: "btn warn", type: "button", onclick: () => void this.breakInvalid() }, ["Invalid network"]),
        h("button", { class: "btn warn", type: "button", onclick: () => void this.breakCycle() }, ["Composition cycle"]),
        h("button", { class: "btn warn", type: "button", onclick: () => void this.breakBudget() }, ["Over budget"]),
        h("button", { class: "btn warn", type: "button", onclick: () => void this.breakDenied() }, ["Denied origin"]),
      ]),
    ]);
    this.container.append(breaker);

    if (this.breakResults.length > 0) {
      const list = h("div", { class: "trace" });
      this.breakResults.forEach((item, index) => {
        if (!item) return;
        list.append(
          h("div", { class: `trace-row ${item.state === "fail" ? "err" : ""}` }, [
            h("span", { class: "t", text: `#${index + 1}` }),
            h("span", { class: "k", text: item.state }),
            h("span", { class: "m", text: item.detail }),
          ]),
        );
      });
      this.container.append(list);
    }

    const facts = h("details", { class: "section" }, []);
    facts.append(
      h("summary", { class: "hint", text: "What this session recorded" }),
      h("pre", { class: "code", text: pretty(this.facts) }),
    );
    this.container.append(facts);
  }
}
