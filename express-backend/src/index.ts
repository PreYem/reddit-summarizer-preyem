import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter, { debugModeEnabled } from "./routes/summarize";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const app = express();
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

// Daily cap on requests that actually hit an AI provider, per IP - PreYem
const MAX_DAILY_REAL_REQUESTS = 50;

// Hard daily cap for the whole server, independent of client IP - PreYem
const MAX_SERVER_DAILY_REAL_REQUESTS = 100;

function getClientIp(request: express.Request): string {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return ipKeyGenerator(xff.split(",")[0].trim());
  }
  return ipKeyGenerator(request.ip ?? "unknown");
}

const attemptLog = new Map<string, { count: number; resetAt: number }>();

function logAttempts(clientIp: string) {
  const now = Date.now();
  const entry = attemptLog.get(clientIp);

  if (!entry || now > entry.resetAt) {
    attemptLog.set(clientIp, { count: 1, resetAt: now + WINDOW_MS });
    console.log(`Attempts left for ${clientIp}: ${MAX_REQUESTS - 1}/${MAX_REQUESTS}`);
    return;
  }

  entry.count++;
  const remaining = Math.max(MAX_REQUESTS - entry.count, 0);
  console.log(`Attempts left for ${clientIp}: ${remaining}/${MAX_REQUESTS}`);
}

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
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

const extensionFrontendKey = "reddit-summary-yem0417";

app.use(cors());
app.use(express.json());

app.use("/summarize", (request, response, next) => {
  const clientIp = getClientIp(request);
  console.log("Client IP:", clientIp);
  logAttempts(clientIp);
  next();
});

app.use(
  "/summarize",
  limiter,
  (request, response, next) => {
    const key = request.headers["extension-frontend-key"];
    if (key !== extensionFrontendKey) {
      return response.status(403).json({ serverError: "Something went wrong" });
    }
    if (!debugModeEnabled() && overDailyQuota(getClientIp(request))) {
      console.warn(`[Backend] Daily quota exceeded for ${getClientIp(request)}`);
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
  console.log("Express server running on http://localhost:" + PORT);
});