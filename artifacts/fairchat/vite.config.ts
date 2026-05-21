import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const basePath = process.env.BASE_PATH ?? "/";
const fairchatRoot = path.resolve(import.meta.dirname);
const monorepoRoot = path.resolve(import.meta.dirname, "../..");

function resolveApiBaseUrl(mode: string): string {
  const env = loadEnv(mode, monorepoRoot, "");
  const raw =
    env.VITE_API_URL?.trim() ||
    env.API_SERVER_URL?.trim() ||
    process.env.VITE_API_URL?.trim() ||
    process.env.API_SERVER_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export default defineConfig(({ command, mode }) => {
  const apiBaseUrl = resolveApiBaseUrl(mode);
  if (process.env.VERCEL === "1" && !apiBaseUrl) {
    throw new Error(
      "Vercel build: set API_SERVER_URL (or VITE_API_URL) to your Railway URL, e.g. https://your-app.up.railway.app",
    );
  }
  const isDevServer = command === "serve";
  const rawPort = isDevServer ? process.env.PORT : undefined;
  const port = rawPort ? Number(rawPort) : undefined;
  if (isDevServer) {
    if (!rawPort) {
      throw new Error("PORT environment variable is required for dev server.");
    }
    if (Number.isNaN(port) || (port as number) <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  return {
    base: basePath,
    envDir: monorepoRoot,
    define: apiBaseUrl
      ? { "import.meta.env.VITE_API_URL": JSON.stringify(apiBaseUrl) }
      : undefined,
    plugins: [
      nodePolyfills({
        include: ["crypto", "buffer", "stream", "util", "path", "fs", "url", "os", "events"],
        globals: { Buffer: true, global: true, process: true },
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(fairchatRoot, "src"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: fairchatRoot,
    optimizeDeps: {
      include: ["@circle-fin/x402-batching", "@fairblock/stabletrust"],
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      outDir: path.resolve(fairchatRoot, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            wagmi: ["wagmi", "viem", "@rainbow-me/rainbowkit"],
            crypto: ["libsodium-wrappers", "ethers"],
          },
        },
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
      },
    },
    ...(isDevServer && {
      server: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
        fs: {
          strict: true,
          deny: ["**/.*"],
        },
      },
      preview: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
      },
    }),
  };
});
