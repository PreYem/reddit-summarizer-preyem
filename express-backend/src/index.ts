import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter, { debugModeEnabled } from "./routes/summarize";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import {
  initRequestLog,
  logEntry,
  getEntries,
  getStats,
  makeId,
  bodyPreview,
  wordCount,
  getServerDailyCount,
  getIpDailyCount,
  incrementDailyCounts,
  decrementDailyCounts,
  clearLog,
} from "./services/requestLog";

initRequestLog();

const app = express();

// Trust exactly ONE proxy hop (Render's). Never use `true`: it lets clients
// forge their IP through the X-Forwarded-For header. Verify with:
//   curl -H "X-Forwarded-For: 1.2.3.4" ...  -> logged req.ip must NOT be 1.2.3.4
// If req.ip shows an internal/proxy address instead, change this to 2.
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

// Daily cap on requests that actually hit an AI provider, per IP - PreYem
const MAX_DAILY_REAL_REQUESTS = 50;

// Hard daily cap for the whole server, independent of client IP - PreYem
const MAX_SERVER_DAILY_REAL_REQUESTS = 100;

// Daily counters live in requestLog.ts so they survive restarts/deploys - PreYem
function overDailyQuota(clientIp: string): boolean {
  if (getServerDailyCount() >= MAX_SERVER_DAILY_REAL_REQUESTS) return true;
  const used = getIpDailyCount(clientIp);
  if (used >= MAX_DAILY_REAL_REQUESTS) return true;
  incrementDailyCounts(clientIp);
  return false;
}

function rollbackDailyQuota(clientIp: string): void {
  decrementDailyCounts(clientIp);
}

// Set EXTENSION_KEY in Render's environment variables and use the same value
// in the extension's build. No hardcoded fallback: if unset, everything is 403.
const extensionFrontendKey = process.env.EXTENSION_KEY ?? "";

// Per-IP limit. No custom keyGenerator: the default uses req.ip, which Express
// derives safely from the connection + the single trusted proxy hop.
const limiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { serverError: "Too many requests, please slow down." },
});

app.use(cors());
app.use(express.json({ limit: "200kb" }));

const logViewKey = process.env.LOG_VIEW_KEY ?? "";

// Log every attempt to /summarize once the response finishes, so spam is
// visible too. To log only successful summaries, restrict to status === 200 - PreYem
function requestLogMiddleware(request: express.Request, response: express.Response, next: express.NextFunction) {
  // "close" fires after the response is fully sent (and after the route handler
  // runs), so provider set by summarize.ts is available here - PreYem
  response.on("close", () => {
    // Key-fail requests must be rejected before anything is logged, counted,
    // or stored, so spam can't grow memory or flood logs - PreYem
    if (response.statusCode === 403) return;
    const body = request.body as Record<string, unknown> | undefined;
    const entry = {
      id: makeId(),
      timestamp: new Date().toISOString(),
      ip: request.ip ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
      method: request.method,
      path: request.path,
      status: response.statusCode,
      provider: request.loggedProvider,
      post:
        body && typeof body.title === "string"
          ? {
              title: body.title,
              bodyPreview: bodyPreview(body.body),
              wordCount: wordCount(body.body),
              subreddit: typeof body.currentSubreddit === "string" ? body.currentSubreddit : "",
              author: typeof body.author === "string" ? body.author : "",
            }
          : null,
    };
    void logEntry(entry);
  });
  next();
}

app.use(
  "/summarize",
  // 0. Log every attempt once the response finishes - PreYem
  requestLogMiddleware,
  // 1. Check the key FIRST: bad requests are rejected before anything is
  //    logged, counted, or stored, so spam can't grow memory or flood logs.
  (request, response, next) => {
    const key = request.headers["extension-frontend-key"];
    if (!extensionFrontendKey || key !== extensionFrontendKey) {
      return response.status(403).json({ serverError: "Something went wrong" });
    }
    next();
  },
  // 2. Per-IP rate limit (real IP via req.ip).
  limiter,
  // 3. Daily quotas (per-IP and server-wide), skipped only in local debug mode.
  (request, response, next) => {
    // Quota is counted only when a provider actually served the request, so
    // failed summaries (500) don't consume the daily allowance. Rollback on
    // "close" fires after summarize.ts runs - PreYem
    const clientIp = request.ip ?? "unknown";
    if (!debugModeEnabled() && overDailyQuota(clientIp)) {
      console.warn(`[Backend] Daily quota exceeded for ${clientIp}`);
      return response.status(429).json({ serverError: "Daily limit reached, try again tomorrow." });
    }

    response.on("close", () => {
      if (!debugModeEnabled() && !request.loggedProvider) rollbackDailyQuota(clientIp);
    });
    next();
  },
  summarizeRouter,
);

function checkLogViewKey(request: express.Request): boolean {
  // Query param only for the HTML page's first load (key then lives in
  // sessionStorage and is sent as a header on fetches) - PreYem
  return Boolean(logViewKey && (request.headers["log-view-key"] === logViewKey || request.query.key === logViewKey));
}

app.get("/summary-logs", (request, response) => {
  if (!checkLogViewKey(request)) {
    return response.status(403).json({ serverError: "Oi bruv, you got a loicense for that endpoint or wot?" });
  }
  response.sendFile(path.join(process.cwd(), "public", "summary-logs", "stats.html"));
});

// Static assets (style.css, script.js) are loaded by the browser without custom headers,
// so they must be served before the key check; the key is already in sessionStorage - PreYem
app.use("/summary-logs", express.static(path.join(process.cwd(), "public", "summary-logs")));

app.use("/summary-logs", (request, response, next) => {
  if (!checkLogViewKey(request)) {
    return response.status(403).json({ serverError: "Oi bruv, you got a loicense for that endpoint or wot?" });
  }
  next();
});

app.get("/summary-logs/data", (request, response) => {
  if (!checkLogViewKey(request)) {
    return response.status(403).json({ serverError: "Oi bruv, you got a loicense for that endpoint or wot?" });
  }
  response.json(getStats());
});

app.get("/latest-requests", (request, response) => {
  if (!checkLogViewKey(request)) {
    return response.status(403).json({ serverError: "Oi bruv, you got a loicense for that endpoint or wot?" });
  }
  const entries = getEntries();
  response.json({ count: entries.length, entries });
});

// Clear the request log (same LOG_VIEW_KEY as the stats page) - PreYem
app.delete("/summary-logs", async (request, response) => {
  if (!checkLogViewKey(request)) {
    return response.status(403).json({ serverError: "Oi bruv, you got a loicense for that endpoint or wot?" });
  }
  try {
    await clearLog();
    console.log("[RequestLog] Log cleared via API");
    response.json({ cleared: true });
  } catch (err) {
    console.error("[RequestLog] Failed to clear log:", err);
    response.status(500).json({ serverError: "Failed to clear log" });
  }
});

app.get("/", (request, response) => {
  response.status(200).json({
    successMessage: "Reddit Summarizer express backend is working",
  });
});

app.listen(PORT, () => {
  console.log("Express server running on http://localhost:" + PORT || 3000);
});
