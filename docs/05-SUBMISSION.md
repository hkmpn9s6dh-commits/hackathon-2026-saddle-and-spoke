# 05 — Submission copy

Paste-ready text for the Devpost form. Every claim here is demonstrated in the video or
observable on the site.

## Project name

**Saddle & Spoke**

## Elevator pitch (tagline, 200 characters)

A bicycle workshop that publishes itself as an agent network. Describe a fault; the page
diagnoses it, prices it, and books the bench — and the drawing annotates itself as the
agents work.

## Inspiration

Every "agentic website" so far is a chatbot with a manifest stapled to the side. The
interesting sentence in the specification is the last one: *"one can conceive of agents
auto redesigning a web page as it is being used."* We wanted to know what that looks like
when the page is not a shop front but a document — so we built a repair workshop whose job
sheet is written by three agents while you watch, and whose drawing points at the part it
is talking about.

The domain came second, and on purpose. A small workshop is exactly the business that the
agentic web should help and that no platform serves: two people, two benches, open nine
hours a week, with prices in a head and stock on a shelf. It also happens to be a real
multi-agent problem — intake, diagnosis, parts availability and the diary are four
different jobs with four different sources of truth.

## What it does

You type "third gear jumps when I push hard uphill". The front desk hands it to the
mechanic, who reads the shop's own catalogue and job sheet before saying anything. Two
findings appear on the sheet. A balloon lands on the chain and another on the 50-tooth
ring, and a legend underneath says what is on the shelf and what is not.

The mechanic asks the parts desk for the ring. The parts desk finds the shelf empty and
asks **Spare Room**, a parts co-op on a *different origin*, which answers with a bin count,
a lead time and a trade price — and is told nothing about the customer. That network is
fetched over CORS, after you approve the contact, and runs in your browser on your model.

Every line on the sheet arrives through a registered site action with a JSON Schema and an
effect. Writes are batched into one review sheet per turn, showing each action, its
arguments, the destination origin and an argument hash; you can untick any of them. The
booking is irreversible, so it always asks, and it returns a receipt that is bound to the
exact proposal you approved. The visitor's name and phone are typed into the visitor's own
form and never enter the prompt.

Then the stamp lands.

## How we built it

A TypeScript runtime written for this site, no framework and no runtime dependencies:

- **Publish** — `agent-manifest.json`, a resolved data-only network, `links.json`, and a
  peer site that publishes the *same* graph twice, once as HOCON and once as JSON, to prove
  the format is portable in both directions.
- **Parse and validate** before any model call: duplicate agents, missing front agent, dead
  references, executable tool definitions and unresolved symbolic peers are all refused,
  with the reason shown. The validator also reads a HOCON subset, refusing `include` and
  `${…}` because a published network may not use them.
- **Run** — a streaming agent loop with delegation, tool calls, error propagation, bounded
  history, and five budgets (steps, depth, peer calls, concurrency, elapsed time).
- **Act** — ten registered site actions with JSON Schema, effect classification, batched
  review, receipts bound to the reviewed arguments, and an *unknown* outcome — never a
  retry — when a write does not come back.
- **Compose** — the peer protocol from §3.2: consent per origin, exact name match or
  failure, the peer's own router ignored, no credential in any cross-origin request.
- **Protect** — private context is deny-by-default and destination-scoped. The co-op may be
  told the shop's trade account and nothing else, and the Inspector shows what was withheld.
- **Show** — the Inspector reports the seven interoperability checks from §6 with the
  evidence it observed in this session, and four buttons that drive the runtime into real
  refusals: an invalid network, a composition cycle, an over-budget run and a denied origin.

The visual layer is one hand-authored SVG of a road bicycle, three self-hosted fonts and a
paper palette. No images, no icon library, 100 KB of JavaScript, one page.

## Challenges

**No funded endpoint, and no pretending.** A workshop cannot pay for inference, so the site
publishes none. Rather than ship a demo that dies without an API key, the default path is a
replay router that implements the same interface as the live one: validation, delegation,
actions, consent, receipts and budgets all run for real, and only the sentences are
recorded. The badge says `replay`, the panel says it, and this text says it.

**Confirmation fatigue versus user-owned writes.** The specification requires the visitor to
see a write before it happens. A diagnosis produces five writes, so a literal reading gives
you five dialogs and an unusable demo. We batch all writes from one turn into a single
review sheet with per-item ticks and one explicit "approve the rest of this job" choice —
and an irreversible action still always asks.

**Making "agent acts on the page" legible.** A highlight that follows a chat message is a
gimmick. The callout had to read like a service manual: numbered balloons in place, a legend
underneath, and the drawing stepping back only while the agent points.

## What we learned

The hard part of the agentic web is not the model. It is deciding, in public data, who is
allowed to know what. Every interesting design decision in this build was a disclosure
decision: which fields may cross an origin, which writes a human must see first, which
failures must be reported as unknown rather than retried.

## What's next

The runtime is generic — the same code would run any published network. The next step is a
second shop on the network (a framebuilder, a wheel builder) so the peer protocol is used
for what it is for: a customer's agent assembling a service out of several small businesses
without either of them learning more than it needs to.

## Built with

TypeScript · Vite · Vitest · Playwright · the Open Agentic Web minimum viable specification
(MVP Profile 0.2) · no runtime dependencies · no third-party scripts

## Try it

- Site: https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/
- Source: https://github.com/hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke (MIT)
- Conformance checker for other entrants: `/check/` on the same site
- Peer site: …/peer/ on jsDelivr (a different origin, by design)
