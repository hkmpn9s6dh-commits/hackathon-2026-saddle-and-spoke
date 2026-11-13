# 03 — Inference

The graph is data. The model is replaceable. That is Tenet Three, and it is also the only
way a small workshop could ever publish this page.

## What the site publishes

`agent-manifest.json` declares:

```json
"llm_router": {
  "base_url": "replay://local",
  "model": "recorded-session",
  "mock": true,
  "byok_router": "https://api.openai.com/v1",
  "note": "No funded inference endpoint is published…"
}
```

There is no publisher-funded endpoint, and pretending otherwise would be a lie a judge
could catch in ten seconds by opening the network tab. So the default path is honest about
being a recording, and the BYOK path is the real one.

## The replay router

`src/runtime/replay.ts` implements the same `Router` interface as the live one and returns
a recorded session, one step per model call. Everything around it is the real runtime:

- the network is parsed and validated before the first call;
- the same agent loop runs, with the same budgets;
- tool calls are dispatched to the same agents and the same site actions;
- writes go through the same review sheet, the same receipts and the same refusal paths;
- the peer network is fetched from the other origin with the same consent;
- the private-context filter runs.

Only the sentences are canned. The page says so in the badge (`REPLAY`), in the Model
panel, and in the submission.

Why bother: a judge should be able to see the whole thing work before deciding whether to
find an API key. A demo that needs a key before it does anything is a demo most judges
never run.

## The BYOK path

Any OpenAI-compatible router: OpenRouter, OpenAI, a local Ollama, Otari. The visitor sets
the base URL, the model and the key in the Model panel. Then the same network runs against
a real model, with the same tools.

- The key is stored in this origin's `localStorage` under `saddle.byok.v1`.
- It is attached only to `POST {baseUrl}/chat/completions` as an `Authorization: Bearer`
  header.
- It is never placed in a URL, the manifest, the network, a prompt, an action argument, a
  trace entry or a peer request. `src/runtime/trace.ts` redacts anything that looks like a
  credential before an event is recorded.
- Deleting it is one button in the same panel.
- A missing key stops the model call with a setup error the visitor can act on, rather
  than failing silently.

## CORS is the practical constraint

A static site calls the router straight from the browser, so the router must allow browser
requests. OpenRouter, OpenAI and a local Ollama do. If one does not, the runtime says
`Could not reach https://… from this browser` and explains why, instead of retrying.

## Per-agent models

The network declares a model hint per network (`llm_config.model_name`). It is a hint: the
caller's active router and model take precedence, which is what the specification requires
when a peer runs in someone else's page. The trace records the hint and the model actually
used, so the difference is visible rather than assumed.
