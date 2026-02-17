"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { LeaderboardSnapshotResponse } from "@/lib/apiTypes";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

function socketBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

type LiveState = {
  score: LeaderboardSnapshotResponse;
  streak: LeaderboardSnapshotResponse;
};

export const LeaderboardLive = memo(function LeaderboardLive(props: {
  initialScore: LeaderboardSnapshotResponse;
  initialStreak: LeaderboardSnapshotResponse;
}) {
  const [state, setState] = useState<LiveState>({
    score: props.initialScore,
    streak: props.initialStreak,
  });

  const scoreUserRank = state.score.userRank;
  const streakUserRank = state.streak.userRank;

  useEffect(() => {
    let socket: Socket | null = null;

    socket = io(socketBaseUrl(), {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket?.emit("leaderboard:subscribe", "score");
      socket?.emit("leaderboard:subscribe", "streak");
    });

    socket.on("leaderboard:update", (snapshot: any) => {
      // snapshot: { type, updatedAt, limit, entries }
      if (!snapshot || (snapshot.type !== "score" && snapshot.type !== "streak")) return;
      setState((prev) => {
        if (snapshot.type === "score") {
          return { ...prev, score: { ...prev.score, ...snapshot } };
        }
        return { ...prev, streak: { ...prev.streak, ...snapshot } };
      });
    });

    return () => {
      try {
        socket?.emit("leaderboard:unsubscribe", "score");
        socket?.emit("leaderboard:unsubscribe", "streak");
        socket?.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  const tables = useMemo(() => {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeaderboardTable
          title="Total Score"
          valueLabel="Score"
          entries={state.score.entries}
          userRank={scoreUserRank}
        />
        <LeaderboardTable
          title="Current Streak"
          valueLabel="Streak"
          entries={state.streak.entries}
          userRank={streakUserRank}
        />
      </div>
    );
  }, [state.score.entries, state.streak.entries, scoreUserRank, streakUserRank]);

  return tables;
});

