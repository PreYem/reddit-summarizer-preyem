import "dotenv/config";
import express from "express";
import cors from "cors";
import summarizeRouter from "./routes/summarize";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/summarize", summarizeRouter);

app.listen(PORT, () => {
  console.log("Express bacckend running on http://localhost:" + PORT);
});
