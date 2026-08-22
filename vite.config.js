import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function pwaHeaders() {
  const applyHeaders = (req, res, next) => {
    if (req.url === "/manifest.json") {
      res.setHeader("Content-Type", "application/manifest+json");
    }
    next();
  };

  return {
    name: "fintrackr-pwa-headers",
    configureServer(server) {
      server.middlewares.use(applyHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(applyHeaders);
    }
  };
}

export default defineConfig({
  root: "app",
  plugins: [react(), pwaHeaders()],
  resolve: {
    // Keep extensionless imports working for JS/JSX modules.
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"]
  },
  esbuild: {
    // Strip debug output from production bundles. Vite only applies this to
    // `vite build`, so the dev server keeps full logging.
    drop: ["console", "debugger"]
  },
  build: {
    outDir: "static",
    emptyOutDir: true,
    sourcemap: false,
    // Warn earlier than the 500 kB default so bundle growth is visible.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendor code into its own chunks so
        // they stay cached across app deploys.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-query": ["@tanstack/react-query"]
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
