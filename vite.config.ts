import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The site is deployed to a repository subpath, so every URL it emits has to be
// relative. There is no server: the bundle is static files and one HTML page.
export default defineConfig({
  base: "./",
  // Two pages: the shop, and the conformance checker a judge can point at any site.
  build: {
    target: "es2022",
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: at("./index.html"),
        check: at("./check/index.html"),
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
