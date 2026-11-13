/**
 * The job sheet, and the site actions that write on it.
 *
 * The page owns the document. Agents can only add to it through registered actions
 * with a schema, an effect classification and a receipt; the drawing and the paper
 * are both projections of this one state.
 */

import type { ActionRegistry } from "../runtime/actions.js";
import type { PrivateContext } from "../runtime/private.js";
import { findPart, money, PARTS, SHOP, SLOTS, type Part } from "./data.js";

export type Severity = "info" | "attention" | "stop";

export interface Finding {
  id: string;
  title: string;
  detail: string;
  part: string | null;
  severity: Severity;
}

export interface BenchItem {
  partId: string;
  quantity: number;
  source: "shelf" | "co-op";
  note: string;
}

export interface LabourItem {
  task: string;
  minutes: number;
  cost: number;
}

export interface Booking {
  receipt: string;
  slot: string;
  at: number;
  name: string;
}

export interface JobState {
  number: string;
  complaint: string;
  findings: Finding[];
  bench: BenchItem[];
  labour: LabourItem[];
  slot: string | null;
  booked: Booking | null;
  ordered: Array<{ partId: string; quantity: number; receipt: string; leadDays: number }>;
  highlight: { part: string; note: string } | null;
  stamps: string[];
  version: number;
}

export type Listener = (state: JobState) => void;

