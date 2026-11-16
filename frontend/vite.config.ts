import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Extra hostnames the dev/preview server will answer to (e.g. a Tailscale name for testing on phones).
// Add more without editing this file: ALLOWED_HOSTS="a.example.com,b.example.com" npm run dev
const allowedHosts = [
  "desktop-6eeqet4.ratfish-regulus.ts.net",
  ...(process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    allowedHosts,
    // Same-origin in development too, so the httpOnly auth cookies just work.
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
  preview: {
    port: 4173,
    allowedHosts,
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
