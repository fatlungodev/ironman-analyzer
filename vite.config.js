import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        inventory: resolve(__dirname, "index.html"),
        comparison: resolve(__dirname, "comparison.html"),
      },
    },
  },
});
