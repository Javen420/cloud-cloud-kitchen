import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  const coordTarget =
    process.env.VITE_COORDINATE_PROXY_TARGET ||
    env.VITE_COORDINATE_PROXY_TARGET ||
    "http://localhost:8094";

  return {
    plugins: [react()],
    envDir: REPO_ROOT,
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5174,
      proxy: {
        "/coord": {
          target: coordTarget,
          changeOrigin: true,
          rewrite: (p) => {
            const stripped = p.replace(/^\/coord/, "");
            return stripped === "" ? "/" : stripped;
          },
        },
      },
    },
  };
});
