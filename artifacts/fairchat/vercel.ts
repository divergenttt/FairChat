/**
 * Vercel project config — Root Directory must be `artifacts/fairchat`.
 * Requires `export const config` (default export is ignored).
 */
const apiServerUrl = process.env.API_SERVER_URL?.trim().replace(/\/+$/, "") ?? "";

const rewrites: Array<{ source: string; destination: string }> = [];

if (apiServerUrl) {
  rewrites.push({
    source: "/api/:path*",
    destination: `${apiServerUrl}/api/:path*`,
  });
  // Legacy / mistaken client paths (/uploads/...) — static files live at /api/uploads/ on Railway
  rewrites.push({
    source: "/uploads/:path*",
    destination: `${apiServerUrl}/api/uploads/:path*`,
  });
}

// SPA (wouter) — without this, /register and /chat return Vercel 404 NOT_FOUND (applied after /api rule)
rewrites.push({
  source: "/(.*)",
  destination: "/index.html",
});

export const config = {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  buildCommand:
    "cd ../.. && pnpm --filter @workspace/fairchat exec vite build --config vite.config.ts",
  outputDirectory: "dist/public",
  framework: null as null,
  rewrites,
};
