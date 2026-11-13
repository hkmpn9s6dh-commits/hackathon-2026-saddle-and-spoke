# Saddle & Spoke

**A bicycle workshop in Saltcoats that publishes itself as an open agent network.**

Live site: **https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/**

Describe a fault in the box at the bottom right. Three agents diagnose it from the shop's
real stock and diary, write the findings onto the job sheet, put the parts on the bench,
quote the bench time, and offer a drop-off slot. The page annotates its own drawing as
they work. Nothing is written on the sheet without the visitor approving exactly what will
be sent.

Built for the [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/)
(Cognizant AI Lab). It conforms to the [minimum viable specification, MVP Profile
0.2](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md).

---

## What is here

| | |
| --- | --- |
| `agent-manifest.json` | the site manifest: network name, front agent, location of the definition, peer policy |
| `saddle_and_spoke.network.json` | the published, fully resolved network — three agents, data only |
| `links.json` | the peer binding: symbolic name `spare_room` → a URL on another origin |
| `peer/` | the peer site (Spare Room, a parts co-op) with its own manifest, HOCON network and JSON serialisation |
| `src/runtime/` | the browser runtime: parse, validate, agent loop, actions, peers, private context, budgets, MCP |
| `src/site/` | this shop: the drawing, the job sheet, the bench, the Inspector, the settings |
| `check/` | the conformance checker other entrants can point at their own site |
| `docs/` | gate A documents, the action catalogue, the proof log, the submission copy |

## Run it

```bash
npm install
npm run dev            # http://127.0.0.1:5173
```

To exercise the peer protocol locally you need the second origin:

```bash
npm run build
node scripts/serve.mjs --root peer --port 5174                                  # the co-op
node scripts/serve.mjs --root dist --port 5173 --peer-origin http://127.0.0.1:5174/   # the shop
```

(The published `links.json` points at the co-op on jsDelivr. `--peer-origin` rewrites it
in memory so a local run stays hermetic.)

## Verify it

```bash
bash scripts/verify.sh        # typecheck, 32 unit checks, build, hygiene, browser e2e
```

`scripts/e2e.mjs` drives the production build in Chromium: it runs a job from complaint to
booking, declines a booking, runs the conformance suite, presses the four buttons that are
supposed to fail, and checks the peer was fetched cross-origin without a credential.

## Two things a judge should try

1. **Press "Run the conformance suite"** in the Inspector. Six of the seven interoperability
   checks from §6 of the specification turn green, each with the evidence it observed — the
   manifest it fetched, the origin the peer came from, the fields the private-context filter
   withheld.
2. **Press the four buttons under "Break it yourself".** An invalid network, a composition
   cycle, an over-budget run and a denied origin. Each drives the real runtime into a real
   refusal, and check seven turns green only when all four have been refused.

Nothing in that report is asserted in advance. It is the trace of this session.

## Inference

The site publishes **no funded endpoint**. With no key it replays a recorded session
through the **real** runtime: validation, delegation, action dispatch, consent, receipts
and budgets all run; only the words come from a file. Open *Model* in the top right and
paste a key for any OpenAI-compatible router to talk to a real model instead. The key stays
in this origin's `localStorage`, is attached only to requests to that router, and can be
deleted from the same panel.

## The open agentic web part

- The network is **data**, published as JSON (with a HOCON peer to prove the other
  direction works).
- It runs **in the browser**, with no agent server.
- The co-op network is fetched from a **different origin**, after consent, and runs in the
  visitor's browser with the visitor's router. Its own manifest declares a router; this
  runtime ignores it, and the trace says so.
- **Private context** is deny-by-default: the co-op may be told the shop's trade account
  and nothing else. The customer's name, phone and frame number never leave the page.

## Licence

MIT. See `LICENSE`.