export class JobStore {
  state: JobState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = {
      number: "0417",
      complaint: "",
      findings: [],
      bench: [],
      labour: [],
      slot: null,
      booked: null,
      ordered: [],
      highlight: null,
      stamps: [],
      version: 0,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  commit(mutate: (state: JobState) => void): void {
    mutate(this.state);
    this.state.version += 1;
    for (const listener of this.listeners) listener(this.state);
  }

  reset(): void {
    this.commit((state) => {
      state.complaint = "";
      state.findings = [];
      state.bench = [];
      state.labour = [];
      state.slot = null;
      state.booked = null;
      state.ordered = [];
      state.highlight = null;
      state.stamps = [];
    });
  }

  setComplaint(text: string): void {
    if (this.state.complaint) return;
    this.commit((state) => {
      state.complaint = text;
    });
  }

  totals(): Totals {
    return computeTotals(this.state);
  }
}

export interface Totals {
  parts: number;
  labour: number;
  total: number;
  minutes: number;
}

export function computeTotals(state: JobState): Totals {
  const parts = state.bench.reduce((sum, item) => {
    const part = findPart(item.partId);
    return sum + (part ? part.price * item.quantity : 0);
  }, 0);
  const labour = state.labour.reduce((sum, item) => sum + item.cost, 0);
  const minutes = state.labour.reduce((sum, item) => sum + item.minutes, 0);
  return { parts, labour, total: parts + labour, minutes };
}

function summary(state: JobState): Record<string, unknown> {
  return {
    job: state.number,
    complaint: state.complaint || null,
    findings: state.findings.map((finding) => ({
      title: finding.title,
      detail: finding.detail,
      part: finding.part,
      severity: finding.severity,
    })),
    bench: state.bench.map((item) => ({
      part: item.partId,
      name: findPart(item.partId)?.name ?? item.partId,
      quantity: item.quantity,
      source: item.source,
      price: findPart(item.partId)?.price ?? 0,
    })),
    labour: state.labour,
    slot: state.slot,
    booked: state.booked ? { slot: state.booked.slot, receipt: state.booked.receipt } : null,
    ordered: state.ordered,
    totals: computeTotals(state),
    currency: SHOP.currency,
    note: "This is the live job sheet. Read it before you claim anything about this job.",
  };
}

export interface JobActionsOptions {
  store: JobStore;
  privateContext: PrivateContext;
  /** Called when the drawing should follow the agent. */
  onHighlight: (partId: string | null, note: string) => void;
  /** Simulated co-op outage, for the fail-closed demonstration. */
  coOpDown?: () => boolean;
}

export function registerJobActions(registry: ActionRegistry, options: JobActionsOptions): void {
  const { store, privateContext } = options;
  const id = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

  registry.register({
    name: "read_job",
    description:
      "Read the live job sheet: the complaint as written, every finding recorded so far, the parts on the bench, the labour lines, the held slot and the totals. Read this before quoting anything.",
    effect: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => summary(store.state),
  });

  registry.register({
    name: "read_catalogue",
    description:
      "Read what this shop actually has: every part with its shelf stock, price and co-op lead time, the bench rate, opening hours and the drop-off slots with the spaces left in each.",
    effect: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        part: {
          type: "string",
          description: "Optional: read one part by id instead of the whole catalogue.",
          enum: PARTS.map((part) => part.id),
        },
      },
    },
    execute: ({ part }) => {
      if (typeof part === "string") {
        const found = findPart(part);
        return found ? { part: found } : { error: `No part with id ${part}.` };
      }
      return {
        shop: {
          name: SHOP.name,
          street: SHOP.street,
          town: SHOP.town,
          currency: SHOP.currency,
          benchRatePerMinute: SHOP.benchRatePerMinute,
          hours: SHOP.hours,
          promise: SHOP.promise,
        },
        parts: PARTS,
        slots: SLOTS.map((slot) => ({ ...slot, taken: store.state.booked?.slot === slot.id })),
      };
    },
  });

  registry.register({
    name: "highlight_part",
    description:
      "Point at one part on the drawing. The visitor sees a leader line, the part's stock and price, and the rest of the drawing steps back. Use this whenever you name a part, once per part, and do not use it for anything that is not a listed part.",
    effect: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["part"],
      properties: {
        part: { type: "string", enum: PARTS.map((part) => part.id) },
        note: { type: "string", maxLength: 90, description: "At most six words, printed beside the part." },
      },
    },
    execute: ({ part, note }) => {
      const partId = String(part);
      const label = typeof note === "string" ? note : "";
      store.commit((state) => {
        state.highlight = { part: partId, note: label };
      });
      options.onHighlight(partId, label);
      const found = findPart(partId);
      return {
        pointed_at: found?.name ?? partId,
        shown: found ? (found.stock > 0 ? `${found.stock} on the shelf` : `co-op, ${found.coOpDays} days`) : null,
      };
    },
  });

  registry.register({
    name: "record_finding",
    description:
      "Write one finding on the job sheet. Each finding is one line the visitor will read, with the part it concerns and how serious it is. Record a finding only for something you have actually checked or read.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "detail", "severity"],
      properties: {
        title: { type: "string", minLength: 3, maxLength: 64 },
        detail: { type: "string", minLength: 3, maxLength: 220 },
        part: { type: "string", enum: PARTS.map((part) => part.id) },
        severity: { type: "string", enum: ["info", "attention", "stop"] },
      },
    },
    execute: ({ title, detail, part, severity }) => {
      store.commit((state) => {
        state.findings.push({
          id: id("f"),
          title: String(title),
          detail: String(detail),
          part: typeof part === "string" ? part : null,
          severity: severity as Severity,
        });
      });
      return { findings: store.state.findings.length, written: title };
    },
  });

  registry.register({
    name: "add_part_to_bench",
    description:
      "Put a part on the bench: it appears as a detail crop of the drawing with its price and where it comes from. Use it for parts this job actually needs.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["part"],
      properties: {
        part: { type: "string", enum: PARTS.map((part) => part.id) },
        quantity: { type: "integer", minimum: 1, maximum: 4 },
        source: { type: "string", enum: ["shelf", "co-op"] },
        note: { type: "string", maxLength: 80 },
      },
    },
    execute: ({ part, quantity, source, note }) => {
      const partId = String(part);
      const found = findPart(partId);
      if (!found) return { error: `No part with id ${partId}.` };
      const amount = typeof quantity === "number" ? quantity : 1;
      store.commit((state) => {
        const existing = state.bench.find((item) => item.partId === partId);
        if (existing) existing.quantity += amount;
        else
          state.bench.push({
            partId,
            quantity: amount,
            source: (source as "shelf" | "co-op") ?? (found.stock > 0 ? "shelf" : "co-op"),
            note: typeof note === "string" ? note : "",
          });
      });
      return { on_the_bench: found.name, quantity: amount, price: found.price };
    },
  });

  registry.register({
    name: "quote_labour",
    description:
      "Add one labour line to the job sheet. The rate is the shop's bench rate; you supply the task and the minutes. Add a line only for work you would actually do for this complaint.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task", "minutes"],
      properties: {
        task: { type: "string", minLength: 3, maxLength: 70 },
        minutes: { type: "integer", minimum: 5, maximum: 180 },
      },
    },
    execute: ({ task, minutes }) => {
      const amount = Number(minutes);
      const cost = Math.round(amount * SHOP.benchRatePerMinute);
      store.commit((state) => {
        state.labour.push({ task: String(task), minutes: amount, cost });
      });
      return { labour_line: String(task), minutes: amount, cost, currency: SHOP.currency };
    },
  });

  registry.register({
    name: "propose_slot",
    description:
      "Hold one drop-off slot on the job sheet. This does not book it: it shows the visitor which slot you mean. Booking is a separate, irreversible action the visitor has to approve.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slot"],
      properties: {
        slot: { type: "string", enum: SLOTS.map((slot) => slot.id) },
      },
    },
    execute: ({ slot }) => {
      const found = SLOTS.find((item) => item.id === slot);
      if (!found) return { error: `No slot ${slot}.` };
      if (store.state.booked) return { error: "This job is already booked." };
      store.commit((state) => {
        state.slot = found.id;
      });
      return {
        held: `${found.day} ${found.date}, ${found.time}`,
        note: "Held, not booked. Only book_dropoff commits it.",
      };
    },
  });

  registry.register({
    name: "book_dropoff",
    description:
      "Commit the booking for the held slot. This is irreversible: it creates a job number for the visitor and reserves bench time. The visitor is asked to approve it before it runs, and their contact details come from their own form, never from you.",
    effect: "irreversible",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["slot"],
      properties: {
        slot: { type: "string", enum: SLOTS.map((slot) => slot.id) },
        note: { type: "string", maxLength: 120, description: "Anything the mechanic should know before the visit." },
      },
    },
    timeoutMs: 4000,
    execute: ({ slot }) => {
      const found = SLOTS.find((item) => item.id === slot);
      if (!found) return { error: `No slot ${slot}.` };
      const contact = String(privateContext.view("shop").allowed["contact"] ?? "").trim();
      if (contact === "") {
        return {
          error:
            "No contact details on the form. Ask the visitor to fill in their name and phone before booking.",
        };
      }
      const receipt = `SS-${store.state.number}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      store.commit((state) => {
        state.booked = { receipt, slot: found.id, at: Date.now(), name: contact };
        state.slot = found.id;
        if (!state.stamps.includes("BOOKED")) state.stamps.push("BOOKED");
      });
      return {
        booked: true,
        receipt,
        slot: `${found.day} ${found.date}, ${found.time}`,
        job: store.state.number,
        contact_used: "from the visitor's own form",
      };
    },
  });

  registry.register({
    name: "order_part",
    description:
      "Order a part from the parts co-op. Irreversible and takes days, so only use it when the visitor has agreed to wait. The visitor approves it first.",
    effect: "irreversible",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["part", "quantity"],
      properties: {
        part: { type: "string", enum: PARTS.map((part) => part.id) },
        quantity: { type: "integer", minimum: 1, maximum: 2 },
      },
    },
    timeoutMs: 3500,
    execute: ({ part, quantity }) => {
      const found = findPart(String(part));
      if (!found) return { error: `No part with id ${String(part)}.` };
      if (options.coOpDown?.()) {
        // Simulated network failure after dispatch: the outcome is unknown.
        return new Promise((_, reject) => setTimeout(() => reject(new Error("the co-op stopped answering")), 3600));
      }
      const receipt = `CO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      store.commit((state) => {
        state.ordered.push({
          partId: found.id,
          quantity: Number(quantity),
          receipt,
          leadDays: found.coOpDays ?? 7,
        });
      });
      return {
        ordered: found.name,
        receipt,
        lead_days: found.coOpDays,
        trade_price: found.coOpTradePrice,
        note: "The co-op has accepted the order. Nothing is charged until it arrives.",
      };
    },
  });

  registry.register({
    name: "lookup_job",
    description: "Read a booked job by its number, for a visitor who comes back later.",
    effect: "read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["number"],
      properties: { number: { type: "string", minLength: 1, maxLength: 20 } },
    },
    execute: ({ number }) => {
      const wanted = String(number).trim().replace(/^#/, "");
      if (wanted !== store.state.number) return { found: false, note: `No job numbered ${number} at this shop.` };
      return { found: true, job: summary(store.state) };
    },
  });
}

export function moneyOrDash(value: number): string {
  return value === 0 ? "—" : money(value);
}
