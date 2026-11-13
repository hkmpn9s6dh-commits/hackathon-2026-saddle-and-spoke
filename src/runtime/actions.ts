/**
 * Site actions: a capability owned by the web page and registered with the runtime.
 *
 * Registration supplies a name, a purpose, a JSON Schema, an effect classification
 * and a handler. The runtime validates the arguments, shows the visitor the
 * destination and the arguments before a write, and keeps the receipt bound to the
 * proposal it showed (MVP Profile 0.2, §3.1 and §5 "User-owned writes").
 */

import { applyDefaults, validateAgainstSchema, type JsonSchema } from "./schema.js";
import type { TraceBus } from "./trace.js";

export type Effect = "read" | "write" | "irreversible";

export interface ActionDefinition {
  name: string;
  description: string;
  effect: Effect;
  inputSchema: JsonSchema;
  /** Milliseconds before a running handler is treated as unknown. */
  timeoutMs?: number;
  execute: (args: Record<string, unknown>, context: ActionContext) => unknown | Promise<unknown>;
}

export interface ActionContext {
  action: string;
  requestId: string;
  /** The review the visitor approved, which the receipt is bound to. */
  proposal: ActionProposal;
}

export interface ActionProposal {
  action: string;
  description: string;
  effect: Effect;
  origin: string;
  arguments: Record<string, unknown>;
  requestId: string;
  argsHash: string;
}

export type ActionStatus = "ok" | "denied" | "error" | "unknown";

export interface ActionReceipt {
  requestId: string;
  action: string;
  origin: string;
  effect: Effect;
  argsHash: string;
  at: number;
  status: ActionStatus;
  result?: unknown;
  error?: string;
}

export interface ActionCallResult {
  status: ActionStatus;
  result?: unknown;
  receipt: ActionReceipt;
  denied?: boolean;
  message: string;
}

export type ConfirmFn = (proposal: ActionProposal) => Promise<boolean>;

