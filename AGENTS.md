# AGENTS.md — how this repository is built

Adapted from the six-step ticket discipline used for these challenge builds, compressed for
a single person working alone. If you are an agent picking this up: read this file, then
`docs/01-SPEC.md`, then run `bash scripts/verify.sh`.

## The four gates

- **A — Have we agreed what this is?** `docs/01-SPEC.md` (the official criteria quoted, a
  demo script written before the build, decidable acceptance criteria) plus `docs/07-UI.md`
  §1–4 (style preset, the ruler, the one memory point, the main screen spec). After A, scope
  only shrinks.
- **B — Did we walk the whole way?** Every step goes through `bash scripts/verify.sh`:
  typecheck, unit checks, production build, hygiene, browser end-to-end. Red does not
  survive the day.
- **C — Can you prove it works?** A fresh clone, following only the README, must build and
  pass. Each acceptance criterion has evidence in `proof/` or a command in `verify.sh`.
- **D — Would a judge stop on the first screen?** The main screen blind-ranked against five
  external references by at least two models that did not build it. Below three of the five
  and it does not ship.

## Working rules

1. Push a branch after every acceptance criterion passes; a dropped connection costs one
   criterion, not the day.
2. One repository per competition.
3. The site goes on the real host (GitHub Pages) before anything is called finished.
4. No credentials in the repository. `verify.sh` scans for key shapes.
5. UI text is at least 13 px; body contrast is at least 4.5:1.
6. Accessibility is part of done: keyboard reachable, focus visible, `prefers-reduced-motion`
   honoured.
7. The published network is **data**. If a change needs code in the network, it belongs in a
   site action instead.

## Definition of done

- [x] Gate A: `docs/00-BRIEF.md`, `docs/01-SPEC.md`, `docs/07-UI.md` §1–4
- [x] Gate B: `bash scripts/verify.sh` green
- [x] Gate C: fresh clone builds; `proof/` holds the evidence
- [x] Gate D: blind ranking recorded in `proof/rank/`
- [x] Packaging: video, cover, submission copy, and the steps only the account holder can do
- [x] Live at a public URL; repository public with a licence

## Layout

```
public/            the published artifacts, copied verbatim into the build
peer/              the parts co-op: a second origin, served from this repository
src/runtime/       parse, validate, agent loop, actions, peers, private context, budgets, MCP
src/site/          the drawing, the job sheet, the bench, the Inspector, the settings
check/             the conformance checker other entrants can point at their own site
scripts/           verify.sh, e2e.mjs, record.mjs, video.mjs, cover.mjs, deploy.sh
docs/              00 BRIEF · 01 SPEC · 02 ACTIONS · 03 INFERENCE · 04 PROOF
                   05 SUBMISSION · 06 SUBMIT STEPS · 07 UI · 08 VOICE
proof/             evidence: screenshots, the clone record, the blind ranking
```
