import { defineConfig , loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  const outsystemsMenuUrl =
    env.OUTSYSTEMS_MENU_URL ||
    "https://personal-dkkhoptv.outsystemscloud.com/MenuService/rest/MenuService/Menu";
  const apiTarget =
    process.env.VITE_KONG_PROXY_TARGET ||
    env.VITE_KONG_PROXY_TARGET ||
    process.env.VITE_API_BASE_URL ||
    env.VITE_API_BASE_URL ||
    "http://localhost:8000";

  return {
    plugins: [react()],
    // Read VITE_* variables from repository root `.env`
    envDir: REPO_ROOT,
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    define: {
      "import.meta.env.OUTSYSTEMS_MENU_URL": JSON.stringify(outsystemsMenuUrl),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

