/**
 * A minimal MCP client over streamable HTTP.
 *
 * The profile names MCP as the baseline interface for tools and data, and requires
 * approval before discovering or calling a third-party MCP service. This client
 * speaks JSON-RPC 2.0 to a single endpoint, and fails closed: an unreachable or
 * unauthorized server produces an error the invoking agent can report, never a
 * silently empty result.
 */

import type { TraceBus } from "./trace.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpClientOptions {
  trace: TraceBus;
  consent: (request: { origin: string; purpose: string }) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

export class McpClient {
  private trace: TraceBus;
  private consent: McpClientOptions["consent"];
  private fetchImpl: typeof fetch;
  private sessions = new Map<string, string>();
  private counter = 0;

  constructor(options: McpClientOptions) {
    this.trace = options.trace;
    this.consent = options.consent;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  private async approve(url: string, purpose: string): Promise<void> {
    const origin = new URL(url).origin;
    const ok = await this.consent({ origin, purpose });
    if (!ok) throw new McpError(`You declined contact with the MCP server at ${origin}.`);
  }

  private async rpc(url: string, method: string, params: unknown): Promise<unknown> {
    const id = ++this.counter;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    const session = this.sessions.get(url);
    if (session) headers["mcp-session-id"] = session;

    this.trace.emit("net.request", "runtime", `MCP ${method} → ${url}`, { method, credentials: "omit" });
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    } catch {
      throw new McpError(`${new URL(url).origin} could not be reached from this browser.`);
    }
    const returnedSession = response.headers.get("mcp-session-id");
    if (returnedSession) this.sessions.set(url, returnedSession);
    if (!response.ok) {
      throw new McpError(`The MCP server answered ${response.status} to ${method}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let payload: JsonRpcResponse | null = null;
    if (contentType.includes("text/event-stream")) {
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as JsonRpcResponse;
          if (parsed.id === id || parsed.result !== undefined || parsed.error !== undefined) payload = parsed;
        } catch {
          // Skip keep-alive frames.
        }
      }
    } else {
      try {
        payload = JSON.parse(text) as JsonRpcResponse;
      } catch {
        throw new McpError(`The MCP server's answer to ${method} was not JSON.`);
      }
    }
    if (!payload) throw new McpError(`The MCP server sent nothing usable for ${method}.`);
    if (payload.error) throw new McpError(`${method} failed: ${payload.error.message}`);
    return payload.result;
  }

  async list(url: string): Promise<McpTool[]> {
    await this.approve(url, "list the tools on this MCP server");
    await this.rpc(url, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "saddle-and-spoke-runtime", version: "1.0.0" },
    }).catch((error: unknown) => {
      throw new McpError(`The MCP handshake failed: ${(error as Error).message}`);
    });
    const result = (await this.rpc(url, "tools/list", {})) as { tools?: McpTool[] };
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async call(url: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.approve(url, `call the tool "${name}"`);
    const result = (await this.rpc(url, "tools/call", { name, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result?.content ?? [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    if (result?.isError) throw new McpError(text || `The tool "${name}" reported an error.`);
    return text || result;
  }
}
