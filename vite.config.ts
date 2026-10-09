import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true, // also reachable from phones on the same Wi-Fi
    port: Number(process.env.PORT ?? 8443),
  },
  preview: {
    port: Number(process.env.PORT ?? 8443),
  },
});
