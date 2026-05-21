import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import router from "./routes";
import { logger } from "./lib/logger";
import { isOriginAllowed } from "./lib/allowedOrigins.js";

const app: Express = express();

// Trust the upstream proxy so rate-limiter can correctly identify clients
app.set("trust proxy", 1);

// Security headers (helmet) — must come before routes
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow <img> / <audio> from same origin
    // API server only returns JSON and binary uploads — strict CSP is safe and correct here
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Inform browsers this origin should only be accessed over HTTPS
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
  }),
);

// CORS — restrict to configured frontend origin(s); see lib/allowedOrigins.ts
app.use(cors({
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// HTTP Parameter Pollution prevention — collapses duplicate query params (e.g. ?q=a&q=b → "a")
app.use(hpp());

app.use((req: Request, res: Response, next: NextFunction) => {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as Request).id ?? randomUUID(),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

function csrfCheck(req: Request, res: Response, next: NextFunction): void {
  const safe = ["GET", "HEAD", "OPTIONS"];
  if (safe.includes(req.method)) return next();

  const origin = req.headers["origin"];
  const referer = req.headers["referer"];

  if (origin) {
    if (isOriginAllowed(origin)) return next();
    res.status(403).json({ error: "Forbidden: CSRF check failed" });
    return;
  }

  if (referer) {
    try {
      if (isOriginAllowed(new URL(referer).origin)) return next();
    } catch { /* invalid referer */ }
    res.status(403).json({ error: "Forbidden: CSRF check failed" });
    return;
  }

  const ct = req.headers["content-type"] ?? "";
  const hasCustomHeader = req.headers["x-requested-with"] === "FairChat";
  const hasJson = ct.includes("application/json");
  if (hasJson || hasCustomHeader) return next();

  res.status(403).json({ error: "Forbidden: CSRF check failed" });
}
app.use("/api", csrfCheck, router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as { status?: number })?.status ?? 500;
  logger.error({ err }, "Unhandled error");
  res.status(status).json({ error: message });
});

export { isOriginAllowed } from "./lib/allowedOrigins.js";
export default app;
