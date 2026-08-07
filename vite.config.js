import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// During `npm run dev`, the Express API runs on :8787 and Vite proxies /api to it.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Plain-JS modules the Express API and the front-end both import, so the
            // booking rules can't drift between the two (see shared/eventSlots.js).
            "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
        },
    },
    server: {
        port: 5173,
        proxy: {
            "/api": "http://localhost:8787",
        },
    },
});
