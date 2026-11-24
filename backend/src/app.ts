import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { locationRouter } from "./routes/locations.js";
import { playerRouter } from "./routes/players.js";
import { subscriptionRouter } from "./routes/subscriptions.js";
import { webhookRouter } from "./routes/webhooks.js";
import { teamRouter } from "./routes/teams.js";
import { tournamentRouter } from "./routes/tournaments.js";
import { matchRouter } from "./routes/matches.js";
import { rankingRouter, ratingRouter } from "./routes/ratings.js";
import { challengeRouter } from "./routes/challenges.js";
import { turfRouter } from "./routes/turfs.js";
import { openMatchRouter } from "./routes/open-matches.js";
import { auctionRouter } from "./routes/auctions.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { logger } from "./config/logger.js";
import { metricsRegistry, recordHttpRequest } from "./config/metrics.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use("/api/webhooks", express.raw({ type: "application/json", limit: "1mb" }), webhookRouter);
  app.use(express.json({ limit: "1mb" }));

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route = req.route ? `${req.baseUrl}${String(req.route.path)}` : "unmatched";
      recordHttpRequest(req.method, route, res.statusCode, durationSeconds);
      logger.info("http_request", {
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs: Math.round(durationSeconds * 1000)
      });
    });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/locations", locationRouter);
  app.use("/api/players", playerRouter);
  app.use("/api/subscriptions", subscriptionRouter);
  app.use("/api/teams", teamRouter);
  app.use("/api/tournaments", tournamentRouter);
  app.use("/api/matches", matchRouter);
  app.use("/api/players", ratingRouter);
  app.use("/api/rankings", rankingRouter);
  app.use("/api/challenges", challengeRouter);
  app.use("/api/turfs", turfRouter);
  app.use("/api/open-matches", openMatchRouter);
  app.use("/api/auctions", auctionRouter);
  app.use("/api/marketplace", marketplaceRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("request_failed", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  });
  return app;
}
