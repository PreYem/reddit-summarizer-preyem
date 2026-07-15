import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter from "./routes/summarize";

const app = express();
const PORT = process.env.PORT || 3000;

// Static string sent by the extension with every request
// Its purpose is to reduce requests sources outside the extension itself, aka tools like postman.
// It's not a full proof method since it's baked into the frontend but helps with security to a minor extent - PreYem

const extensionFrontendKey = "reddit-summary-yem0417";

app.use(cors());
app.use(express.json());

app.use(
  "/summarize",
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
