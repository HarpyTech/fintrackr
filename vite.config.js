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
  build: {
    outDir: "static",
    emptyOutDir: true
  },
  server: {
    port: 3000
  }
});
