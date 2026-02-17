import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { healthRouter } from "./routes/health";
import { quizRouter } from "./routes/quiz";
import { v1Router } from "./routes/v1";
import { db } from "./config/database";
import { redisClient } from "./config/redis";
import { setupSocketIO } from "./socket/socket";
import { createApiRateLimiter } from "./middleware/rateLimit";
import { setSocketServer } from "./socket/broadcast";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/health", healthRouter);
app.use("/quiz", quizRouter);
app.use("/v1", createApiRateLimiter(), v1Router);

// Socket.io setup
setupSocketIO(io);
setSocketServer(io);

// Initialize connections
async function startServer() {
  try {
    // Test PostgreSQL connection
    await db.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected");

    // Test Redis connection
    await redisClient.connect();
    console.log("✅ Redis connected");

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await redisClient.quit();
  await db.end();
  process.exit(0);
});
