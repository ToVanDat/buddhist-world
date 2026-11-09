import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Load the shared workspace .env so VITE_PLAYER_MODEL_URL works with the root .env.example.
  envDir: "../..",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
