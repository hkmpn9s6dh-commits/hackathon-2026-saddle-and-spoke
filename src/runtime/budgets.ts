/**
 * Finite execution limits (MVP Profile 0.2, §3.1 "Bound execution").
 *
 * Limits are configurable by network, subject to runtime maximums. Repeated
 * invocation of the same agent is explicitly not a cycle, so depth is counted by
 * the length of the delegation chain, not by how often an agent has run.
 */

export type BudgetCode = "steps" | "depth" | "peers" | "time" | "concurrency";

export class BudgetError extends Error {
  readonly code: BudgetCode;
  readonly limit: number;
  constructor(code: BudgetCode, limit: number, detail: string) {
    super(detail);
    this.name = "BudgetError";
    this.code = code;
    this.limit = limit;
  }
}

export interface BudgetLimits {
  maxSteps: number;
  maxDepth: number;
  maxPeerCalls: number;
  maxSeconds: number;
  maxConcurrent: number;
}

export const RUNTIME_MAXIMUMS: BudgetLimits = {
  maxSteps: 40,
  maxDepth: 6,
  maxPeerCalls: 6,
  maxSeconds: 600,
  maxConcurrent: 4,
};

export function normaliseLimits(partial: Partial<BudgetLimits> | undefined, declaredSeconds: number): BudgetLimits {
  const pick = (value: number | undefined, fallback: number, ceiling: number): number => {
    const wanted = typeof value === "number" && value > 0 ? value : fallback;
    return Math.min(wanted, ceiling);
  };
  return {
    maxSteps: pick(partial?.maxSteps, 16, RUNTIME_MAXIMUMS.maxSteps),
    maxDepth: pick(partial?.maxDepth, 4, RUNTIME_MAXIMUMS.maxDepth),
    maxPeerCalls: pick(partial?.maxPeerCalls, 2, RUNTIME_MAXIMUMS.maxPeerCalls),
    maxSeconds: pick(partial?.maxSeconds, Math.min(declaredSeconds, 120), RUNTIME_MAXIMUMS.maxSeconds),
    maxConcurrent: pick(partial?.maxConcurrent, 2, RUNTIME_MAXIMUMS.maxConcurrent),
  };
}

export class Budgets {
  readonly limits: BudgetLimits;
  private steps = 0;
  private peers = 0;
  private active = 0;
  private startedAt = Date.now();

  constructor(limits: BudgetLimits) {
    this.limits = limits;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  remaining(): { steps: number; peers: number; seconds: number } {
    return {
      steps: Math.max(0, this.limits.maxSteps - this.steps),
      peers: Math.max(0, this.limits.maxPeerCalls - this.peers),
      seconds: Math.max(0, Math.round((this.limits.maxSeconds * 1000 - this.elapsedMs) / 1000)),
    };
  }

  spendStep(): void {
    this.steps += 1;
    if (this.steps > this.limits.maxSteps) {
      throw new BudgetError(
        "steps",
        this.limits.maxSteps,
        `This run reached its limit of ${this.limits.maxSteps} model calls and stopped.`,
      );
    }
    this.checkTime();
  }

  spendPeer(): void {
    this.peers += 1;
    if (this.peers > this.limits.maxPeerCalls) {
      throw new BudgetError(
        "peers",
        this.limits.maxPeerCalls,
        `This run reached its limit of ${this.limits.maxPeerCalls} peer calls and stopped.`,
      );
    }
  }

  enterDepth(depth: number): void {
    if (depth > this.limits.maxDepth) {
      throw new BudgetError(
        "depth",
        this.limits.maxDepth,
        `Delegation reached its limit of ${this.limits.maxDepth} hops and stopped.`,
      );
    }
  }

  async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limits.maxConcurrent) {
      throw new BudgetError(
        "concurrency",
        this.limits.maxConcurrent,
        `The run already has ${this.limits.maxConcurrent} calls in flight.`,
      );
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
    }
  }

  checkTime(): void {
    if (this.elapsedMs > this.limits.maxSeconds * 1000) {
      throw new BudgetError(
        "time",
        this.limits.maxSeconds,
        `This run passed its time limit of ${this.limits.maxSeconds}s and stopped.`,
      );
    }
  }
}
