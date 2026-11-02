import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  root: "web",
  envDir: "..",
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    include: ["../tests/**/*.{test,spec}.{ts,tsx}"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