/** FNV-1a over canonical JSON: short, stable, and enough to bind a receipt. */
export function hashArguments(value: unknown): string {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  const stamp = Date.now().toString(36).slice(-5);
  return `req-${stamp}-${requestCounter.toString(36)}`;
}

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();
  readonly origin: string;
  readonly trace: TraceBus;
  confirm: ConfirmFn;
  receipts: ActionReceipt[] = [];

  constructor(options: { origin: string; trace: TraceBus; confirm?: ConfirmFn }) {
    this.origin = options.origin;
    this.trace = options.trace;
    this.confirm = options.confirm ?? (async () => false);
  }

  register(definition: ActionDefinition): void {
    if (!definition.name || !/^[a-z][a-z0-9_]*$/i.test(definition.name)) {
      throw new Error(`Site action "${definition.name}" needs a function-safe name.`);
    }
    if (this.actions.has(definition.name)) {
      throw new Error(`Site action "${definition.name}" is registered twice.`);
    }
    this.actions.set(definition.name, definition);
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  list(): ActionDefinition[] {
    return [...this.actions.values()];
  }

  /** The catalog a model may choose from. */
  catalog(): Array<{ name: string; description: string; effect: Effect; inputSchema: JsonSchema }> {
    return this.list().map(({ name, description, effect, inputSchema }) => ({
      name,
      description,
      effect,
      inputSchema,
    }));
  }

  /**
   * Check the arguments and build the proposal the visitor will review.
   * Nothing runs here, so a proposal can be batched with its siblings.
   */
  prepare(
    name: string,
    rawArguments: unknown,
    actor = "runtime",
  ):
    | { ok: true; proposal: ActionProposal; definition: ActionDefinition }
    | { ok: false; message: string; receipt: ActionReceipt } {
    const requestId = nextRequestId();
    const definition = this.actions.get(name);
    if (!definition) {
      const receipt: ActionReceipt = {
        requestId,
        action: name,
        origin: this.origin,
        effect: "read",
        argsHash: "",
        at: Date.now(),
        status: "error",
        error: "unknown action",
      };
      this.receipts.push(receipt);
      return { ok: false, receipt, message: `There is no site action called "${name}".` };
    }

    const args = applyDefaults(rawArguments ?? {}, definition.inputSchema) as Record<string, unknown>;
    const issues = validateAgainstSchema(args, definition.inputSchema);
    if (issues.length > 0) {
      const detail = issues.map((issue) => `${issue.path} ${issue.message}`).join("; ");
      const receipt: ActionReceipt = {
        requestId,
        action: name,
        origin: this.origin,
        effect: definition.effect,
        argsHash: hashArguments(args),
        at: Date.now(),
        status: "error",
        error: detail,
      };
      this.receipts.push(receipt);
      this.trace.emit("validate.error", actor, `Arguments for ${name} were rejected`, { detail });
      return {
        ok: false,
        receipt,
        message: `I did not run ${name}: the arguments did not match its schema (${detail}).`,
      };
    }

    return {
      ok: true,
      definition,
      proposal: {
        action: name,
        description: definition.description,
        effect: definition.effect,
        origin: this.origin,
        arguments: args,
        requestId,
        argsHash: hashArguments(args),
      },
    };
  }

  /** Run an approved (or read-only) proposal. */
  async commit(
    proposal: ActionProposal,
    definition: ActionDefinition,
    actor = "runtime",
  ): Promise<ActionCallResult> {
    const name = proposal.action;
    const requestId = proposal.requestId;
    if (definition.effect !== "read") {
      this.trace.emit("action.proposed", actor, `Running ${name} after review`, {
        effect: definition.effect,
        arguments: proposal.arguments,
      });
    }
    const timeoutMs = definition.timeoutMs ?? 8000;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve(
          definition.execute(proposal.arguments, { action: name, requestId, proposal }),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("__timeout__")), timeoutMs);
        }),
      ]);
      const receipt: ActionReceipt = {
        requestId,
        action: name,
        origin: this.origin,
        effect: definition.effect,
        argsHash: proposal.argsHash,
        at: Date.now(),
        status: "ok",
        result,
      };
      this.receipts.push(receipt);
      this.trace.emit("action.receipt", actor, `${name} completed in ${Date.now() - started}ms`, {
        status: "ok",
        requestId,
        result,
      });
      return { status: "ok", result, receipt, message: `${name} returned a result.` };
    } catch (error) {
      const timedOut = error instanceof Error && error.message === "__timeout__";
      // A write that began and did not come back has an unknown outcome. The runtime
      // must not retry it, and must not report it as a success.
      const status: ActionStatus = definition.effect === "read" ? "error" : "unknown";
      const detail = timedOut
        ? `no answer within ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      const receipt: ActionReceipt = {
        requestId,
        action: name,
        origin: this.origin,
        effect: definition.effect,
        argsHash: proposal.argsHash,
        at: Date.now(),
        status,
        error: detail,
      };
      this.receipts.push(receipt);
      this.trace.emit("action.receipt", actor, `${name} did not confirm`, { status, detail, requestId });
      return {
        status,
        receipt,
        message:
          status === "unknown"
            ? `${name} was sent but did not answer (${detail}). Its outcome is unknown, so I will not repeat it.`
            : `${name} failed: ${detail}`,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** A single call: prepare, ask if the effect is not a read, then commit. */
  async call(name: string, rawArguments: unknown, actor = "runtime"): Promise<ActionCallResult> {
    const prepared = this.prepare(name, rawArguments, actor);
    if (!prepared.ok) {
      return { status: "error", receipt: prepared.receipt, message: prepared.message };
    }
    if (prepared.definition.effect !== "read") {
      this.trace.emit("action.proposed", actor, `Asking the visitor to approve ${name}`, {
        effect: prepared.definition.effect,
        arguments: prepared.proposal.arguments,
      });
      const approved = await this.confirm(prepared.proposal);
      if (!approved) {
        this.receipts.push({ ...prepared.proposal, at: Date.now(), status: "denied" } as ActionReceipt);
        this.trace.emit("action.denied", actor, `The visitor declined ${name}`, {
          requestId: prepared.proposal.requestId,
        });
        return {
          status: "denied",
          receipt: { ...prepared.proposal, at: Date.now(), status: "denied" } as ActionReceipt,
          denied: true,
          message: `The visitor declined ${name}. Nothing was changed. Do not try again unless they ask.`,
        };
      }
    }
    return this.commit(prepared.proposal, prepared.definition, actor);
  }

  /** Record a refusal so the receipt list shows what did not happen. */
  deny(proposal: ActionProposal, actor = "runtime"): ActionCallResult {
    const receipt: ActionReceipt = {
      requestId: proposal.requestId,
      action: proposal.action,
      origin: this.origin,
      effect: proposal.effect,
      argsHash: proposal.argsHash,
      at: Date.now(),
      status: "denied",
    };
    this.receipts.push(receipt);
    this.trace.emit("action.denied", actor, `The visitor declined ${proposal.action}`, {
      requestId: proposal.requestId,
    });
    return {
      status: "denied",
      receipt,
      denied: true,
      message: `The visitor declined ${proposal.action}. Nothing was changed. Do not try again unless they ask.`,
    };
  }
}
