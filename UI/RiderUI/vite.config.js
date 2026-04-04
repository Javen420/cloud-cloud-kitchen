import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  const apiTarget =
    process.env.VITE_KONG_PROXY_TARGET ||
    env.VITE_KONG_PROXY_TARGET ||
    process.env.VITE_API_BASE_URL ||
    env.VITE_API_BASE_URL ||
    "http://localhost:8000";

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    envDir: REPO_ROOT,
    server: {
      port: 5175,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
