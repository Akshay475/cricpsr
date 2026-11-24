import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import http from "node:http";
import { Server as SocketServer } from "socket.io";
import { setAuctionSocketServer } from "./sockets/auction.js";
import { logger } from "./config/logger.js";

async function start() {
  await connectDatabase();
  const httpServer = http.createServer(createApp());
  const io = new SocketServer(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true }
  });
  io.on("connection", (socket) => {
    socket.on("auction:join", (auctionId: unknown) => {
      if (typeof auctionId === "string" && /^[a-f\d]{24}$/i.test(auctionId)) {
        socket.join(`auction:${auctionId}`);
      }
    });
  });
  setAuctionSocketServer(io);
  httpServer.listen(env.APP_PORT, () => {
    logger.info("server_started", { port: env.APP_PORT });
  });
}

start().catch((error) => {
  logger.error("server_start_failed", error);
  process.exit(1);
});
