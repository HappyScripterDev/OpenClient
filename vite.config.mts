import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            emptyOutDir: false,
            rollupOptions: {
              external: ["electron", "adm-zip", "electron-updater"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            emptyOutDir: false,
            rollupOptions: {
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
              },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    sourcemap: false,
  },
  clearScreen: false,
});
