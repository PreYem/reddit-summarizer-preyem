import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter, { debugModeEnabled } from "./routes/summarize";
import rateLimit from "express-rate-limit";

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

const dailyRealRequestLog = new Map<string, number>();
let serverDailyRealRequests = 0;

function overDailyQuota(clientIp: string): boolean {
  if (serverDailyRealRequests >= MAX_SERVER_DAILY_REAL_REQUESTS) return true;
  const used = dailyRealRequestLog.get(clientIp) ?? 0;
  if (used >= MAX_DAILY_REAL_REQUESTS) return true;
  serverDailyRealRequests++;
  dailyRealRequestLog.set(clientIp, used + 1);
  return false;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

let currentDay = dayKey();

setInterval(() => {
  const today = dayKey();
  if (today !== currentDay) {
    currentDay = today;
    serverDailyRealRequests = 0;
    dailyRealRequestLog.clear();
    console.log(`[Backend] Daily quota counters reset for ${currentDay}`);
  }
}, 60 * 1000).unref();

app.use(cors());
app.use(express.json({ limit: "200kb" }));

app.use(
  "/summarize",
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
    const clientIp = request.ip ?? "unknown";
    if (!debugModeEnabled() && overDailyQuota(clientIp)) {
      console.warn(`[Backend] Daily quota exceeded for ${clientIp}`);
      return response.status(429).json({ serverError: "Daily limit reached, try again tomorrow." });
    }
    next();
  },
  summarizeRouter,
);

app.get("/", (request, response) => {
  response.status(200).json({
    successMessage: "Reddit Summarizer express backend is working",
  });
});

app.listen(PORT, () => {
  console.log("Express server running on http://localhost:" + PORT || 3000);
});
