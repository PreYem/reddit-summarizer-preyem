import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter from "./routes/summarize";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

function getClientIp(request: express.Request): string {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return request.ip ?? "unknown";
}

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp, 
  message: { backendError: "Too many requests, please slow down." },
});

const extensionFrontendKey = "reddit-summary-yem0417";

app.use(cors());
app.use(express.json());

app.use("/summarize", async (request, response, next) => {
  const clientIp = getClientIp(request);
  console.log("Client IP:", clientIp);

  const store = (limiter as any).store;
  if (store) {
    const record = await store.get(clientIp);
    const used = record?.totalHits ?? 0;
    const remaining = Math.max(MAX_REQUESTS - used, 0);
    console.log(`Attempts left for ${clientIp}: ${remaining}/${MAX_REQUESTS}`);
  }

  next();
});

app.use(
  "/summarize",
  limiter,
  (request, response, next) => {
    const key = request.headers["extension-frontend-key"];

    if (key !== extensionFrontendKey) {
      return response.status(403).json({ error: "Something went wrong" });
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