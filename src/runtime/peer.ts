/**
 * Loading a peer agent site (MVP Profile 0.2, §3.2).
 *
 * The peer's network runs here, in the caller's browser, with the caller's router,
 * model policy and limits. Three rules are load-bearing:
 *   - the URL's final path component is the network name, and the match must be exact;
 *   - every contact with a third-party origin is preceded by consent that names the
 *     origin and the purpose;
 *   - nothing carrying the visitor's credential is ever sent to the peer.
 */

import { parseNetworkSource } from "./hocon.js";
import { buildNetwork, peerNetworkName, peerSiteBase, type NetworkModel } from "./network.js";
import type { TraceBus } from "./trace.js";

export interface PeerPolicy {
  mode: "closed" | "allowlist" | "open";
  deny_origins?: string[];
  allow_origins?: string[];
}

export interface SiteManifest {
  brand?: string;
  networks: Array<{
    name: string;
    front_man: string;
    hocon: string;
    description?: string;
    sample_queries?: string[];
  }>;
  llm_router?: { base_url?: string; model?: string; byok_router?: string; mock?: boolean };
  allowed_peers?: string[];
  peer_policy?: PeerPolicy;
  theme?: Record<string, string>;
  actions?: { version: number; module?: string; agentTools?: string[] };
  linking?: {
    protocol?: string;
    exports?: Array<{ network: string; front_man: string; aliases?: string[]; url: string }>;
  };
  deployment?: Record<string, unknown>;
  [key: string]: unknown;
}

export type PeerErrorCode = "denied" | "unbound" | "not-found" | "no-match" | "invalid" | "network" | "cycle" | "cors";

export class PeerError extends Error {
  readonly code: PeerErrorCode;
  readonly origin: string;
  constructor(code: PeerErrorCode, origin: string, message: string) {
    super(message);
    this.name = "PeerError";
    this.code = code;
    this.origin = origin;
  }
}

export interface PeerConsentRequest {
  origin: string;
  url: string;
  network: string;
  purpose: string;
  note: string;
}

export type PeerConsent = (request: PeerConsentRequest) => Promise<boolean>;

export interface PeerBundle {
  url: string;
  base: string;
  origin: string;
  networkName: string;
  manifest: SiteManifest;
  model: NetworkModel;
  /** The peer's own links.json, which binds its symbolic references. */
  links: Record<string, string>;
  format: "json" | "hocon";
}

export interface PeerLoaderOptions {
  trace: TraceBus;
  policy: PeerPolicy;
  consent: PeerConsent;
  fetchImpl?: typeof fetch;
  purpose?: string;
  /** Read at consent time, so the note can name the fields this session holds. */
  note?: () => string;
}

const SESSION_CONSENT = new Map<string, boolean>();

export class PeerLoader {
  private trace: TraceBus;
  private policy: PeerPolicy;
  private consent: PeerConsent;
  private fetchImpl: typeof fetch;
  private purpose: string;
  private note: () => string;

  constructor(options: PeerLoaderOptions) {
    this.trace = options.trace;
    this.policy = options.policy;
    this.consent = options.consent;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.purpose = options.purpose ?? "answer a question this site cannot answer alone";
    this.note = options.note ?? (() => "Only the public network files are requested.");
  }

  /** Ask for consent at most once per origin per session, as the profile allows. */
  private async approve(origin: string, url: string, network: string, note: string): Promise<boolean> {
    if (SESSION_CONSENT.get(origin) === true) return true;
    const approved = await this.consent({ origin, url, network, purpose: this.purpose, note });
    this.trace.emit("peer.consent", "runtime", `${approved ? "Approved" : "Declined"} contact with ${origin}`, {
      origin,
      network,
      approved,
    });
    if (approved) SESSION_CONSENT.set(origin, true);
    return approved;
  }

  /** Check the site's peer policy before anything leaves the page. */
  private policyAllows(origin: string): { ok: boolean; reason: string } {
    const deny = this.policy.deny_origins ?? [];
    if (deny.includes(origin)) return { ok: false, reason: `${origin} is on this site's deny list` };
    if (this.policy.mode === "closed") return { ok: false, reason: "this site's peer policy is closed" };
    if (this.policy.mode === "allowlist") {
      const allow = this.policy.allow_origins ?? [];
      if (!allow.includes(origin)) return { ok: false, reason: `${origin} is not on this site's allow list` };
    }
    return { ok: true, reason: "" };
  }

