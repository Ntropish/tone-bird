import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "ToneTool",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["vite", "@preact/signals-core"],
    },
    target: "esnext",
    minify: false,
  },
  plugins: [dts()],
});
