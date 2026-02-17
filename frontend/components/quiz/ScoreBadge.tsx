"use client";

import { memo } from "react";

export const ScoreBadge = memo(function ScoreBadge(props: { score: number }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-2">
      <div className="text-xs text-foreground/70">Score</div>
      <div className="text-lg font-semibold tabular-nums">{props.score}</div>
    </div>
  );
});

