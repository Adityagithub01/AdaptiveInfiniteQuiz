import { Router } from "express";
import { v1QuizRouter } from "./quiz";
import { v1LeaderboardRouter } from "./leaderboard";
import { v1MetricsRouter } from "./metrics";

export const v1Router = Router();

v1Router.use("/quiz", v1QuizRouter);
v1Router.use("/leaderboard", v1LeaderboardRouter);
v1Router.use("/metrics", v1MetricsRouter);

