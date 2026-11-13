# Spare Room — the peer site

This folder is the second origin in the demo. It is deployed from the repository
itself (jsDelivr and raw.githubusercontent), so it is genuinely cross-origin: the
caller's page fetches these files with CORS, not from its own bundle.

Published artifacts:

| File | Role |
| --- | --- |
| `agent-manifest.json` | the site manifest: network name, front agent, location of the definition |
| `spare_room.hocon` | the canonical, fully resolved HOCON network |
| `spare_room.network.json` | the same graph serialised as JSON, for runtimes that only read JSON |
| `links.json` | the co-op binds no peers of its own |
| `index.html` | the co-op's own page (no chat: the counter answers agents) |

Peer URL: `…/peer/spare_room` — the final path component is the network name, and
the runtime reads `agent-manifest.json` from the folder above it.

The manifest declares an `llm_router`. It is informational: a caller runtime keeps
its own router and model, and no caller key is ever sent here.