  private async fetchText(url: string, what: string): Promise<{ text: string; response: Response }> {
    this.trace.emit("net.request", "runtime", `GET ${url}`, { what, credentials: "omit" });
    let response: Response;
    try {
      // No credentials, no authorization header: a public artifact request.
      response = await this.fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        mode: "cors",
        headers: { accept: "*/*" },
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      const origin = safeOrigin(url);
      throw new PeerError(
        "cors",
        origin,
        `${origin} could not be reached from this browser. It may be offline, or it may not send the CORS headers a cross-origin fetch needs.`,
      );
    }
    this.trace.emit("net.response", "runtime", `${response.status} ${url}`, { status: response.status });
    if (!response.ok) {
      throw new PeerError("not-found", safeOrigin(url), `${new URL(url).origin} answered ${response.status} for ${what}.`);
    }
    return { text: await response.text(), response };
  }

  async load(url: string, chain: string[] = []): Promise<PeerBundle> {
    const networkName = peerNetworkName(url);
    const base = peerSiteBase(url);
    const origin = safeOrigin(url);
    if (!networkName || !base) {
      throw new PeerError("invalid", origin, `"${url}" is not a peer-network URL.`);
    }
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)/i.test(url)) {
      throw new PeerError("invalid", origin, "A peer network must be served over HTTPS.");
    }
    if (chain.some((item) => item === base)) {
      throw new PeerError(
        "cycle",
        origin,
        `Composition cycle stopped: ${base} is already being composed in this run.`,
      );
    }
    const policy = this.policyAllows(origin);
    if (!policy.ok) {
      this.trace.emit("peer.error", "runtime", `Refused ${origin}: ${policy.reason}`, { origin, reason: policy.reason });
      throw new PeerError("denied", origin, `This site will not contact ${origin}: ${policy.reason}.`);
    }

    const approved = await this.approve(
      origin,
      url,
      networkName,
      `Read ${base}agent-manifest.json, then run "${networkName}" here in your browser. ${this.note()}`,
    );
    if (!approved) {
      throw new PeerError("denied", origin, `You declined contact with ${origin}, so it was not contacted.`);
    }

    this.trace.emit("peer.request", "runtime", `Resolving ${networkName} at ${origin}`, { base, networkName });
    const manifestResult = await this.fetchText(`${base}agent-manifest.json`, "the peer manifest");
    let manifest: SiteManifest;
    try {
      manifest = JSON.parse(manifestResult.text) as SiteManifest;
    } catch {
      throw new PeerError("invalid", origin, `${origin}'s agent-manifest.json is not valid JSON.`);
    }
    if (!manifest || !Array.isArray(manifest.networks)) {
      throw new PeerError("invalid", origin, `${origin}'s manifest has no networks list.`);
    }

    // Exact match or nothing: the profile forbids falling back to another network.
    const entry = manifest.networks.find((item) => item?.name === networkName);
    if (!entry) {
      throw new PeerError(
        "no-match",
        origin,
        `${origin} publishes ${manifest.networks.map((n) => n.name).join(", ") || "no networks"}, not "${networkName}". Nothing was substituted.`,
      );
    }
    if (typeof entry.hocon !== "string" || typeof entry.front_man !== "string") {
      throw new PeerError("invalid", origin, `The manifest entry for ${networkName} is missing hocon or front_man.`);
    }

    const definitionUrl = new URL(entry.hocon, base).href;
    const definitionResult = await this.fetchText(definitionUrl, "the peer network definition");
    const parsed = parseNetworkSource(definitionResult.text);

    let links: Record<string, string> = {};
    try {
      const linkResult = await this.fetchText(`${base}links.json`, "the peer link map");
      const parsedLinks = JSON.parse(linkResult.text) as { networks?: Record<string, Record<string, string>> };
      links = parsedLinks.networks?.[networkName] ?? {};
    } catch {
      // A peer without links.json simply has no symbolic peers of its own.
    }

    const { model, issues } = buildNetwork({
      name: networkName,
      frontMan: entry.front_man,
      description: entry.description ?? "",
      document: parsed.data,
      sourceFormat: parsed.format,
      linkedNames: Object.keys(links),
    });
    if (!model) {
      throw new PeerError(
        "invalid",
        origin,
        `${networkName} at ${origin} is not a runnable network: ${issues.errors.join("; ")}`,
      );
    }

    this.trace.emit("peer.loaded", "runtime", `${networkName} loaded from ${origin}`, {
      origin,
      format: parsed.format,
      agents: [...model.agents.keys()],
      routerFromPeerIgnored: Boolean(manifest.llm_router?.base_url),
      privateFieldsSent: 0,
    });

    return { url, base, origin, networkName, manifest, model, links, format: parsed.format };
  }

  resetSessionConsent(): void {
    SESSION_CONSENT.clear();
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
