/**
 * The Neuro SAN data model, as a browser can hold it.
 *
 * A published network is data: agents with a name, a function description,
 * instructions, an invocation schema, and a list of agents or tools they may call.
 * This module turns that data into a validated graph and refuses what the minimum
 * profile lets a runtime refuse (§3.1 "Parse and validate").
 */

import type { JsonSchema } from "./schema.js";

export type ToolRef =
  | { kind: "agent"; name: string }
  | { kind: "action"; name: string }
  | { kind: "peer"; name: string; ref: string }
  | { kind: "mcp"; name: string; url: string; tools: string[] };

export interface AgentSpec {
  name: string;
  description: string;
  instructions: string;
  parameters: JsonSchema;
  tools: ToolRef[];
}

export interface NetworkModel {
  name: string;
  frontMan: string;
  description: string;
  instructionsPrefix: string;
  aaosa: string;
  agents: Map<string, AgentSpec>;
  model: string;
  temperature: number | null;
  maxExecutionSeconds: number;
  maxStepsPerAgent: number;
  sourceFormat: "json" | "hocon";
}

export interface NetworkIssues {
  errors: string[];
  warnings: string[];
}

export const DEFAULT_AGENT_PARAMETERS: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["inquiry"],
  properties: {
    inquiry: { type: "string", minLength: 1, description: "What this agent should work on." },
    context: { type: "string", description: "Optional facts the caller already established." },
  },
};

const URL_RE = /^https?:\/\//i;
const SYMBOL_RE = /^[a-z][a-z0-9_]*$/i;

