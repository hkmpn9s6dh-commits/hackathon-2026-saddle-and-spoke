/**
 * Observable execution (MVP Profile 0.2, §5): the selected router, contacted
 * origins, agent and tool calls, consent decisions, errors and action receipts
 * are visible to the visitor, without exposing secrets.
 */

export type TraceKind =
  | "run.start"
  | "run.end"
  | "run.error"
  | "agent.enter"
  | "agent.leave"
  | "agent.error"
  | "text.delta"
  | "tool.call"
  | "tool.result"
  | "action.proposed"
  | "action.receipt"
  | "action.denied"
  | "peer.request"
  | "peer.consent"
  | "peer.loaded"
  | "peer.error"
  | "private.filtered"
  | "budget.exceeded"
  | "router.request"
  | "router.error"
  | "validate.error"
  | "net.request"
  | "net.response";

export interface TraceEvent {
  seq: number;
  at: number;
  kind: TraceKind;
  /** Who caused it: an agent name, "runtime", or an origin. */
  actor: string;
  /** One line, safe to show. Never contains a credential. */
  message: string;
  data?: Record<string, unknown>;
}

export type TraceListener = (event: TraceEvent) => void;

const REDACT_KEYS = /^(authorization|api[-_]?key|key|token|secret|password|cookie)$/i;

/** Anything that might hold a credential is replaced before it is recorded. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEYS.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 400) return `${value.slice(0, 400)}…`;
  return value;
}

export class TraceBus {
  private listeners = new Set<TraceListener>();
  private buffer: TraceEvent[] = [];
  private seq = 0;

  emit(kind: TraceKind, actor: string, message: string, data?: Record<string, unknown>): TraceEvent {
    const event: TraceEvent = { seq: ++this.seq, at: Date.now(), kind, actor, message };
    if (data) event.data = redact(data) as Record<string, unknown>;
    this.buffer.push(event);
    if (this.buffer.length > 600) this.buffer.splice(0, this.buffer.length - 600);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken listener must not break a run.
      }
    }
    return event;
  }

  subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(): readonly TraceEvent[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer = [];
    this.seq = 0;
  }
}
