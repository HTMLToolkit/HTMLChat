// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: true,   // allow access from external hosts
  }
});
