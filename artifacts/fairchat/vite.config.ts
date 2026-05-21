import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(({ command }) => {
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
        "@": path.resolve(import.meta.dirname, "src"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    optimizeDeps: {
      include: ["@circle-fin/x402-batching", "@fairblock/stabletrust"],
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
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
