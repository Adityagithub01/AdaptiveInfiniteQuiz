import type { Server } from "socket.io";
import type { LeaderboardSnapshot } from "../services/leaderboardService";

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function broadcastLeaderboardUpdate(snapshot: LeaderboardSnapshot) {
  if (!io) return;
  io.to(`leaderboard:${snapshot.type}`).emit("leaderboard:update", snapshot);
}