import { resolve } from "node:path";
import { defineConfig } from "vite";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const basePath = process.env.GITHUB_ACTIONS ? `/${repoName}/` : "/";

export default defineConfig({
  base: basePath,
  build: {
    rollupOptions: {
      input: {
        inventory: resolve(__dirname, "index.html"),
        comparison: resolve(__dirname, "comparison.html"),
      },
    },
  },
});
