import "dotenv/config";
import cors from "cors";
import express from "express";
import communityRoutes from "./routes/communityRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import threadRoutes from "./routes/threadRoutes.js";
import mediaRoutes from "./routes/mediaRoutes.js";
import { errorHandler, notFoundHandler } from "./lib/errorHandler.js";

const app = express();

const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: configuredOrigins.length ? configuredOrigins : true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pqc-chat-backend" });
});

app.use("/api/community", communityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/thread", threadRoutes);
app.use("/api/media", mediaRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
