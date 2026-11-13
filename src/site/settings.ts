/**
 * Bring-your-own-key settings.
 *
 * The site publishes no funded endpoint, so this panel is the difference between a
 * replay and a conversation. The key is held in this origin's localStorage, is sent
 * only to the router the visitor chose, and can be deleted here.
 */

import {
  activeRouter,
  deleteProfiles,
  loadByok,
  routerPresets,
  saveProfile,
  type ByokProfile,
} from "../runtime/llm.js";
import { $, clear, h } from "./ui.js";

export interface SettingsDeps {
  onChange: () => void;
  currentLabel: () => string;
}

export class SettingsPanel {
  private deps: SettingsDeps;
  private drawer = $<HTMLElement>("#settings");
  private body = $<HTMLElement>("#settings-body");
  private open = false;

  constructor(deps: SettingsDeps) {
    this.deps = deps;
    $("#open-settings").addEventListener("click", () => this.toggle());
    $("#close-settings").addEventListener("click", () => this.toggle(false));
    this.render();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.drawer.classList.toggle("on", this.open);
    this.drawer.setAttribute("aria-hidden", String(!this.open));
    $("#open-settings").setAttribute("aria-pressed", String(this.open));
    if (this.open) $("#scrim").classList.add("on");
    else if (!$("#inspector").classList.contains("on")) $("#scrim").classList.remove("on");
    if (this.open) this.render();
  }

  render(): void {
    clear(this.body);
    const store = loadByok();
    const current = store.profiles.find((profile) => profile.id === store.selected) ?? store.profiles[0];
    const presets = routerPresets();

    const preset = h("select", { id: "preset" }, [
      h("option", { value: "", text: "Choose a provider…" }),
      ...presets.map((item) =>
        h("option", { value: item.label, text: `${item.label} — ${item.note}` }),
      ),
    ]);
    const baseUrl = h("input", {
      id: "base-url",
      type: "url",
      placeholder: "https://api.openai.com/v1",
      value: current?.baseUrl ?? "",
      spellcheck: "false",
    });
    const modelInput = h("input", {
      id: "model",
      type: "text",
      placeholder: "gpt-5.2",
      value: current?.model ?? "",
      spellcheck: "false",
    });
    const key = h("input", {
      id: "key",
      type: "password",
      placeholder: current?.key ? "•••••••• (saved)" : "sk-…",
      autocomplete: "off",
    });

    preset.addEventListener("change", () => {
      const found = presets.find((item) => item.label === preset.value);
      if (!found) return;
      baseUrl.value = found.baseUrl;
      modelInput.value = found.model;
    });

    const status = h("p", { class: "hint", text: `Active now: ${this.deps.currentLabel()}` });

    const save = h("button", { class: "btn primary", type: "button" }, ["Save and use"]);
    save.addEventListener("click", () => {
      const url = baseUrl.value.trim();
      if (!/^https?:\/\//.test(url)) {
        status.textContent = "The provider URL has to start with https:// (or http://127.0.0.1 for a local server).";
        return;
      }
      const profile: ByokProfile = {
        id: "byok",
        label: preset.value || new URL(url).hostname,
        baseUrl: url.replace(/\/+$/, ""),
        model: modelInput.value.trim() || "gpt-5.2",
        key: key.value,
      };
      saveProfile(profile);
      this.deps.onChange();
      this.render();
    });

    const replay = h("button", { class: "btn", type: "button" }, ["Use the replay instead"]);
    replay.addEventListener("click", () => {
      const storeNow = loadByok();
      storeNow.selected = null;
      try {
        localStorage.setItem("saddle.byok.v1", JSON.stringify(storeNow));
      } catch {
        // Storage is optional here.
      }
      this.deps.onChange();
      this.render();
    });

    const remove = h("button", { class: "btn warn", type: "button" }, ["Delete everything stored"]);
    remove.addEventListener("click", () => {
      deleteProfiles();
      this.deps.onChange();
      this.render();
    });

    this.body.append(
      h("div", { class: "note-box", text:
        "This site publishes no funded inference endpoint. Without a key it replays a recorded session through the real runtime: validation, delegation, actions, consent, receipts and budgets all run, only the words are canned." }),
      h("div", { class: "field-row" }, [h("label", { for: "preset", text: "Provider" }), preset]),
      h("div", { class: "field-row" }, [h("label", { for: "base-url", text: "Provider URL (OpenAI-compatible)" }), baseUrl]),
      h("div", { class: "field-row" }, [h("label", { for: "model", text: "Model" }), modelInput]),
      h("div", { class: "field-row" }, [
        h("label", { for: "key", text: "API key" }),
        key,
        h("p", { class: "hint", text:
          "Stored in this origin's localStorage and sent only to the provider URL above, in the Authorization header. It is never put in a URL, a prompt, a trace, an action argument or a peer request." }),
      ]),
      h("div", { class: "btn-row" }, [save, replay, remove]),
      status,
      h("h3", { class: "section-title", text: "Why a key at all" }),
      h("p", { class: "hint", text:
        "The agent graph is data, and inference is pluggable: the same published network runs on the replay, on your own router, or on any router the publisher funds. Nothing about the shop changes." }),
      h("h3", { class: "section-title", text: "CORS" }),
      h("p", { class: "hint", text:
        "A static page calls the router straight from the browser, so the router has to allow browser requests. OpenRouter, OpenAI and a local Ollama do. If one does not, the run stops with a visible error rather than silently failing." }),
    );

    const router = activeRouter();
    $("#router-name").textContent = router ? router.label : "replay";
    const dot = $("#router-dot");
    dot.classList.toggle("live", Boolean(router));
  }
}
