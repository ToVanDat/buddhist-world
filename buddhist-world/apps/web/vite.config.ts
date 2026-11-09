import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: false },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
