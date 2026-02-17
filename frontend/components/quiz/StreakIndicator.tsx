"use client";

import { memo } from "react";

export const StreakIndicator = memo(function StreakIndicator(props: {
  streak: number;
}) {
  const label =
    props.streak >= 6 ? "Hot" : props.streak >= 3 ? "Warm" : "Starting";

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-2">
      <div className="text-xs text-foreground/70">Streak</div>
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold tabular-nums">{props.streak}</div>
        <div className="text-xs text-foreground/60">{label}</div>
      </div>
    </div>
  );
});

