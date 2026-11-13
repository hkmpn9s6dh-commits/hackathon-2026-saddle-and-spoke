/**
 * The two places the runtime stops and asks the visitor.
 *
 * Neither dialog is decorative: `askApproval` decides whether a write reaches its
 * handler, and `askConsent` decides whether a third-party origin is contacted at
 * all. Both are serialised, so two agents cannot stack modals.
 */

import type { ActionProposal } from "../runtime/actions.js";
import type { PeerConsentRequest } from "../runtime/peer.js";
import { $, clear, h, pretty } from "./ui.js";

const modal = $<HTMLDivElement>("#modal");
const title = $<HTMLHeadingElement>("#modal-title");
const sub = $<HTMLParagraphElement>("#modal-sub");
const body = $<HTMLDivElement>("#modal-body");
const actions = $<HTMLDivElement>("#modal-actions");

let queue: Promise<unknown> = Promise.resolve();
/** A visitor may stop the per-turn review for the rest of this job. Never for bookings. */
let trusted = false;

export function editsTrusted(): boolean {
  return trusted;
}

export function resetTrust(): void {
  trusted = false;
}
let resolver: ((value: boolean) => void) | null = null;

type Answer = boolean | boolean[];
let answerResolver: ((value: Answer) => void) | null = null;

function close(value: boolean): void {
  modal.classList.remove("on");
  const resolve = resolver;
  resolver = null;
  if (resolve) resolve(value);
  const answer = answerResolver;
  answerResolver = null;
  answer?.(value);
}

function closeAll(values: boolean[]): void {
  modal.classList.remove("on");
  const resolve = resolver;
  resolver = null;
  if (resolve) resolve(values.some(Boolean));
  const answer = answerResolver;
  answerResolver = null;
  answer?.(values);
}

modal.addEventListener("click", (event) => {
  if (event.target === modal) close(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("on")) close(false);
});

