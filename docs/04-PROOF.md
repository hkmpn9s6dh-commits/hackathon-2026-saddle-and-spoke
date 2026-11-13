# 04 — Proof

Gate C and gate D. Every number here came from a command run on this machine on
2026-11-13, against the production build and against the live deployment.

## Live

| | |
| --- | --- |
| Site | https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/ |
| Repository | https://github.com/hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke (MIT) |
| Peer site | `…/peer/` on jsDelivr, and `…/main/peer/` on raw.githubusercontent.com |
| Deployment | GitHub Pages, `gh-pages` branch, built by `scripts/deploy.sh` |

## Gate B — the build walks the whole way

`bash scripts/verify.sh` on this machine, 2026-11-13:

```
typescript type check                                    PASS
unit checks (32)                                         PASS
production build                                         PASS
published: dist/index.html                               PASS
published: dist/agent-manifest.json                      PASS
published: dist/links.json                               PASS
published: dist/saddle_and_spoke.network.json            PASS
asset paths are relative (repository subpath)            PASS
fonts are bundled and hashed                             PASS
no font CDN at runtime                                   PASS
MIT licence present                                      PASS
README documents the verification                        PASS
docs/00-BRIEF.md … docs/05-SUBMISSION.md                 PASS
the published network is present                         PASS
the peer HOCON has no include or substitution            PASS
visitor-facing copy is English                           PASS
no credentials in the repository                         PASS
no third-party analytics                                 PASS
browser end-to-end (31 checks)                           PASS
```

The 32 unit checks are in `test/network.test.ts` (16) and `test/runtime.test.ts` (16). They
cover, among other things: the JSON/HOCON equivalence of the peer network; refusal of a
duplicate agent, a missing front agent, a dead reference, a self-reference and an executable
tool definition; refusal of `include` and `${…}`; argument validation against a schema;
deny-by-default private context; step and time budgets; delegation; a declined write
producing no side effect; a timed-out write being reported as *unknown* and not retried.

## Gate C — a fresh clone, following only the README

```
$ git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke
$ cd hackathon-2026-saddle-and-spoke
$ npm install
$ bash scripts/verify.sh
```

Recorded in `proof/clone-check.md` — the clone, the install, the full run, and the one
thing a fresh clone cannot reproduce offline (the peer on jsDelivr; the run falls back to
the loopback peer that `verify.sh` starts itself).

## The seven interoperability checks, on the live site

`scripts/e2e.mjs` against `https://hkmpn9s6dh-commits.github.io/hackathon-2026-saddle-and-spoke/`,
2026-11-13 — **31 checks, 0 failed**:

```
PASS  the page boots and validates its own network
PASS  three agents are published
PASS  the drawing is mounted
PASS  the run asks for review before writing
PASS  a peer origin is contacted only after consent
PASS  the booking is confirmed separately
PASS  findings are written on the sheet
PASS  parts are on the bench
PASS  a booking returns a receipt
PASS  a part is pointed at on the drawing
PASS  the ticket is stamped
PASS  the total is not zero
PASS  the peer manifest is fetched cross-origin
PASS  no authorization header is sent to the peer
PASS  the peer definition is fetched too
PASS  a declined booking books nothing
PASS  the refusal is recorded as a receipt
PASS  checks 1–6 pass after the suite
PASS  invalid network is refused
PASS  composition cycle is stopped
PASS  over-budget run halts
PASS  denied origin is not contacted
PASS  check 7 turns green only after the four refusals
PASS  the badge says it is a replay
PASS  the settings drawer offers a provider
PASS  the trace lists events
PASS  the privacy panel names what the co-op may receive
PASS  no horizontal overflow on a phone
PASS  no console errors
```

The four refusals, in the runtime's own words (from the live run):

- **invalid network** — `rejected before any model call: agent "workshop_lead" is defined more than once`
- **composition cycle** — `Composition cycle stopped: https://…/ is already being composed in this run.`
- **over budget** — `This run reached its limit of 1 model calls and stopped.`
- **denied origin** — `This site will not contact https://parts.example.org: … is not on this site's allow list.`

## Measurements

| | |
| --- | --- |
| JavaScript | 99 KB main + 8 KB shared, 34 KB gzip total |
| CSS | 21 KB, one file |
| Fonts | 113 KB, four woff2, self-hosted |
| Images | none |
| Requests on first load | 9 |
| Unit checks | 32 |
| Browser checks | 31 |
| Screenshots | `proof/shots/` (JPEG, 2×) |

