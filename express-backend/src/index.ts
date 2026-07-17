import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter from "./routes/summarize";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 2);
const PORT = process.env.PORT || 3000;

// Static string sent by the extension with every request
// Its purpose is to reduce requests sources outside the extension itself, aka tools like postman.
// It's not a full proof method since it's baked into the frontend but helps with security to a minor extent - PreYem
const extensionFrontendKey = "reddit-summary-yem0417";

// Rate limiting per API request - PreYem

const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { backendError: "Too many requests, please slow down." },
});

app.use(cors());
app.use(express.json());

app.use("/summarize", async (request, response, next) => {
  console.log("Client IP:", request.ip);

  const store = (limiter as any).store;
  if (store) {
    const record = await store.get(request.ip);
    const used = record?.totalHits ?? 0;
    const remaining = Math.max(MAX_REQUESTS - used, 0);
    console.log(`Attempts left for ${request.ip}: ${remaining}/${MAX_REQUESTS}`);
  }
  next();
});

app.use(
  "/summarize",
  limiter,
  (request, response, next) => {
    const key = request.headers["extension-frontend-key"];

    if (key !== extensionFrontendKey) {
      console.log(extensionFrontendKey);
      console.log(key);
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
