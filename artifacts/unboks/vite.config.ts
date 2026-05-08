import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT and BASE_PATH are only needed when Vite is *serving* (dev or preview).
// A production `vite build` only emits static assets to `dist/public` and
// never opens a socket, so requiring them at config-load time would cause
// the deployment build to fail with "PORT environment variable is required"
// even though the deployed runtime serves the built assets via a different
// process. Resolve them lazily and validate only for the `serve` command.
export default defineConfig(async ({ command }) => {
  const rawPort = process.env.PORT;
  const basePath = process.env.BASE_PATH;

  if (command === "serve") {
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    const portNum = Number(rawPort);
    if (Number.isNaN(portNum) || portNum <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
    if (!basePath) {
      throw new Error(
        "BASE_PATH environment variable is required but was not provided.",
      );
    }
  }

  // Safe fallbacks for the non-serve case (build). The base path still
  // needs to match the deployed mount point so asset URLs resolve; default
  // to "/" which matches the static handler registered by the deployment
  // runner (`registered static handler for artifact path=/`).
  const port = rawPort ? Number(rawPort) : 5173;
  const base = basePath ?? "/";

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      // Dev / Replit-preview proxy. When VITE_API_BASE_URL is unset (the
      // dev default so production builds don't carry a hardcoded host),
      // `lib/tenant.ts:getApiBase()` returns a relative /api/... path.
      // Forward that to the real backend so the Replit dev preview can
      // sign in and load conversations without an env var. No-op in
      // production: vite serve isn't used to serve the built bundle.
      proxy: {
        "/api": {
          target: "https://api.unboks.org",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: "https://api.unboks.org",
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
