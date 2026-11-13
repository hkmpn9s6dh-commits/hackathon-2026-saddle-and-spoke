/**
 * Pluggable inference (MVP Profile 0.2, §4).
 *
 * The runtime talks to an OpenAI-compatible chat-completions router. The site
 * publishes a default router and model; a visitor may instead bring a router, a
 * model and a key. The key lives in this browser only, is attached to model
 * requests to the selected router only, and never appears in a URL, a manifest, a
 * prompt, an action argument, a trace, or a peer request.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

export interface RouterRequest {
  agent: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  model: string;
  temperature: number | null;
  signal?: AbortSignal;
}

export type RouterDelta =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; finishReason: string };

export interface Router {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly needsKey: boolean;
  stream(request: RouterRequest): AsyncIterable<RouterDelta>;
}

export class RouterError extends Error {
  readonly status: number | null;
  readonly hint: string;
  constructor(message: string, status: number | null = null, hint = "") {
    super(message);
    this.name = "RouterError";
    this.status = status;
    this.hint = hint;
  }
}

export interface RouterSettings {
  baseUrl: string;
  model: string;
  key: string;
}

function trimBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export class OpenAICompatibleRouter implements Router {
  readonly id = "openai-compatible";
  label = "Your router";
  needsKey = true;
  readonly settings: RouterSettings;

  constructor(settings: RouterSettings) {
    this.settings = { ...settings, baseUrl: trimBase(settings.baseUrl) };
  }

  get model(): string {
    return this.settings.model;
  }

  async *stream(request: RouterRequest): AsyncIterable<RouterDelta> {
    const url = `${this.settings.baseUrl}/chat/completions`;
    if (this.needsKey && this.settings.key.trim() === "") {
      throw new RouterError(
        "No key is set for this router.",
        401,
        "Open AI model settings and paste a key for your provider. The key stays in this browser.",
      );
    }
    const body = {
      model: request.model || this.settings.model,
      messages: request.messages.map((message) => {
        if (message.role === "tool") {
          return { role: "tool", content: message.content, tool_call_id: message.tool_call_id };
        }
        if (message.role === "assistant" && message.tool_calls?.length) {
          return { role: "assistant", content: message.content || null, tool_calls: message.tool_calls };
        }
        return { role: message.role, content: message.content };
      }),
      stream: true,
      ...(request.temperature === null ? {} : { temperature: request.temperature }),
      ...(request.tools.length > 0
        ? { tools: request.tools, tool_choice: "auto" }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.settings.key}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
        credentials: "omit",
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw new RouterError(
        `Could not reach ${new URL(url).origin} from this browser.`,
        null,
        "A static site calls the router directly, so the router must allow browser requests (CORS). Try OpenRouter, a local Ollama, or another OpenAI-compatible router that does.",
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const detail = text.slice(0, 300);
      throw new RouterError(
        `${new URL(url).origin} answered ${response.status}. ${detail}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "The router rejected the key. Check it in AI model settings."
          : "Check the provider URL and the model name.",
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // Some routers ignore `stream: true`. Accept a complete answer too.
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] }; finish_reason?: string }>;
      };
      const choice = data.choices?.[0];
      if (choice?.message?.content) yield { type: "text", text: choice.message.content };
      for (const call of choice?.message?.tool_calls ?? []) {
        yield { type: "tool_call", call: { ...call, id: call.id || `call_${call.function?.name ?? "x"}` } };
      }
      yield { type: "done", finishReason: choice?.finish_reason ?? "stop" };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new RouterError("The router returned no body.", null, "");
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    const calls = new Map<number, ToolCall>();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;
          let parsed: {
            choices?: Array<{
              delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }> };
              finish_reason?: string | null;
            }>;
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content) yield { type: "text", text: delta.content };
          for (const partial of delta?.tool_calls ?? []) {
            const index = partial.index ?? 0;
            const current = calls.get(index) ?? {
              id: partial.id ?? `call_${index}`,
              type: "function" as const,
              function: { name: "", arguments: "" },
            };
            if (partial.id) current.id = partial.id;
            if (partial.function?.name) current.function.name += partial.function.name;
            if (partial.function?.arguments) current.function.arguments += partial.function.arguments;
            calls.set(index, current);
          }
          if (!finished && choice?.finish_reason) {
            finished = true;
            for (const call of [...calls.values()]) {
              if (call.function.name) yield { type: "tool_call", call };
            }
            calls.clear();
            yield { type: "done", finishReason: choice.finish_reason };
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (!finished) {
      for (const call of calls.values()) if (call.function.name) yield { type: "tool_call", call };
      yield { type: "done", finishReason: calls.size > 0 ? "tool_calls" : "stop" };
    }
  }
}

export const BYOK_STORAGE_KEY = "saddle.byok.v1";

export interface ByokProfile {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  key: string;
}

interface ByokStore {
  profiles: ByokProfile[];
  selected: string | null;
  lastUsed: string | null;
}

const PRESETS: Array<{ label: string; baseUrl: string; model: string; note: string }> = [
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5.2", note: "allows browser calls" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.2", note: "allows browser calls" },
  { label: "Ollama (local)", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3:8b", note: "no key needed" },
  { label: "Otari", baseUrl: "https://api.otari.ai/api/v1", model: "alibaba/qwen-3.5-35b-a3b", note: "challenge sponsor" },
];

export function routerPresets(): typeof PRESETS {
  return PRESETS;
}

export function loadByok(): ByokStore {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return { profiles: [], selected: null, lastUsed: null };
    const parsed = JSON.parse(raw) as Partial<ByokStore>;
    return {
      profiles: Array.isArray(parsed.profiles) ? (parsed.profiles as ByokProfile[]) : [],
      selected: typeof parsed.selected === "string" ? parsed.selected : null,
      lastUsed: typeof parsed.lastUsed === "string" ? parsed.lastUsed : null,
    };
  } catch {
    return { profiles: [], selected: null, lastUsed: null };
  }
}

export function saveByok(store: ByokStore): void {
  try {
    localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode, or storage is full. The session still works.
  }
}

export function saveProfile(profile: ByokProfile): ByokStore {
  const store = loadByok();
  const index = store.profiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) store.profiles[index] = profile;
  else store.profiles.push(profile);
  store.selected = profile.id;
  store.lastUsed = profile.id;
  saveByok(store);
  return store;
}

export function deleteProfiles(): void {
  try {
    localStorage.removeItem(BYOK_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/** The active visitor router, if one is configured. */
export function activeRouter(): OpenAICompatibleRouter | null {
  const store = loadByok();
  const profile = store.profiles.find((item) => item.id === store.selected) ?? store.profiles[0];
  if (!profile) return null;
  const router = new OpenAICompatibleRouter({ baseUrl: profile.baseUrl, model: profile.model, key: profile.key });
  router.label = profile.label || new URL(profile.baseUrl).hostname;
  router.needsKey = !/^http:\/\/(127\.0\.0\.1|localhost)/.test(profile.baseUrl);
  return router;
}
