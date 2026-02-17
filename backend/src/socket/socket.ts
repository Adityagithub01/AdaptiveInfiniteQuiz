import { Server } from "socket.io";

export function setupSocketIO(io: Server) {
  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Subscribe to leaderboard updates (score or streak)
    socket.on("leaderboard:subscribe", (type: "score" | "streak") => {
      if (type !== "score" && type !== "streak") return;
      socket.join(`leaderboard:${type}`);
    });

    socket.on("leaderboard:unsubscribe", (type: "score" | "streak") => {
      if (type !== "score" && type !== "streak") return;
      socket.leave(`leaderboard:${type}`);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
