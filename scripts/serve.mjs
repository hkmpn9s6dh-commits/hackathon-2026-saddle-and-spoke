#!/usr/bin/env node
/**
 * A static server for local proof runs.
 *
 * Two origins are needed: the site, and the peer parts co-op. They differ by port,
 * because CORS is part of what the runtime demonstrates. This server adds the
 * headers a static host sends, and nothing else.
 *
 *   node scripts/serve.mjs --root dist --port 5173
 *   LOCAL_PEER=1 node scripts/serve.mjs --root peer --port 5174
 *
 * With LOCAL_PEER=1 the peer's links.json is rewritten in memory so the co-op points
 * at the local peer origin instead of the CDN. That keeps `bash scripts/verify.sh`
 * hermetic; the published file is untouched.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const root = resolve(args.get("root") ?? "dist");
const port = Number(args.get("port") ?? 5173);
const localPeer = process.env.LOCAL_PEER === "1";
const peerOrigin = args.get("peer-origin") ?? (localPeer ? `http://127.0.0.1:${port}/` : null);
const PEER_MARKER = "/peer/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".hocon": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("outside the root");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    let body = await readFile(filePath);
    if (peerOrigin && pathname === "/links.json") {
      const parsed = JSON.parse(body.toString("utf8"));
      for (const network of Object.values(parsed.networks ?? {})) {
        for (const [name, target] of Object.entries(network)) {
          if (typeof target !== "string") continue;
          const at = target.indexOf(PEER_MARKER);
          if (at > 0) network[name] = peerOrigin + target.slice(at + PEER_MARKER.length);
        }
      }
      body = Buffer.from(JSON.stringify(parsed, null, 2));
    }
    response.writeHead(200, {
      "content-type": TYPES[extname(filePath)] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "access-control-allow-headers": "*",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" }).end(`not found: ${pathname}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}/`);
});
