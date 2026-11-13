import { describe, expect, it } from "vitest";
import { ActionRegistry, hashArguments } from "../src/runtime/actions.js";
import { Budgets, normaliseLimits } from "../src/runtime/budgets.js";
import { Engine } from "../src/runtime/engine.js";
import { PrivateContext } from "../src/runtime/private.js";
import { buildNetwork } from "../src/runtime/network.js";
import { validateAgainstSchema } from "../src/runtime/schema.js";
import { TraceBus } from "../src/runtime/trace.js";
import type { Router, RouterDelta, RouterRequest } from "../src/runtime/llm.js";
import type { PeerLoader } from "../src/runtime/peer.js";

const trace = (): TraceBus => new TraceBus();

/** A router that plays a script, one step per model call for each agent. */
class ScriptedRouter implements Router {
  readonly id = "scripted";
  readonly label = "Scripted";
  readonly needsKey = false;
  readonly model = "scripted-1";
  constructor(private script: Record<string, Array<{ text?: string; calls?: Array<{ name: string; args: unknown }> }>>) {}
  async *stream(request: RouterRequest): AsyncIterable<RouterDelta> {
    const turn = request.messages.filter((message) => message.role === "assistant").length;
    const step = this.script[request.agent]?.[turn];
    if (!step) {
      yield { type: "text", text: "(end)" };
      yield { type: "done", finishReason: "stop" };
      return;
    }
    if (step.text) yield { type: "text", text: step.text };
    (step.calls ?? []).forEach((call, index) => {
      // yields are not allowed in forEach
      void index;
      void call;
    });
    for (const [index, call] of (step.calls ?? []).entries()) {
      yield {
        type: "tool_call",
        call: {
          id: `c${turn}_${index}`,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        },
      };
    }
    yield { type: "done", finishReason: step.calls?.length ? "tool_calls" : "stop" };
  }
}

const NETWORK = {
  metadata: { description: "test" },
  llm_config: { model_name: "x" },
  max_execution_seconds: 30,
  max_steps_per_agent: 4,
  tools: [
    {
      name: "desk",
      function: { description: "Front desk", parameters: { type: "object", required: ["inquiry"], properties: { inquiry: { type: "string" } } } },
      instructions: "Answer.",
      tools: ["mech", "write_note"],
    },
    {
      name: "mech",
      function: { description: "Mechanic", parameters: { type: "object", required: ["inquiry"], properties: { inquiry: { type: "string" } } } },
      instructions: "Work.",
      tools: [],
    },
  ],
};

function makeEngine(options: {
  router: Router;
  confirm?: (count: number) => boolean[];
  network?: unknown;
  limits?: Record<string, number>;
}) {
  const bus = trace();
  const registry = new ActionRegistry({
    origin: "https://example.test/",
    trace: bus,
    confirm: async () => true,
  });
  const executed: string[] = [];
  registry.register({
    name: "write_note",
    description: "Write a note.",
    effect: "write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", minLength: 1 } },
    },
    execute: ({ text }) => {
      executed.push(String(text));
      return { written: text };
    },
  });
  registry.register({
    name: "read_note",
    description: "Read the note.",
    effect: "read",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    execute: () => ({ note: executed.join("|") || null }),
  });

  const { model } = buildNetwork({
    name: "test",
    frontMan: "desk",
    description: "",
    document: options.network ?? NETWORK,
    sourceFormat: "json",
    actionNames: ["write_note", "read_note"],
    linkedNames: [],
  });

  let reviewCount = 0;
  const engine = new Engine({
    originUrl: "https://example.test/",
    model: model!,
    trace: bus,
    actions: registry,
    router: options.router,
    privateContext: new PrivateContext({}, []),
    peerLoader: {} as PeerLoader,
    limits: options.limits,
    review: async (proposals) => {
      const approved = options.confirm ? options.confirm(proposals.length) : proposals.map(() => true);
      reviewCount += 1;
      return approved;
    },
  });
  return { engine, registry, bus, executed, reviews: () => reviewCount };
}

