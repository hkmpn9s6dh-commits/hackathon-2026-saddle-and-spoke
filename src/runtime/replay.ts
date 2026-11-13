/**
 * A replay router.
 *
 * A static site cannot pay for inference, and a visitor should be able to see the
 * whole thing work before finding an API key. This router is a browser-local
 * inference stub: it replays a recorded session, one step per model call, and the
 * runtime around it is the real one. Validation, delegation, action dispatch,
 * consent, receipts and budgets all run for real; only the words come from a file.
 *
 * It is labelled as a replay everywhere it is shown, and the site never presents it
 * as a model.
 */

import type { ChatMessage, Router, RouterDelta, RouterRequest } from "./llm.js";

export interface ReplayCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ReplayStep {
  text?: string;
  calls?: ReplayCall[];
  /** Used when the previous tool result says the visitor declined or the outcome is unknown. */
  onRefusal?: { text?: string; calls?: ReplayCall[] };
}

export interface ReplayScenario {
  id: string;
  label: string;
  /** What the visitor would have typed. */
  complaint: string;
  /** One line shown on the chip. */
  chip: string;
  scripts: Record<string, ReplayStep[]>;
}

function lastToolContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "tool") return message.content;
    if (message.role === "user") break;
  }
  return "";
}

function refused(content: string): boolean {
  return /declined|unknown|did not|failed|not run|Nothing was changed/i.test(content);
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export class ReplayRouter implements Router {
  readonly id = "replay";
  readonly label = "Replay";
  readonly needsKey = false;
  readonly model = "recorded-session";
  readonly scenario: ReplayScenario;
  /** Every agent name this router has a script for. */
  readonly scripts: Record<string, ReplayStep[]>;

  constructor(scenario: ReplayScenario) {
    this.scenario = scenario;
    this.scripts = scenario.scripts;
  }

  async *stream(request: RouterRequest): AsyncIterable<RouterDelta> {
    const script = this.scripts[request.agent];
    if (!script || script.length === 0) {
      yield { type: "text", text: `(The replay has no script for ${request.agent}.)` };
      yield { type: "done", finishReason: "stop" };
      return;
    }
    const turnIndex = request.messages.filter((message) => message.role === "assistant").length;
    // Past the end of the script the agent has nothing left to say. Repeating the last
    // step would re-issue its tool calls, which is how a demo ends up adding the same
    // part to the bench three times.
    const step = script[turnIndex] ?? { text: "" };
    const useRefusal = refused(lastToolContent(request.messages)) && step.onRefusal;
    const chosen = useRefusal ? step.onRefusal! : step;

    const text = chosen.text ?? "";
    if (text) {
      const size = 16;
      for (let i = 0; i < text.length; i += size) {
        if (request.signal?.aborted) throw new DOMException("aborted", "AbortError");
        yield { type: "text", text: text.slice(i, i + size) };
        await pause(text.length > 120 ? 7 : 12, request.signal);
      }
    }

    for (const [index, call] of (chosen.calls ?? []).entries()) {
      yield {
        type: "tool_call",
        call: {
          id: `replay_${request.agent}_${turnIndex}_${index}`,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        },
      };
    }
    yield { type: "done", finishReason: chosen.calls?.length ? "tool_calls" : "stop" };
  }
}
