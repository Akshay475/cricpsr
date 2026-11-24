import type { Server as SocketServer } from "socket.io";

let auctionServer: SocketServer | null = null;

export function setAuctionSocketServer(server: SocketServer) {
  auctionServer = server;
}

export function emitAuctionBid(auctionId: string, payload: unknown) {
  auctionServer?.to(`auction:${auctionId}`).emit("auction:bid", payload);
}

export function emitAuctionSelection(auctionId: string, payload: unknown) {
  auctionServer?.to(`auction:${auctionId}`).emit("auction:selection", payload);
}
