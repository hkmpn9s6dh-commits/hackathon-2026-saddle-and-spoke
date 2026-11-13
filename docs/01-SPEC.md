# 01 — SPEC

Gate A. What we are building, how it will be judged, and the conditions that decide
whether it is finished. Written before the build; after this file is agreed the scope
only shrinks.

## 1. The official brief, quoted

From the Devpost page for the Open Agentic Web Challenge (fetched 2026-11-13):

> **Judging Criteria**
>
> **Technological Implementation** — How well is the project built, and how effectively
> does it use the open agentic web specification?
>
> **Design** — Does the project deliver a complete, coherent product experience not
> just a technical proof of concept?
>
> **Potential Impact** — Does the project make a credible, specific case for solving a
> real problem for a real audience and does the solution actually address it based on
> what's demonstrated? Does it include any tools or services the Entrant built and
> shared with the community?
>
> **Quality of the Idea** — Is this a creative, non-obvious use of an open agentic
> website and does the team show genuine understanding of the problem space?

> **What to Submit** — Provide the URL to your (public) open agentic web site. It must
> contain: a publicly accessible conforming `.json` file that describes an agent network
> and its capabilities; a `runtime` file that can run the agent network in the browser;
> an interface that allows users or agents to interact with the agent network; an
> optional interface that allows users to configure LLMs and keys to be used by the
> agents; the agent network should be able to interact with the website, optionally with
> other agentic websites, and/or be called by other agentic websites.

Deadline: **2027-01-11 16:00 UTC** (2027-01-12 00:00 Beijing). Prizes: $5,000 / $3,000 /
$2,000, plus Mozilla Otari credits.

The conformance target is `docs/worldwide_agentic_web_mvp_spec.md`, MVP Profile 0.2
(2026-11-06), from `github.com/cognizant-ai-labs/agentic-web`. §6 of that document lists
seven interoperability checks, and they are the acceptance criteria of this build.

## 2. The site

**Saddle & Spoke** — a two-bench bicycle workshop at 11 Quay Street, Saltcoats, open
Thursday evening and Saturday morning. One page. The page is the shop:

- **The drawing.** A hand-authored line drawing of a road bicycle. When an agent names a
  part, the drawing steps back, a numbered balloon lands on the part, and a legend
  underneath says what it is, what is in stock and what it costs.
- **The job sheet.** A paper document on the right. The complaint goes in first; then
  findings, parts, labour, a held slot and a total appear as agents work. Nothing on it
  is written by a model directly — every line arrives through a registered site action
  with a schema, an effect and a receipt.
- **The bench.** Parts the workshop sets aside appear under the drawing with their bin
  code, price and whether they came off the shelf or from the co-op.
- **The counter.** A single composer. The front desk answers there, in two or three
  sentences, and asks for the booking.
- **The Inspector.** The runtime's own view: the seven conformance checks with live
  evidence, the trace, the published network, the private-context rules, and the
  receipts. Four buttons deliberately drive the runtime into a refusal.

The network: `front_desk` (front agent) → `workshop_lead` → `parts_desk` → peer
`spare_room`, a parts co-op on a **different origin** that answers stock, lead time and
trade price and never learns who the customer is.

## 3. Why this, against the four criteria

**Technological Implementation.** The runtime is written for this site in TypeScript and
does the whole job in the browser: parse and validate a network before any model call;
run a streaming agent loop with delegation, tool calls and error propagation; dispatch
registered site actions with JSON Schema validation, effect classification, a review
sheet and receipts; load a peer network from another origin and run it here; filter
private context at the boundary; enforce five kinds of budget. It reads both JSON and
HOCON. The Inspector shows all of it, and the four refusal buttons are the proof.

**Design.** One surface, no chat window with a site hiding behind it. The document is the
product: a typeset job sheet that fills in, a technical drawing that annotates itself,
and a stamp when the bench is booked. The whole thing is one page, 100 KB of JavaScript,
three self-hosted fonts and no images.

**Potential Impact.** A small workshop cannot afford a platform. Today its prices,
stock and diary are locked inside a booking site, a phone call and a paper pad. If it
publishes its service as an agent network, any assistant — the customer's own — can ask
"my third gear skips, can you fix it before Saturday, and what will it cost" and get a
real answer with a real slot. The build also ships a **conformance checker** for other
entrants (see §5), which is the "tools or services shared with the community" the
brief asks about.

**Quality of the Idea.** Agent sites are mostly chatbots with a manifest stapled on. This
one is a *document* that agents fill in, on a page that annotates itself, with a peer
that is only allowed to know one field. The domain was chosen because the work is
genuinely a multi-agent problem: intake, diagnosis, parts availability and the diary are
four different jobs with four different sources of truth.

