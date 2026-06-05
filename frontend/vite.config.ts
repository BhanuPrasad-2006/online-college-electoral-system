// @lovable.dev/vite-tanstack-config bundles tanstackStart, viteReact, tailwind, etc.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// Support both Vercel and Render/general Node deployments dynamically.
const preset = process.env.VERCEL ? "vercel" : undefined;

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [nitro(preset ? { preset } : {})],
});