describe("site actions", () => {
  it("validates arguments before running anything", async () => {
    const bus = trace();
    const registry = new ActionRegistry({ origin: "https://x/", trace: bus, confirm: async () => true });
    let ran = false;
    registry.register({
      name: "do",
      description: "d",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["n"],
        properties: { n: { type: "integer", minimum: 1 } },
      },
      execute: () => {
        ran = true;
      },
    });
    const result = await registry.call("do", { n: 0, extra: true });
    expect(result.status).toBe("error");
    expect(ran).toBe(false);
    expect(result.message).toMatch(/schema/);
  });

  it("asks before a write and records a refusal", async () => {
    const registry = new ActionRegistry({ origin: "https://x/", trace: trace(), confirm: async () => false });
    let ran = false;
    registry.register({
      name: "do",
      description: "d",
      effect: "write",
      inputSchema: { type: "object", properties: {} },
      execute: () => {
        ran = true;
      },
    });
    const result = await registry.call("do", {});
    expect(result.status).toBe("denied");
    expect(ran).toBe(false);
    expect(registry.receipts[0]?.status).toBe("denied");
  });

  it("reports an unknown outcome when a write never returns", async () => {
    const registry = new ActionRegistry({ origin: "https://x/", trace: trace(), confirm: async () => true });
    registry.register({
      name: "slow",
      description: "d",
      effect: "irreversible",
      timeoutMs: 30,
      inputSchema: { type: "object", properties: {} },
      execute: () => new Promise((resolve) => setTimeout(resolve, 300)),
    });
    const result = await registry.call("slow", {});
    expect(result.status).toBe("unknown");
    expect(result.message).toMatch(/unknown/);
    expect(result.message).toMatch(/will not repeat/);
  });

  it("binds the receipt to the reviewed arguments", async () => {
    const registry = new ActionRegistry({ origin: "https://x/", trace: trace(), confirm: async () => true });
    registry.register({
      name: "do",
      description: "d",
      effect: "write",
      inputSchema: { type: "object", properties: { a: { type: "string" } } },
      execute: (args) => args,
    });
    const result = await registry.call("do", { a: "one" });
    expect(result.receipt.argsHash).toBe(hashArguments({ a: "one" }));
    expect(result.receipt.argsHash).not.toBe(hashArguments({ a: "two" }));
  });
});

describe("schema", () => {
  it("rejects unknown properties only when the schema forbids them", () => {
    const closed = { type: "object" as const, additionalProperties: false, properties: { a: { type: "string" as const } } };
    expect(validateAgainstSchema({ a: "x", b: 1 }, closed)).toHaveLength(1);
    expect(validateAgainstSchema({ a: "x" }, { ...closed, additionalProperties: true })).toHaveLength(0);
  });

  it("checks enums, ranges and required fields", () => {
    const schema = {
      type: "object" as const,
      required: ["k"],
      properties: { k: { type: "string" as const, enum: ["a", "b"] }, n: { type: "integer" as const, minimum: 2 } },
    };
    expect(validateAgainstSchema({ k: "c" }, schema)).toHaveLength(1);
    expect(validateAgainstSchema({ k: "a", n: 1 }, schema)).toHaveLength(1);
    expect(validateAgainstSchema({ n: 2 }, schema)[0]?.message).toBe("is required");
  });
});

describe("private context", () => {
  it("is deny-by-default and names what was withheld", () => {
    const context = new PrivateContext(
      { contact: "07700 900123", serial: "WTU-1", trade_account: "SS-1042" },
      [{ destination: "coop", fields: ["trade_account"] }],
    );
    const view = context.view("coop");
    expect(Object.keys(view.allowed)).toEqual(["trade_account"]);
    expect(view.withheld).toEqual(["contact", "serial"]);
    expect(JSON.stringify(view.allowed)).not.toContain("07700");
  });

  it("gives an unknown destination nothing", () => {
    const context = new PrivateContext({ contact: "x" }, [{ destination: "coop", fields: ["contact"] }]);
    expect(context.view("someone_else").allowed).toEqual({});
    expect(context.view("someone_else").withheld).toEqual(["contact"]);
  });
});