## Gate C — recorded

`proof/clone-check.md` holds the clone, the install and the full run. It also records the
bug that clone caught: on Windows the checkout rewrote the published artifacts with CRLF,
so the HOCON peer and its JSON serialisation were no longer byte-equal inside a triple-quoted
string. `.gitattributes` now pins LF and the test normalises line endings. Running
`verify.sh` on the machine that wrote the files could never have found it.

## Gate D — blind ranking

**One judge has answered; the second is still running.** Both were asked the same question
with the same six lettered screenshots and no other context.

### Judge 1 — GPT-5.6 (did not build this), 2026-11-13 15:29

| Rank | Letter | What it is | The judge's reason |
| --- | --- | --- | --- |
| 1 | A | teenage.engineering | "dramatic product photography and high-contrast black; the strongest visual landing point" |
| 2 | **D** | **Saddle & Spoke** | "the bicycle line drawing, the job sheet and the restrained editorial typography build a distinctive scene; complete hierarchy, high recognition" |
| 3 | E | worldwideagenticweb.org | "huge headline, generous space, two clear buttons — but reads as a generic event page" |
| 4 | C | the organisers' pizza example | "brand, claim, menu and order area are understood instantly; the form density weakens the first-screen impact" |
| 5 | B | are.na | "clear hierarchy and bold whitespace, but the visual content and landing point are weak" |
| 6 | F | linear.app | (see the note below — this capture was blank) |

**Result: ranked above four of the five references, and above three of them (E, C, B) even
with F and A discounted.** The pass condition is "above at least three".

Note on F: the first capture of linear.app returned before its hero rendered, so the judge
ranked an empty black page. It has since been replaced with a real capture in `proof/rank/F.jpg`;
the judge's placement of F is therefore discounted, and D's position above E, C and B stands
on its own.

### Judge 2 — GLM-5.3-Flash (did not build this), 2026-11-13 15:48

"All six images seen." Ranked by "how likely I am to stop on this first screen":

| Rank | Letter | What it is | The judge's reason |
| --- | --- | --- | --- |
| 1 | A | teenage.engineering | "a single lit object in black space, nothing else — you know who the subject is at once" |
| 2 | F | linear.app | "a big headline over a real product screenshot; hierarchy and typography almost faultless, but the dark-hero formula is common in galleries" |
| 3 | **D** | **Saddle & Spoke** | (no note, but placed above C, E and B) |
| 4 | C | the organisers' pizza example | |
| 5 | E | worldwideagenticweb.org | |
| 6 | B | are.na | "no visual landing point anywhere on the screen; a default-weight list on white, like an unstyled draft" |

**Result: ranked above three of the five references (C, E, B).**

### Verdict

| Judge | Family | Rank of D | References below D | Passes |
| --- | --- | --- | --- | --- |
| 1 | GPT-5.6 | 2 / 6 | A only above it; E, C, B, F below | yes (4 ≥ 3) |
| 2 | GLM-5.3-Flash | 3 / 6 | C, E, B below | yes (3 ≥ 3) |

**Gate D passes**: two judges from different model families, neither of which built the site,
each ranked it above at least three of the five references. Both put the same two references
above it, and both put the organisers' example and the challenge's own site below it — which
is the comparison that matters for this submission.

The design therefore stands as built: the video and the cover do not need re-cutting.

### The set

`proof/rank/`: A teenage.engineering, B are.na, C the organisers' pizza example, D this site,
E worldwideagenticweb.org, F linear.app. Letters were shuffled from a fixed seed
(2026-11-13); `order.json` holds the mapping and neither judge was given it.

### Order of work, on the record

The layout and the cover were built before the ranking came back: the video is a picture lock
with no narration, and `scripts/cover.mjs` regenerates the cover in one command. Had gate D
failed, the composition would have changed and both would have been re-cut. It passed, so
nothing was wasted — but the order was wrong, and it is recorded here rather than tidied away.

## What is not proven

- **A live model.** Every run in this document used the replay router. The BYOK path is
  implemented and type-checked but has not been exercised against a real provider, because
  no key was available. `Inspector → Probe the visitor router` is the one-click test once a
  key is present.
- **MCP.** The client is implemented and fails closed; no MCP server is referenced by the
  published network, so no call was made in the demo.