## 4. Demo script (written first; the video follows it)

| # | Time | On screen | What it proves |
| --- | --- | --- | --- |
| 1 | 0:00 | The bench, empty. "This is a workshop's website. There is no chat window." | Design |
| 2 | 0:06 | Type: "Third gear jumps when I push hard uphill." Two findings appear; balloons land on chain and chainring; the legend names stock and price. | The page is written by agents; the drawing annotates itself |
| 3 | 0:24 | The review sheet: three changes, each with its arguments, hash and effect. Approve. | User-owned writes |
| 4 | 0:34 | Consent: "Contact cdn.jsdelivr.net?" with the fields that stay behind. Approve. | Peer protocol, consent, private context |
| 5 | 0:44 | Labour lines and Saturday 10:15 appear. Booking dialog asks for a name and phone — typed into the visitor's own form, not the prompt. Approve; the stamp lands; receipt SS-0417-… | Irreversible action with a receipt |
| 6 | 1:00 | Inspector → Checks. Run the suite: 6 of 7 green with live evidence. Press the four refusal buttons: invalid network, cycle, over budget, denied origin. 7 of 7. | Conformance, observed not asserted |
| 7 | 1:24 | Settings: paste a key, choose a model. "The same network, on your router." | Pluggable inference |
| 8 | 1:34 | The peer's own page, on the other origin. "It answers agents, and it never sees a name." | The open agentic web is more than one site |

Total 1:40, inside the two-minute limit, with the entrant speaking over it.

## 5. The community tool

`/check/` on the same origin is a **conformance checker** any entrant can point at their
own site: it fetches the manifest, resolves an exact network name, validates the
definition, checks CORS, and reports which of the seven checks it can observe from the
outside. It is the same code the Inspector runs, minus the parts that need the site's own
runtime. Published as a page, documented in the README, MIT licensed with the rest.

## 6. Acceptance criteria

Each is decidable by a command, and each has evidence in `proof/`.

| # | Criterion | Decided by |
| --- | --- | --- |
| AC-1 | The site publishes `agent-manifest.json`, `links.json` and a validated network with three agents and a named front agent | `test/network.test.ts`; `GET /agent-manifest.json` |
| AC-2 | The published network is data only; `include` and `${…}` are refused | `test/network.test.ts` (HOCON suite) |
| AC-3 | A malformed network is refused before any model call: duplicate agent, missing front agent, dead reference, executable tool | `test/network.test.ts`; e2e "invalid network" |
| AC-4 | A visitor can go from a complaint to a booked slot on one page | `scripts/e2e.mjs` |
| AC-5 | Every write is reviewed with destination, arguments and hash; a refusal changes nothing and is receipted | `test/runtime.test.ts`; e2e "declined booking" |
| AC-6 | A booking returns a receipt bound to the proposal; the sheet is stamped | e2e |
| AC-7 | A peer origin is contacted only after consent that names the origin and purpose | e2e |
| AC-8 | The peer runs in the caller's browser with the caller's router; its own router is ignored; no credential is sent to it | e2e request log; `peer.loaded` trace |
| AC-9 | Private context is deny-by-default; only named fields reach the peer | `test/runtime.test.ts`; Inspector → Privacy |
| AC-10 | Execution is bounded: steps, depth, peer calls, concurrency, time | `test/runtime.test.ts`; e2e "over budget" |
| AC-11 | A composition cycle is stopped with a visible error | e2e "composition cycle" |
| AC-12 | An origin outside the allow list is never contacted | e2e "denied origin" |
| AC-13 | BYOK: router, model and key are configurable; the key stays in this browser; a missing key stops the call with a setup error; profiles can be deleted | `src/site/settings.ts`; e2e |
| AC-14 | The peer's HOCON and its JSON serialisation describe the same graph | `test/network.test.ts` |
| AC-15 | Keyboard reachable, focus visible, reduced motion respected, no horizontal overflow at 390 px | e2e; `docs/07-UI.md` §4 |
| AC-16 | All visitor-facing copy is English | `bash scripts/verify.sh` |
| AC-17 | No secret, no third-party script, no analytics | `scripts/verify.sh` |
| AC-18 | `bash scripts/verify.sh` is green on a fresh clone | `proof/clone-check.md` |

## 7. Out of scope

- No accounts, no payments, no database. The shop's data is static and the visitor's
  data stays in their browser.
- No coded-tool bundle. The published network is data; the only executable code is the
  site's own runtime, which the visitor already trusts by visiting.
- No A2A card, no `.well-known` discovery: allowed by the profile, not needed here.
- No mobile app, no hosted inference endpoint.
- One peer site. More would not prove anything the second one does not.
