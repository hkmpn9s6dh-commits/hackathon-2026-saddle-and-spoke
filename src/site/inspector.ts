/**
 * The Inspector: what the runtime is doing, said plainly.
 *
 * The profile asks an implementation to expose the selected router, the contacted
 * origins, agent and tool calls, consent decisions, errors and action receipts.
 * This is that view — the same trace the checks read.
 */

import type { ActionRegistry } from "../runtime/actions.js";
import type { NetworkModel } from "../runtime/network.js";
import type { SiteManifest } from "../runtime/peer.js";
import type { PrivateContext } from "../runtime/private.js";
import { redact, type TraceEvent, type TraceBus } from "../runtime/trace.js";
import type { ConformanceChecks } from "./checks.js";
import { $, clear, h, pretty } from "./ui.js";

export interface InspectorDeps {
  trace: TraceBus;
  registry: ActionRegistry;
  privateContext: PrivateContext;
  network: NetworkModel;
  manifest: SiteManifest;
  manifestUrl: string;
  siteBase: string;
  checks: ConformanceChecks;
  peerConsentLog: Array<{ origin: string; approved: boolean; at: number }>;
}

export class Inspector {
  private deps: InspectorDeps;
  private drawer = $<HTMLElement>("#inspector");
  private body = $<HTMLElement>("#inspector-body");
  private traceRows = h("div", { class: "trace" });
  private open = false;
  private rows = 0;

