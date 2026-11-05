import path from "node:path";
/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: 5173,
    strictPort: true,
  },
  // Relative asset URLs: the built HTML is re-served by the VS Code extension
  // host from a `vscode-webview://` origin, which has no meaningful site root.
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        // Browser dev/e2e harness — not a shipped surface. See index.html.
        index: path.resolve(__dirname, "index.html"),
        // VS Code webview hosts — one bundle per surface.
        schematic: path.resolve(__dirname, "schematic.html"),
        library: path.resolve(__dirname, "library.html"),
        waveform: path.resolve(__dirname, "waveform.html"),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // FE-54+ scaffold tests are excluded until their epics are implemented.
    // Re-include each file when its epic moves to in_progress.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // canvas — FE-56 through FE-62
      // "src/canvas/annotation-tools.test.ts",  // FE-59 implemented
      // "src/canvas/AnnotationLayer.test.tsx",   // FE-59 implemented
      // "src/canvas/hierarchy-nav.test.ts",       // FE-58 implemented
      // "src/canvas/SubsystemBlock.test.tsx",     // FE-58 implemented
      // "src/canvas/dim-annotation.test.tsx",    // FE-65 implemented
      // "src/canvas/dim-propagate.test.ts",      // FE-65 implemented
      // "src/canvas/GotoFromOverlay.test.tsx", // FE-57 implemented
      // "src/canvas/goto-from-resolver.test.ts", // FE-57 implemented
      // "src/canvas/port-compat.test.ts",        // FE-65 implemented
      // "src/canvas/wire-draw-compat.test.tsx", // FE-65 implemented
      // inspector — FE-57 through FE-63
      // "src/inspector/BusInspector.test.tsx", // FE-64 implemented
      "src/inspector/FidelitySwap.test.tsx",
      // ParamExpressionInput.test.tsx and ParamTable.test.tsx enabled for FE-60
      // "src/inspector/SelectorInspector.test.tsx", // FE-64 implemented
      // "src/inspector/SignalSpecInspector.test.tsx", // FE-66 implemented
      // "src/inspector/UnitConversionInspector.test.tsx", // FE-66 implemented
      // library — FE-62 through FE-66
      "src/library/fidelity-swap.test.ts",
      // "src/library/signal_attributes_palette.test.tsx", // FE-66 implemented
      // persistence — FE-63
      // "src/persistence/roundtrip.test.ts", // FE-63 implemented
      // simulation — scaffold tests (re-enable as epics land)
      // e2e Playwright specs — run via playwright, not vitest
      "tests/e2e/**",
    ],
  },
});
