import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const behindLocalHttpsProxy = process.env.BW_HTTPS_PROXY === "1";

export default defineConfig({
  plugins: [react()],
  // Load the shared workspace .env so VITE_PLAYER_MODEL_URL works with the root .env.example.
  envDir: "../..",
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Nginx terminates TLS; the browser reaches Vite through buddhist-world.local.
    // Keep normal localhost development unchanged unless BW_HTTPS_PROXY=1.
    allowedHosts: ["buddhist-world.local"],
    ...(behindLocalHttpsProxy ? {
      hmr: {
        host: "buddhist-world.local",
        protocol: "wss" as const,
        clientPort: 443,
      },
    } : {}),
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