  constructor(deps: InspectorDeps) {
    this.deps = deps;
    deps.checks.mount($("#panel-checks"));
    this.buildTrace();
    this.buildNetwork();
    this.buildPrivacy();
    this.buildReceipts();

    for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
      tab.addEventListener("click", () => this.select(tab.dataset["panel"] ?? "checks"));
    }
    $("#open-inspector").addEventListener("click", () => this.toggle());
    $("#close-inspector").addEventListener("click", () => this.toggle(false));
  }

  construct(): void {
    this.buildTrace();
  }

  private select(panel: string): void {
    for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
      tab.setAttribute("aria-selected", String(tab.dataset["panel"] === panel));
    }
    for (const section of document.querySelectorAll<HTMLElement>(".panel")) {
      section.classList.toggle("on", section.dataset["panel"] === panel);
    }
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.drawer.classList.toggle("on", this.open);
    this.drawer.setAttribute("aria-hidden", String(!this.open));
    $("#open-inspector").setAttribute("aria-pressed", String(this.open));
    document.body.classList.toggle("drawer-open", this.open);
    if (this.open) $("#scrim").classList.add("on");
    else if (!$("#settings").classList.contains("on")) $("#scrim").classList.remove("on");
  }

  private buildTrace(): void {
    const panel = $("#panel-trace");
    clear(panel);
    clear(this.traceRows);
    this.rows = 0;
    const filter = h("select", { class: "btn", "aria-label": "Filter the trace" });
    for (const [value, label] of [
      ["all", "all events"],
      ["agent", "agents"],
      ["tool", "tools"],
      ["peer", "peers"],
      ["action", "actions"],
      ["router", "router"],
    ] as const) {
      filter.append(h("option", { value, text: label }));
    }
    panel.append(
      h("div", { class: "btn-row" }, [
        filter,
        h("button", { class: "btn", type: "button", onclick: () => this.deps.trace.clear() }, ["Clear"]),
        h("button", { class: "btn", type: "button", onclick: () => this.downloadTrace() }, ["Download"]),
      ]),
      this.traceRows,
    );

    const kindMatches = (kind: string, wanted: string): boolean =>
      wanted === "all" ||
      (wanted === "agent" && kind.startsWith("agent.")) ||
      (wanted === "tool" && kind.startsWith("tool.")) ||
      (wanted === "peer" && kind.startsWith("peer.")) ||
      (wanted === "action" && kind.startsWith("action.")) ||
      (wanted === "router" && kind.startsWith("router."));

    const render = (events: readonly TraceEvent[]): void => {
      clear(this.traceRows);
      this.rows = 0;
      const wanted = filter.value || "all";
      for (const event of events) {
        if (!kindMatches(event.kind, wanted)) continue;
        this.appendRow(event, false);
      }
    };

    this.deps.trace.subscribe((event) => {
      if (!kindMatches(event.kind, filter.value || "all")) return;
      this.appendRow(event, true);
    });
    filter.addEventListener("change", () => render(this.deps.trace.history()));
    render(this.deps.trace.history());
  }

  private appendRow(event: TraceEvent, live: boolean): void {
    const row = h(
      "div",
      { class: `trace-row ${event.kind.endsWith("error") ? "err" : ""}` },
      [
        h("span", { class: "t", text: new Date(event.at).toLocaleTimeString("en-GB", { hour12: false }) }),
        h("span", { class: "k", text: event.kind }),
        h("span", { class: "m", text: `${event.actor}: ${event.message}` }),
      ],
    );
    if (live) {
      this.traceRows.append(row);
      if (++this.rows > 400 && this.traceRows.firstChild) this.traceRows.firstChild.remove();
      const nearBottom =
        this.traceRows.scrollHeight - this.traceRows.scrollTop - this.traceRows.clientHeight < 120;
      if (nearBottom) this.traceRows.scrollTop = this.traceRows.scrollHeight;
    } else {
      this.traceRows.append(row);
    }
  }

  private downloadTrace(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      site: this.deps.siteBase,
      network: this.deps.network.name,
      router: this.deps.network.model || null,
      events: this.deps.trace.history().map((event) => redact(event)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "saddle-and-spoke-trace.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  private buildNetwork(): void {
    const panel = $("#panel-network");
    clear(panel);
    const { network, manifest, siteBase } = this.deps;

    const agents = h("div", {});
    for (const [name, spec] of network.agents) {
      const tools = spec.tools.map((tool) => {
        if (tool.kind === "peer") return `peer:${tool.name}`;
        if (tool.kind === "mcp") return `mcp:${tool.url}`;
        if (tool.kind === "action") return `action:${tool.name}`;
        return tool.name;
      });
      agents.append(
        h("div", { class: "check" }, [
          h("span", { class: "mark", text: name === network.frontMan ? "★" : "·" }),
          h("div", {}, [
            h("p", { class: "ctitle", text: `${name}${name === network.frontMan ? " (front agent)" : ""}` }),
            h("p", { class: "cdetail", text: spec.description }),
            h("p", { class: "cdetail", text: `tools: ${tools.length ? tools.join(", ") : "none"}` }),
          ]),
        ]),
      );
    }

    panel.append(
      h("dl", { class: "kv" }, [
        h("dt", { text: "Network" }),
        h("dd", { text: network.name }),
        h("dt", { text: "Definition" }),
        h("dd", {}, [
          h("a", { href: `${siteBase}${network.name}.network.json`, target: "_blank", rel: "noreferrer" }, [
            `${network.name}.network.json`,
          ]),
        ]),
        h("dt", { text: "Source format" }),
        h("dd", { text: network.sourceFormat.toUpperCase() }),
        h("dt", { text: "Model hint" }),
        h("dd", { text: network.model || "none declared" }),
        h("dt", { text: "Max seconds" }),
        h("dd", { text: String(network.maxExecutionSeconds) }),
        h("dt", { text: "Front agent" }),
        h("dd", { text: network.frontMan }),
      ]),
      h("h3", { class: "section-title", text: "Agents" }),
      agents,
      h("h3", { class: "section-title", text: "Published manifest" }),
      h("pre", { class: "code", text: pretty(manifest) }),
    );
  }

  private buildPrivacy(): void {
    const panel = $("#panel-privacy");
    clear(panel);
    const { privateContext } = this.deps;
    const masked = privateContext.masked();
    const rows = h("dl", { class: "kv" });
    const names = privateContext.names();
    if (names.length === 0) {
      panel.append(
        h("p", { class: "hint", text: "No private field is held in this session. Fill in the contact form to create some." }),
      );
    } else {
      for (const name of names) {
        rows.append(h("dt", { text: name }), h("dd", { text: String(masked[name] ?? "") }));
      }
      panel.append(rows);
    }
    panel.append(
      h("div", { class: "note-box", text:
        "Private context never enters a prompt, a URL or a peer request. A field leaves this site only if a rule names the destination network and the field." }),
      h("h3", { class: "section-title", text: "Rules" }),
      h("pre", {
        class: "code",
        text: pretty({
          "shop": privateContext.view("shop").allowed,
          "spare_room": {
            allowed: Object.keys(privateContext.view("spare_room").allowed),
            withheld: privateContext.view("spare_room").withheld,
          },
        }),
      }),
      h("h3", { class: "section-title", text: "Consent decisions" }),
      this.consentList(),
    );
  }

  private consentList(): HTMLElement {
    const list = h("div", { class: "trace" });
    if (this.deps.peerConsentLog.length === 0) {
      list.append(h("p", { class: "hint", text: "No third-party origin has been contacted in this session." }));
      return list;
    }
    for (const decision of this.deps.peerConsentLog) {
      list.append(
        h("div", { class: "trace-row" }, [
          h("span", { class: "t", text: new Date(decision.at).toLocaleTimeString("en-GB", { hour12: false }) }),
          h("span", { class: "k", text: decision.approved ? "approved" : "declined" }),
          h("span", { class: "m", text: decision.origin }),
        ]),
      );
    }
    return list;
  }

  private buildReceipts(): void {
    const panel = $("#panel-receipts");
    clear(panel);
    const receipts = this.deps.registry.receipts;
    if (receipts.length === 0) {
      panel.append(h("p", { class: "hint", text: "No action has run yet." }));
      return;
    }
    const table = h("div", { class: "trace" });
    for (const receipt of [...receipts].reverse()) {
      table.append(
        h("div", { class: `trace-row ${receipt.status === "ok" ? "" : "err"}` }, [
          h("span", { class: "t", text: new Date(receipt.at).toLocaleTimeString("en-GB", { hour12: false }) }),
          h("span", { class: "k", text: receipt.status }),
          h("span", { class: "m", text: `${receipt.action} · ${receipt.requestId} · ${receipt.effect}` }),
        ]),
      );
    }
    panel.append(
      h("p", { class: "hint", text:
        "A receipt binds the action, the origin, the arguments hash and the request id to the proposal the visitor approved." }),
      table,
    );
  }

  /** Called when a panel needs to reflect new state (receipts, privacy). */
  refreshSecondary(): void {
    this.buildPrivacy();
    this.buildReceipts();
  }
}
