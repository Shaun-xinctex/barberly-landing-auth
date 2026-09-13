import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Plain Vite + React SPA. `vite build` emits a fully static bundle to dist/,
// which Vercel serves as a static site (see vercel.json for the SPA fallback).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // The generated Supabase client reads `process.env.*` as an SSR fallback.
  // There is no server any more, so give the browser bundle an empty object
  // instead of letting it hit a ReferenceError.
  define: {
    "process.env": "{}",
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    host: true,
    port: 8080,
  },
  preview: {
    host: true,
    port: 8080,
  },
});
