"use client";

import { memo, useMemo } from "react";
import type { LeaderboardEntry } from "@/lib/apiTypes";

export const LeaderboardTable = memo(function LeaderboardTable(props: {
  title: string;
  entries: LeaderboardEntry[];
  valueLabel: string;
  userRank?: number | null;
}) {
  const rows = useMemo(() => props.entries, [props.entries]);

  return (
    <section className="rounded-xl border border-foreground/10 bg-background p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {typeof props.userRank === "number" ? (
          <div className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs">
            Your rank: <span className="font-medium tabular-nums">{props.userRank}</span>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-foreground/5">
            <tr className="text-left text-foreground/70">
              <th className="px-4 py-2 font-medium">Rank</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">{props.valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.userId} className="border-t border-foreground/10">
                <td className="px-4 py-2 tabular-nums">{e.rank}</td>
                <td className="px-4 py-2 font-mono text-xs text-foreground/80">
                  {e.userId.slice(0, 8)}…
                </td>
                <td className="px-4 py-2 tabular-nums">{e.value}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr className="border-t border-foreground/10">
                <td className="px-4 py-6 text-center text-foreground/60" colSpan={3}>
                  No entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
});

