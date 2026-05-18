import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";
import { startCelebrationScheduler } from "./scheduler";
import { bootstrapAdmin } from "./bootstrap-admin";

const app = express();
const httpServer = createServer(app);

// Trust proxy for Replit deployment (required for secure cookies behind reverse proxy)
app.set("trust proxy", 1);

// Canonical domain redirect: www.hfniconnect.com → hfniconnect.com (production only)
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    if (host.startsWith("www.")) {
      const canonicalHost = host.replace(/^www\./, "");
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const redirectUrl = `${protocol}://${canonicalHost}${req.originalUrl}`;
      return res.redirect(301, redirectUrl);
    }
    next();
  });
}

// Global error capture for diagnostics
interface LastError {
  time: string;
  method: string;
  path: string;
  message: string;
  stack: string | null;
}
let lastError: LastError | null = null;

export function captureError(err: any, req: Request) {
  lastError = {
    time: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    message: err?.message || String(err),
    stack: err?.stack || null,
  };
}

export function getLastError(): LastError | null {
  return lastError;
}

// Global request capture for diagnostics
let lastRequest: any = null;

export function getLastRequest() {
  return lastRequest;
}

// Middleware to capture last request for debugging
app.use((req, res, next) => {
  lastRequest = {
    time: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    host: req.headers.host,
    xff: req.headers["x-forwarded-for"] || null,
    proto: req.headers["x-forwarded-proto"] || null,
    hasCookie: !!req.headers.cookie,
  };
  next();
});

// Startup diagnostics - log env var presence (not values)
function logStartupDiagnostics() {
  console.log("=== STARTUP DIAGNOSTICS ===");
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
  console.log(`PORT: ${process.env.PORT || "5000 (default)"}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "SET" : "MISSING"}`);
  console.log(
    `SESSION_SECRET: ${process.env.SESSION_SECRET ? "SET" : "MISSING"}`,
  );
  console.log(
    `TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? "SET" : "MISSING"}`,
  );
  console.log(
    `TWILIO_AUTH_TOKEN: ${process.env.TWILIO_AUTH_TOKEN ? "SET" : "MISSING"}`,
  );
  console.log(
    `TWILIO_VERIFY_SERVICE_SID: ${process.env.TWILIO_VERIFY_SERVICE_SID ? "SET" : "MISSING"}`,
  );
  console.log(`ADMIN_EMAIL: ${process.env.ADMIN_EMAIL ? "SET" : "NOT SET"}`);
  console.log(
    `ADMIN_PASSWORD: ${process.env.ADMIN_PASSWORD ? "SET" : "NOT SET"}`,
  );
  console.log("=== END DIAGNOSTICS ===");

  // Check critical env vars
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");

  if (missing.length > 0) {
    console.error(`CRITICAL: Missing required env vars: ${missing.join(", ")}`);
    console.error(
      "App may fail on first request. Please set these in deployment secrets.",
    );
  }
}

logStartupDiagnostics();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Bootstrap admin account if env vars are set
  await bootstrapAdmin();

  await registerRoutes(httpServer, app);

  // Debug endpoint to view last error (no secrets exposed)
  app.get("/debug/last-error", (_req, res) => {
    const error = getLastError();
    if (error) {
      res.json({ ok: false, lastError: error });
    } else {
      res.json({ ok: true, lastError: null });
    }
  });

  app.get("/debug/ping", (_req, res) => res.status(200).send("pong"));

  app.get("/debug/last-request", (_req, res) =>
    res.json({ ok: true, lastRequest }),
  );

  // Schema check endpoint - read-only, checks if all expected tables exist
  app.get("/debug/schema-check", async (_req, res) => {
    const expectedTables = [
      "churches",
      "units",
      "members",
      "families",
      "family_members",
      "pastors",
      "staff_accounts",
      "mass_events",
      "attendance",
      "prayer_requests",
      "dues_payments",
      "family_payments",
      "member_payments",
      "outbound_messages",
      "groups",
      "member_groups",
      "meetings_rsvp",
      "announcements",
      "notifications",
      "notification_reads",
      "conversations",
      "messages",
      "gallery_items",
      "testimonies",
      "volunteer_requests",
      "volunteer_signups",
      "ride_offers",
      "ride_requests",
    ];

    try {
      const result = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );
      const existingTables = result.rows.map(
        (r: { table_name: string }) => r.table_name,
      );

      const presentTables = expectedTables.filter((t) =>
        existingTables.includes(t),
      );
      const missingTables = expectedTables.filter(
        (t) => !existingTables.includes(t),
      );

      res.json({
        ok: missingTables.length === 0,
        missingTables,
        presentTables,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: "DB_ERROR",
        message: err?.message || "Failed to query schema",
      });
    }
  });

  // Global error middleware - captures errors for diagnostics
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Capture error for /debug/last-error
    captureError(err, req);

    console.error("UNHANDLED_ERROR", {
      method: req.method,
      path: req.originalUrl,
      message: err?.message,
      stack: err?.stack,
    });

    if (res.headersSent) return next(err);
    res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      message: "Internal Server Error",
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Start the celebration scheduler for daily notifications
      startCelebrationScheduler();
    },
  );
})();
