// @lovable.dev/vite-tanstack-config bundles tanstackStart, viteReact, tailwind, etc.
// cloudflare is disabled here — deploy target is Vercel via Nitro (see vercel.json).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [nitro({ preset: "vercel" })],
});
