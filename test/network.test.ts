import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildNetwork, peerNetworkName, peerSiteBase } from "../src/runtime/network.js";
import { parseHocon, parseNetworkSource } from "../src/runtime/hocon.js";

const networkFile = readFileSync(new URL("../public/saddle_and_spoke.network.json", import.meta.url), "utf8");
// A clone on Windows may check these out with CRLF, which is not part of the data.
const peerHocon = readFileSync(new URL("../peer/spare_room.hocon", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const peerJson = readFileSync(new URL("../peer/spare_room.network.json", import.meta.url), "utf8");
const broken = readFileSync(new URL("../public/lab/broken.network.json", import.meta.url), "utf8");

const ACTIONS = [
  "read_job",
  "read_catalogue",
  "highlight_part",
  "record_finding",
  "add_part_to_bench",
  "quote_labour",
  "propose_slot",
  "book_dropoff",
  "order_part",
  "lookup_job",
];

describe("the published network", () => {
  const parsed = parseNetworkSource(networkFile);

  it("is JSON and parses as JSON", () => {
    expect(parsed.format).toBe("json");
  });

  it("validates, with three agents and a front agent", () => {
    const { model, issues } = buildNetwork({
      name: "saddle_and_spoke",
      frontMan: "front_desk",
      description: "",
      document: parsed.data,
      sourceFormat: parsed.format,
      linkedNames: ["spare_room"],
      actionNames: ACTIONS,
    });
    expect(issues.errors).toEqual([]);
    expect(model?.agents.size).toBe(3);
    expect(model?.frontMan).toBe("front_desk");
  });

  it("resolves site actions and the symbolic peer, in that order", () => {
    const { model } = buildNetwork({
      name: "saddle_and_spoke",
      frontMan: "front_desk",
      description: "",
      document: parsed.data,
      sourceFormat: parsed.format,
      linkedNames: ["spare_room"],
      actionNames: ACTIONS,
    });
    const parts = model!.agents.get("parts_desk")!;
    expect(parts.tools.filter((tool) => tool.kind === "peer").map((tool) => tool.name)).toEqual(["spare_room"]);
    expect(parts.tools.some((tool) => tool.kind === "action" && tool.name === "read_catalogue")).toBe(true);
    expect(parts.tools.some((tool) => tool.kind === "agent")).toBe(false);
  });

  it("refuses a symbolic reference that nothing binds", () => {
    const { model, issues } = buildNetwork({
      name: "saddle_and_spoke",
      frontMan: "front_desk",
      description: "",
      document: parsed.data,
      sourceFormat: parsed.format,
      linkedNames: [],
      actionNames: ACTIONS,
    });
    expect(model).toBeNull();
    expect(issues.errors.join(" ")).toContain("neither an agent here");
  });
});

describe("rejection, before any model call", () => {
  it("rejects the fixture with a duplicate agent, a missing front agent and a dead reference", () => {
    const { model, issues } = buildNetwork({
      name: "broken",
      frontMan: "does_not_exist",
      description: "",
      document: JSON.parse(broken),
      sourceFormat: "json",
      actionNames: ACTIONS,
      linkedNames: [],
    });
    expect(model).toBeNull();
    const text = issues.errors.join("\n");
    expect(text).toContain("defined more than once");
    expect(text).toContain('front agent "does_not_exist" is not one of the published agents');
    expect(text).toContain("ghost_agent");
  });

  it("rejects an executable tool definition instead of running it", () => {
    const { model, issues } = buildNetwork({
      name: "x",
      frontMan: "a",
      description: "",
      document: {
        tools: [
          {
            name: "a",
            function: { description: "A" },
            instructions: "A",
            tools: [{ class: "SomeTool", python: "some.module" }],
          },
        ],
      },
      sourceFormat: "json",
      actionNames: [],
      linkedNames: [],
    });
    expect(model).toBeNull();
    expect(issues.errors.join(" ")).toContain("unsupported executable definition");
  });

  it("rejects an agent that lists itself", () => {
    const { model, issues } = buildNetwork({
      name: "x",
      frontMan: "a",
      description: "",
      document: { tools: [{ name: "a", function: { description: "A" }, instructions: "A", tools: ["a"] }] },
      sourceFormat: "json",
      actionNames: [],
      linkedNames: [],
    });
    expect(model).toBeNull();
    expect(issues.errors.join(" ")).toContain("lists itself");
  });

  it("rejects a front agent that is not published", () => {
    const { model, issues } = buildNetwork({
      name: "x",
      frontMan: "nobody",
      description: "",
      document: { tools: [{ name: "a", function: { description: "A" }, instructions: "A" }] },
      sourceFormat: "json",
      actionNames: [],
      linkedNames: [],
    });
    expect(model).toBeNull();
    expect(issues.errors.join(" ")).toContain("front agent");
  });
});

describe("HOCON", () => {
  it("parses the peer's canonical HOCON", () => {
    const value = parseHocon(peerHocon) as Record<string, unknown>;
    expect(Array.isArray(value["tools"])).toBe(true);
    expect((value["tools"] as unknown[]).length).toBe(2);
  });

  it("gives the same graph as the JSON serialisation", () => {
    const fromHocon = parseHocon(peerHocon);
    const fromJson = JSON.parse(peerJson.replace(/\r\n/g, "\n"));
    expect(fromHocon).toEqual(fromJson);
  });

  it("keeps both peer agents and the delegation link", () => {
    const { model, issues } = buildNetwork({
      name: "spare_room",
      frontMan: "counter",
      description: "",
      document: parseHocon(peerHocon),
      sourceFormat: "hocon",
      actionNames: [],
      linkedNames: [],
    });
    expect(issues.errors).toEqual([]);
    expect([...model!.agents.keys()]).toEqual(["counter", "catalogue"]);
    expect(model!.agents.get("counter")!.tools).toEqual([{ kind: "agent", name: "catalogue" }]);
  });

  it("reads comments, path keys and triple-quoted strings", () => {
    const value = parseHocon(`
      # a comment
      // another
      a.b = 1
      c = """two
lines"""
      d = [ 1, 2, 3 ]
      e = true
    `) as Record<string, unknown>;
    expect(value["a"]).toEqual({ b: 1 });
    expect(value["c"]).toBe("two\nlines");
    expect(value["d"]).toEqual([1, 2, 3]);
    expect(value["e"]).toBe(true);
  });

  it("refuses an include, which a published network may not use", () => {
    expect(() => parseHocon(`{ include "other.conf" }`)).toThrow(/include/);
  });

  it("refuses an unresolved substitution", () => {
    expect(() => parseHocon(`{ a = \${HOME} }`)).toThrow(/substitution/);
  });
});

describe("peer URLs", () => {
  it("takes the last path component as the network name", () => {
    expect(peerNetworkName("https://peer.example/agents/transit")).toBe("transit");
    expect(peerNetworkName("https://cdn.jsdelivr.net/gh/u/r@main/peer/spare_room")).toBe("spare_room");
  });

  it("takes everything before it as the site base", () => {
    expect(peerSiteBase("https://peer.example/agents/transit")).toBe("https://peer.example/agents/");
    expect(peerSiteBase("https://peer.example/transit")).toBe("https://peer.example/");
  });
});
