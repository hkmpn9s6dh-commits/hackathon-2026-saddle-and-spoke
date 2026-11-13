# 02 — Site actions

Every line the agents put on the job sheet arrives through one of these. The runtime owns
the list; the page registers it at boot; each has a JSON Schema, an effect and a handler.
A model can only call the actions its own agent declares in the published network.

| Action | Effect | What it does | Called by |
| --- | --- | --- | --- |
| `read_job` | read | Returns the live sheet: complaint, findings, bench, labour, held slot, totals | front desk, workshop |
| `read_catalogue` | read | Returns every part with shelf stock, price and co-op lead time; the bench rate; the hours; the slots | front desk, workshop, parts |
| `highlight_part` | read | Points at one part on the drawing: numbered balloon, and the legend line | workshop, parts |
| `lookup_job` | read | Looks up a booked job by its number | front desk |
| `record_finding` | write | Adds one finding, with the part it concerns and a severity (`info` / `attention` / `stop`) | workshop |
| `add_part_to_bench` | write | Puts a part on the bench, with quantity and source (`shelf` / `co-op`) | workshop, parts |
| `quote_labour` | write | Adds one labour line; the rate is the shop's, the agent supplies task and minutes | workshop |
| `propose_slot` | write | Holds one drop-off slot. Explicitly does **not** book it | workshop |
| `book_dropoff` | irreversible | Books the held slot. Takes the visitor's contact details from the visitor's own form, never from the model | front desk |
| `order_part` | irreversible | Orders from the parts co-op. Times out into an unknown outcome rather than being retried | not used in the demo flow |

## Effects and what the runtime does with them

- **read** — runs immediately, no dialog.
- **write** — every write proposed in one assistant turn is collected into a single review
  sheet showing the action, its arguments, the destination origin and the argument hash.
  Each item can be unticked. Nothing runs until the visitor approves; approving runs
  exactly the ticked items, each with its own receipt. A visitor may tick "approve the
  rest of this job's edits without asking", which is an explicit, session-scoped decision;
  an irreversible action still asks.
- **irreversible** — as a write, and never covered by the standing consent. A timeout after
  dispatch is reported as an **unknown** outcome and is never retried by the runtime.

## Receipts

A receipt binds `requestId`, `action`, `origin`, `effect`, `argsHash` (FNV-1a over
canonical JSON) and the status. The Inspector lists them; the site's trace exports them.

## What is deliberately not an action

- Reading the visitor's details. Those are private context, not an action, so no model can
  ask for them.
- Sending anything to the co-op. That is the peer network, which is a different mechanism
  with different rules (consent, an allow list, and a private-context filter).