describe("budgets", () => {
  it("stops at the declared step count", () => {
    const budget = new Budgets(normaliseLimits({ maxSteps: 2 }, 10));
    budget.spendStep();
    budget.spendStep();
    expect(() => budget.spendStep()).toThrow(/limit of 2 model calls/);
  });

  it("caps a declared time limit at the runtime maximum", () => {
    expect(normaliseLimits({ maxSeconds: 9999 }, 9999).maxSeconds).toBe(600);
    expect(normaliseLimits({ maxSteps: 9999 }, 10).maxSteps).toBe(40);
  });
});

describe("the agent loop", () => {
  it("delegates to an internal agent and returns its answer to the caller", async () => {
    const router = new ScriptedRouter({
      desk: [
        { text: "one moment", calls: [{ name: "mech", args: { inquiry: "check the chain" } }] },
        { text: "the chain is stretched: bring it in Saturday" },
      ],
      mech: [{ text: "the chain is stretched" }],
    });
    const { engine, bus } = makeEngine({ router });
    const result = await engine.run("chain skips");
    expect(result.halted).toBe(false);
    const kinds = bus.history().map((event) => event.kind);
    expect(kinds).toContain("agent.enter");
    expect(kinds).toContain("agent.leave");
    expect(result.text).toBe("the chain is stretched: bring it in Saturday");
  });

  it("reviews a whole turn's writes once, then runs the approved ones", async () => {
    const router = new ScriptedRouter({
      desk: [
        {
          text: "writing",
          calls: [
            { name: "write_note", args: { text: "a" } },
            { name: "write_note", args: { text: "b" } },
          ],
        },
        { text: "done" },
      ],
    });
    const { engine, executed, reviews } = makeEngine({ router });
    await engine.run("go");
    expect(reviews()).toBe(1);
    expect(executed).toEqual(["a", "b"]);
  });

  it("runs only the ticked items of a review", async () => {
    const router = new ScriptedRouter({
      desk: [
        {
          text: "writing",
          calls: [
            { name: "write_note", args: { text: "keep" } },
            { name: "write_note", args: { text: "drop" } },
          ],
        },
        { text: "done" },
      ],
    });
    const { engine, executed, registry } = makeEngine({ router, confirm: () => [true, false] });
    await engine.run("go");
    expect(executed).toEqual(["keep"]);
    expect(registry.receipts.filter((receipt) => receipt.status === "denied")).toHaveLength(1);
  });

  it("reports a tool error to the calling agent instead of throwing", async () => {
    const router = new ScriptedRouter({
      desk: [
        { text: "calling", calls: [{ name: "read_note", args: {} }] },
        { text: "recovered" },
      ],
    });
    const { engine, bus } = makeEngine({ router });
    const result = await engine.run("go");
    expect(result.halted).toBe(false);
    expect(bus.history().some((event) => event.kind === "tool.result" && event.data?.["error"])).toBe(false);
  });

  it("stops a delegation that goes deeper than the budget", async () => {
    const deep = {
      tools: [
        {
          name: "desk",
          function: { description: "Front", parameters: { type: "object", required: ["inquiry"], properties: { inquiry: { type: "string" } } } },
          instructions: "Pass it on.",
          tools: ["mech"],
        },
        {
          name: "mech",
          function: { description: "Mech", parameters: { type: "object", required: ["inquiry"], properties: { inquiry: { type: "string" } } } },
          instructions: "Pass it back.",
          tools: ["desk"],
        },
      ],
    };
    const router = new ScriptedRouter({
      desk: [{ text: "→", calls: [{ name: "mech", args: { inquiry: "x" } }] }, { text: "loop" }],
      mech: [{ text: "→", calls: [{ name: "desk", args: { inquiry: "y" } }] }, { text: "loop" }],
    });
    const { engine, bus } = makeEngine({ router, network: deep, limits: { maxDepth: 2 } });
    await engine.run("go");
    const errors = bus.history().filter((event) => event.kind === "tool.result" && event.data?.["error"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/Delegation stopped|hops/i);
  });

  it("keeps the conversation history bounded", async () => {
    const router = new ScriptedRouter({ desk: [{ text: "fine" }] });
    const { engine } = makeEngine({ router });
    await engine.run("hello");
    const result = await engine.run("again");
    expect(result.text).toBe("fine");
  });
});
