import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [path.resolve(root, "..")] },
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/files": "http://127.0.0.1:3001",
    },
  },
  build: { outDir: path.resolve(root, "dist"), emptyOutDir: true },
});