function presentList(build: () => void): Promise<boolean[]> {
  const run = () =>
    new Promise<boolean[]>((resolve) => {
      clear(body);
      clear(actions);
      answerResolver = resolve as (value: Answer) => void;
      build();
      modal.classList.add("on");
      actions.querySelector<HTMLButtonElement>("button.primary, button")?.focus();
    });
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

function present(build: () => void): Promise<boolean> {
  const run = () =>
    new Promise<boolean>((resolve) => {
      clear(body);
      clear(actions);
      resolver = resolve;
      build();
      modal.classList.add("on");
      const first = actions.querySelector<HTMLButtonElement>("button.primary, button");
      first?.focus();
    });
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export interface ApprovalOptions {
  collectContact?: boolean;
  onSubmit?: (contact: { name: string; phone: string; serial: string }) => void;
}

export function askApproval(proposal: ActionProposal, options: ApprovalOptions = {}): Promise<boolean> {
  return present(() => {
    title.textContent = proposal.effect === "irreversible" ? "Confirm this booking" : "Approve this change";
    sub.textContent = `${proposal.action} · ${proposal.effect} · ${proposal.requestId}`;
    body.append(
      h("p", { text: proposal.effect === "irreversible"
        ? "This is irreversible. The runtime will send exactly what is shown below, and the receipt is bound to this request."
        : "The agent wants to change the job sheet. The runtime sends exactly what is shown below." }),
      h("p", { class: "sub", text: proposal.description }),
      h("pre", { class: "args", text: pretty(proposal.arguments) }),
      h("p", { class: "hint", text: `Goes to: ${proposal.origin} · arguments hash ${proposal.argsHash}` }),
    );
    let nameInput: HTMLInputElement | null = null;
    let phoneInput: HTMLInputElement | null = null;
    let serialInput: HTMLInputElement | null = null;
    if (options.collectContact) {
      nameInput = h("input", { type: "text", placeholder: "Your name", autocomplete: "name", maxlength: "60" });
      phoneInput = h("input", { type: "tel", placeholder: "Phone, for the reminder", autocomplete: "tel", maxlength: "30" });
      serialInput = h("input", { type: "text", placeholder: "Frame number (optional)", maxlength: "40" });
      body.append(
        h("div", { class: "field-row" }, [h("label", { text: "Your details" }), nameInput]),
        h("div", { class: "field-row" }, [phoneInput]),
        h("div", { class: "field-row" }, [serialInput]),
        h("p", { class: "hint", text:
          "These stay in this browser. The parts co-op never receives them; only the shop's trade account leaves this site." }),
      );
    }
    const approve = h("button", { class: "btn primary", type: "button" }, [
      proposal.effect === "irreversible" ? "Approve and send" : "Approve",
    ]);
    approve.addEventListener("click", () => {
      if (options.collectContact) {
        const name = nameInput?.value.trim() ?? "";
        const phone = phoneInput?.value.trim() ?? "";
        if (name === "" || phone === "") {
          nameInput?.focus();
          return;
        }
        options.onSubmit?.({ name, phone, serial: serialInput?.value.trim() ?? "" });
      }
      close(true);
    });
    actions.append(
      h("button", { class: "btn", type: "button", onclick: () => close(false) }, ["Decline"]),
      approve,
    );
  });
}


/**
 * One review sheet per turn.
 *
 * The profile requires the visitor to see the destination and the arguments before a
 * write. An agent often proposes three edits to the same job sheet in one turn, so
 * they are shown together, each with its own effect, arguments and hash — and each
 * can be unchecked. Approving runs exactly the checked ones.
 */
export function askReview(proposals: ActionProposal[], options: ApprovalOptions = {}): Promise<boolean[]> {
  return presentList(() => {
    const answers: boolean[] = proposals.map(() => true);
    const irreversible = proposals.some((proposal) => proposal.effect === "irreversible");
    title.textContent =
      proposals.length === 1
        ? irreversible
          ? "Confirm this booking"
          : "Approve this change"
        : `Review ${proposals.length} changes`;
    sub.textContent = `job sheet · ${proposals[0]?.requestId ?? ""}${proposals.length > 1 ? " · and others" : ""}`;

    body.append(
      h("p", {
        text: irreversible
          ? "One of these cannot be undone. The runtime sends exactly what is shown, and each receipt is bound to the request it came from."
          : "The agent wants to write on the job sheet. Nothing is sent until you approve.",
      }),
    );

    proposals.forEach((proposal, index) => {
      const tick = h("input", { type: "checkbox", checked: true, id: `approve-${index}` });
      tick.addEventListener("change", () => {
        answers[index] = tick.checked;
      });
      body.append(
        h("div", { class: "review-item" }, [
          h("div", { class: "review-head" }, [
            tick,
            h("label", { for: `approve-${index}`, class: "review-name", text: proposal.action }),
            h("span", { class: `effect ${proposal.effect}`, text: proposal.effect }),
          ]),
          h("p", { class: "review-desc", text: proposal.description }),
          h("pre", { class: "args", text: pretty(proposal.arguments) }),
          h("p", { class: "hint", text: `to ${proposal.origin} · hash ${proposal.argsHash} · ${proposal.requestId}` }),
        ]),
      );
    });

    let nameInput: HTMLInputElement | null = null;
    let phoneInput: HTMLInputElement | null = null;
    let serialInput: HTMLInputElement | null = null;
    if (options.collectContact) {
      nameInput = h("input", { type: "text", placeholder: "Your name", autocomplete: "name", maxlength: "60" });
      phoneInput = h("input", { type: "tel", placeholder: "Phone, for the reminder", autocomplete: "tel", maxlength: "30" });
      serialInput = h("input", { type: "text", placeholder: "Frame number (optional)", maxlength: "40" });
      body.append(
        h("div", { class: "field-row" }, [h("label", { text: "Your details" }), nameInput]),
        h("div", { class: "field-row" }, [phoneInput]),
        h("div", { class: "field-row" }, [serialInput]),
        h("p", { class: "hint", text:
          "These stay in this browser. The parts co-op never receives them; only the shop's trade account leaves this site." }),
      );
    }

    const approve = h("button", { class: "btn primary", type: "button" }, [
      proposals.length === 1 ? (irreversible ? "Approve and send" : "Approve") : "Approve checked",
    ]);
    approve.addEventListener("click", () => {
      if (options.collectContact) {
        const name = nameInput?.value.trim() ?? "";
        const phone = phoneInput?.value.trim() ?? "";
        if (name === "" || phone === "") {
          nameInput?.focus();
          return;
        }
        options.onSubmit?.({ name, phone, serial: serialInput?.value.trim() ?? "" });
      }
      closeAll(answers);
    });
    if (!irreversible) {
      const trust = h("input", { type: "checkbox", id: "trust-edits" });
      body.append(
        h("div", { class: "field-row" }, [
          h("label", { for: "trust-edits" }, [
            trust,
            " Approve the rest of this job's edits without asking (a booking still asks)",
          ]),
        ]),
      );
      trust.addEventListener("change", () => {
        trusted = trust.checked;
      });
    }

    actions.append(
      h("button", { class: "btn", type: "button", onclick: () => closeAll(proposals.map(() => false)) }, [
        proposals.length === 1 ? "Decline" : "Decline all",
      ]),
      approve,
    );
  });
}
export function askConsent(request: PeerConsentRequest): Promise<boolean> {
  return present(() => {
    title.textContent = `Contact ${new URL(request.origin).host}?`;
    sub.textContent = `peer network · ${request.network} · ${request.origin}`;
    body.append(
      h("p", { text: `Another site is about to be contacted from this page: ${request.origin}.` }),
      h("p", { class: "sub", text: `Purpose: ${request.purpose}.` }),
      h("p", { text: request.note }),
      h("div", { class: "note-box", text:
        "Only the public files are requested: agent-manifest.json, the network definition and links.json. No key, no cookie, and no private field is sent." }),
      h("p", { class: "hint", text: request.url }),
    );
    actions.append(
      h("button", { class: "btn", type: "button", onclick: () => close(false) }, ["Do not contact"]),
      h("button", { class: "btn primary", type: "button", onclick: () => close(true) }, ["Contact once"]),
    );
  });
}

/** A plain message dialog, used when a run fails before any agent speaks. */
export function tell(subtitle: string, message: string): void {
  void present(() => {
    title.textContent = "The runtime stopped";
    sub.textContent = subtitle;
    body.append(h("p", { text: message }));
    actions.append(h("button", { class: "btn primary", type: "button", onclick: () => close(true) }, ["Close"]));
  });
}
