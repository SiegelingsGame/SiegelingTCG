import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        /**
         * /api/game/options can be large + slow on cold backend start.
         * Raise proxy timeouts so the dev server doesn't fail early.
         */
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
});