export function looksLikeUrl(value: string): boolean {
  return URL_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type RawRef = { kind: "name"; value: string } | { kind: "mcp"; url: string; tools: string[] };

/**
 * Validate a published network document and build the graph.
 * `linkedNames` are the symbolic peer names the site's links.json binds.
 */
export function buildNetwork(options: {
  name: string;
  frontMan: string;
  description: string;
  document: unknown;
  sourceFormat: "json" | "hocon";
  linkedNames?: string[];
  /** Names of the site actions the runtime has registered, before any model call. */
  actionNames?: string[];
}): { model: NetworkModel | null; issues: NetworkIssues } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const doc = asRecord(options.document);
  if (!doc) {
    return { model: null, issues: { errors: ["the published document is not an object"], warnings } };
  }

  const tools = doc["tools"];
  if (!Array.isArray(tools) || tools.length === 0) {
    return {
      model: null,
      issues: { errors: ["the published document has no `tools` array of agents"], warnings },
    };
  }

  const order: string[] = [];
  const specs = new Map<string, AgentSpec>();
  const rawRefs = new Map<string, RawRef[]>();

  for (const [index, entry] of tools.entries()) {
    const record = asRecord(entry);
    if (!record) {
      errors.push(`tools[${index}] is a ${typeof entry}, not an agent definition`);
      continue;
    }
    const name = record["name"];
    if (typeof name !== "string" || name.length === 0) {
      errors.push(`tools[${index}] has no name`);
      continue;
    }
    if (!SYMBOL_RE.test(name)) {
      errors.push(`agent "${name}" cannot be used as a function name (letters, digits, underscore only)`);
      continue;
    }
    if (specs.has(name)) {
      errors.push(`agent "${name}" is defined more than once`);
      continue;
    }

    const fn = asRecord(record["function"]);
    const description = typeof fn?.["description"] === "string" ? (fn["description"] as string) : "";
    if (!description) errors.push(`agent "${name}" has no function description`);

    const instructions = typeof record["instructions"] === "string" ? (record["instructions"] as string) : "";
    if (!instructions) warnings.push(`agent "${name}" has no instructions, so it can only delegate`);

    let parameters: JsonSchema = DEFAULT_AGENT_PARAMETERS;
    const rawParameters = fn?.["parameters"];
    if (rawParameters !== undefined) {
      const asObj = asRecord(rawParameters);
      if (!asObj) errors.push(`agent "${name}" has a parameters value that is not a JSON Schema object`);
      else parameters = asObj as JsonSchema;
    }

    const refs: RawRef[] = [];
    const refList = record["tools"];
    if (refList !== undefined) {
      if (!Array.isArray(refList)) {
        errors.push(`agent "${name}" has a tools value that is not a list`);
      } else {
        for (const ref of refList) {
          if (typeof ref === "string") {
            refs.push({ kind: "name", value: ref });
            continue;
          }
          const refObj = asRecord(ref);
          const url = refObj?.["url"];
          if (!refObj || typeof url !== "string" || !looksLikeUrl(url)) {
            const shape = refObj ? Object.keys(refObj).join(", ") : typeof ref;
            errors.push(
              `agent "${name}" lists an unsupported executable definition (keys: ${shape || "none"}). ` +
                "The portable profile carries data only.",
            );
            continue;
          }
          const allowed = refObj["tools"];
          const names = Array.isArray(allowed) ? allowed.filter((t): t is string => typeof t === "string") : [];
          refs.push({ kind: "mcp", url, tools: names });
        }
      }
    }

    specs.set(name, { name, description, instructions, parameters, tools: [] });
    rawRefs.set(name, refs);
    order.push(name);
  }

  if (specs.size === 0) errors.push("the network defines no usable agents");

  if (!specs.has(options.frontMan)) {
    errors.push(`front agent "${options.frontMan}" is not one of the published agents`);
  }

  // Resolve references: an agent name, then a registered site action, then a peer.
  const actions = new Set(options.actionNames ?? []);
  for (const name of order) {
    const spec = specs.get(name)!;
    for (const ref of rawRefs.get(name) ?? []) {
      if (ref.kind === "mcp") {
        const host = new URL(ref.url).hostname.replace(/[^a-z0-9]/gi, "_");
        spec.tools.push({ kind: "mcp", name: `mcp_${host}_${spec.tools.length}`, url: ref.url, tools: ref.tools });
        continue;
      }
      const value = ref.value;
      if (specs.has(value)) {
        if (value === name) errors.push(`agent "${name}" lists itself as a tool`);
        spec.tools.push({ kind: "agent", name: value });
        continue;
      }
      if (actions.has(value)) {
        spec.tools.push({ kind: "action", name: value });
        continue;
      }
      if (looksLikeUrl(value)) {
        spec.tools.push({ kind: "peer", name: peerNetworkName(value) ?? "peer", ref: value });
        continue;
      }
      spec.tools.push({ kind: "peer", name: value, ref: value });
    }
  }

  const linked = new Set(options.linkedNames ?? []);
  for (const spec of specs.values()) {
    for (const tool of spec.tools) {
      if (tool.kind !== "peer" || looksLikeUrl(tool.ref)) continue;
      if (!linked.has(tool.ref)) {
        errors.push(
          `agent "${spec.name}" refers to "${tool.ref}", which is neither an agent here, nor a registered site action, nor a peer bound in links.json`,
        );
      }
    }
  }

  const llm = asRecord(doc["llm_config"]);
  const model = typeof llm?.["model_name"] === "string"
    ? (llm["model_name"] as string)
    : typeof llm?.["model"] === "string"
      ? (llm["model"] as string)
      : "";
  const temperature = typeof llm?.["temperature"] === "number" ? (llm["temperature"] as number) : null;

  const declaredSeconds = doc["max_execution_seconds"];
  const maxSeconds = typeof declaredSeconds === "number" ? declaredSeconds : 120;
  if (!(maxSeconds > 0 && maxSeconds <= 3600)) errors.push("max_execution_seconds must be between 1 and 3600");

  const metadata = asRecord(doc["metadata"]);
  const description = typeof metadata?.["description"] === "string"
    ? (metadata["description"] as string)
    : options.description;

  if (errors.length > 0) return { model: null, issues: { errors, warnings } };

  return {
    model: {
      name: options.name,
      frontMan: options.frontMan,
      description,
      instructionsPrefix: typeof doc["instructions_prefix"] === "string" ? (doc["instructions_prefix"] as string) : "",
      aaosa: typeof doc["aaosa_instructions"] === "string" ? (doc["aaosa_instructions"] as string) : "",
      agents: specs,
      model,
      temperature,
      maxExecutionSeconds: maxSeconds,
      maxStepsPerAgent: typeof doc["max_steps_per_agent"] === "number" ? (doc["max_steps_per_agent"] as number) : 8,
      sourceFormat: options.sourceFormat,
    },
    issues: { errors, warnings },
  };
}

/** The final path component of a peer URL is the published network name. */
export function peerNetworkName(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** The site base of a peer URL: everything before the final path component. */
export function peerSiteBase(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    parts.pop();
    const path = parts.length > 0 ? `/${parts.join("/")}/` : "/";
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}
