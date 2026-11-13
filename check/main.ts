/**
 * The community tool.
 *
 * A static page that reads another site's published artifacts and reports which of the
 * seven interoperability checks from MVP Profile 0.2 it can observe from the outside.
 * Anyone entering the challenge can point it at their own deployment before submitting.
 */

import "../src/styles.css";
import "./checker.css";

import { parseNetworkSource } from "../src/runtime/hocon.js";
import { buildNetwork, peerNetworkName, peerSiteBase } from "../src/runtime/network.js";

interface Result {
  id: string;
  title: string;
  state: "pass" | "fail" | "skip";
  detail: string;
  ms: number;
}

const form = document.querySelector("#form") as HTMLFormElement;
const input = document.querySelector("#url") as HTMLInputElement;
const report = document.querySelector("#report") as HTMLElement;
const results = document.querySelector("#results") as HTMLOListElement;
const summary = document.querySelector("#summary") as HTMLDivElement;
const json = document.querySelector("#json") as HTMLPreElement;

const here = new URL("../", location.href).href;
input.value = `${here}saddle_and_spoke`;

const out: Result[] = [];

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: string | null }> {
  const started = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - started), error: null };
  } catch (error) {
    return { value: null, ms: Math.round(performance.now() - started), error: (error as Error).message };
  }
}

function record(id: string, title: string, state: Result["state"], detail: string, ms = 0): void {
  out.push({ id, title, state, detail, ms });
  results.append(render(out[out.length - 1]!));
}

function render(result: Result): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `result ${result.state}`;
  li.innerHTML = `
    <span class="mark">${result.state === "pass" ? "✓" : result.state === "fail" ? "✗" : "–"}</span>
    <div>
      <p class="t">${escapeHtml(result.title)}</p>
      <p class="d">${escapeHtml(result.detail)}</p>
    </div>
    <span class="ms">${result.ms} ms</span>`;
  return li;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function check(raw: string): Promise<void> {
  out.length = 0;
  results.innerHTML = "";
  report.hidden = false;
  summary.textContent = "Checking…";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    summary.textContent = "That is not a URL.";
    return;
  }
  if (!/^https?:$/.test(url.protocol)) {
    summary.textContent = "The URL must be http or https.";
    return;
  }

  const hasName = url.pathname.split("/").filter(Boolean).length >= 1 && !url.pathname.endsWith("/");
  const base = hasName ? peerSiteBase(url.href) : url.href;
  const wanted = hasName ? peerNetworkName(url.href) : null;

  const manifest = await timed(async () => {
    const response = await fetch(new URL("agent-manifest.json", base!).href, { credentials: "omit" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return { text: await response.text(), url: new URL("agent-manifest.json", base!).href };
  });
  record(
    "manifest",
    "agent-manifest.json is reachable from another origin",
    manifest.error ? "fail" : "pass",
    manifest.error ? `${manifest.error} — a cross-origin fetch needs CORS on the manifest` : `${manifest.value!.url}`,
    manifest.ms,
  );
  if (manifest.error) return finish();

  let parsedManifest: {
    networks?: Array<{ name?: string; front_man?: string; hocon?: string; description?: string }>;
    actions?: { agentTools?: string[] };
  };
  try {
    parsedManifest = JSON.parse(manifest.value!.text);
  } catch {
    record("shape", "The manifest is JSON", "fail", "the body did not parse as JSON");
    return finish();
  }
  const networks = Array.isArray(parsedManifest.networks) ? parsedManifest.networks : [];
  record(
    "shape",
    "The manifest lists at least one network with a name, a front agent and a definition",
    networks.length > 0 && networks.every((network) => network.name && network.front_man && network.hocon) ? "pass" : "fail",
    networks.length === 0 ? "networks[] is missing or empty" : networks.map((network) => `${network.name} → ${network.front_man}`).join(", "),
  );

  const entry = wanted ? networks.find((network) => network.name === wanted) : networks[0];
  record(
    "match",
    wanted ? `A network is published under the exact name "${wanted}"` : "The first published network is used",
    entry ? "pass" : "fail",
    entry ? entry.name ?? "" : `published: ${networks.map((network) => network.name).join(", ") || "none"}`,
  );
  if (!entry?.hocon) return finish();

  const definition = await timed(async () => {
    const response = await fetch(new URL(entry.hocon!, base!).href, { credentials: "omit" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return { text: await response.text(), url: new URL(entry.hocon!, base!).href };
  });
  record(
    "definition",
    "The network definition is reachable and CORS-enabled",
    definition.error ? "fail" : "pass",
    definition.error ?? definition.value!.url,
    definition.ms,
  );
  if (definition.error) return finish();

  let format: "json" | "hocon" = "json";
  const parsed = await timed(async () => {
    const result = parseNetworkSource(definition.value!.text);
    format = result.format;
    return result.data;
  });
  record(
    "parse",
    "The definition parses (JSON or HOCON)",
    parsed.error ? "fail" : "pass",
    parsed.error ?? `read as ${format.toUpperCase()}`,
    parsed.ms,
  );
  if (parsed.error) return finish();

  // A network may name the site actions its agents may call, and may bind symbolic
  // peer names in links.json. The manifest declares the actions; the link map declares
  // the peers. A checker outside the site can read both.
  const declaredActions = Array.isArray(parsedManifest.actions?.agentTools)
    ? parsedManifest.actions!.agentTools!
    : [];

  const links = await timed(async () => {
    const response = await fetch(new URL("links.json", base!).href, { credentials: "omit" });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.text();
  });
  let boundPeers: string[] = [];
  if (links.value) {
    try {
      const doc = JSON.parse(links.value) as { networks?: Record<string, Record<string, string>> };
      boundPeers = Object.keys(doc.networks?.[entry.name ?? ""] ?? {});
    } catch {
      boundPeers = [];
    }
  }

  const built = buildNetwork({
    name: entry.name ?? "network",
    frontMan: entry.front_man ?? "",
    description: entry.description ?? "",
    document: parsed.value,
    sourceFormat: format,
    linkedNames: boundPeers,
    actionNames: declaredActions,
  });

  record(
    "validate",
    "The graph validates: every agent named, every reference resolvable, no duplicates",
    built.model ? "pass" : "fail",
    built.model
      ? `${built.model.agents.size} agents, front agent ${built.model.frontMan}, ${declaredActions.length} declared site actions, ${boundPeers.length} bound peers`
      : built.issues.errors.slice(0, 4).join("; "),
  );

  record(
    "links",
    "links.json is published (optional unless symbolic peers are used)",
    links.error ? (boundPeers.length > 0 ? "fail" : "skip") : "pass",
    links.error
      ? boundPeers.length > 0
        ? "symbolic peers are used but links.json is missing"
        : "not published, and no symbolic peer is used"
      : `published · binds ${boundPeers.join(", ") || "no peer"}`,
    links.ms,
  );

  finish();
}

function finish(): void {
  const passed = out.filter((item) => item.state === "pass").length;
  const failed = out.filter((item) => item.state === "fail").length;
  summary.innerHTML =
    failed === 0
      ? `<b>${passed} checks passed.</b> The published artifacts are readable and the graph validates. This does not prove the site's runtime behaves correctly — only its own runtime can show that.`
      : `<b>${failed} of ${out.length} checks failed.</b> The first failure above is the one to fix.`;
  json.textContent = JSON.stringify({ checkedAt: new Date().toISOString(), results: out }, null, 2);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void check(input.value.trim());
});

void check(input.value);
