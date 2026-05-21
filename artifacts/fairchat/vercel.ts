const apiServerUrl = process.env.API_SERVER_URL?.trim().replace(/\/+$/, "");

/** Vercel project config — root directory must be `artifacts/fairchat`. */
export default {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  buildCommand:
    "cd ../.. && pnpm --filter @workspace/fairchat exec vite build --config vite.config.ts",
  outputDirectory: "dist/public",
  framework: null as null,
  rewrites: apiServerUrl
    ? [{ source: "/api/:path*", destination: `${apiServerUrl}/api/:path*` }]
    : [],
};
