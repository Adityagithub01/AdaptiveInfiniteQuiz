"use client";

import { useEffect, useMemo, useState } from "react";
import { metrics } from "@/lib/apiClient";
import { getSessionIdFromLocalStorage } from "@/lib/session";
import type { MetricsResponse } from "@/lib/apiTypes";
import { ScoreBadge } from "@/components/quiz/ScoreBadge";
import { StreakIndicator } from "@/components/quiz/StreakIndicator";
import { Container } from "@/components/ui/Container";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function DashboardPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = getSessionIdFromLocalStorage();
    if (!sessionId) {
      setError("No session found. Play a quiz first to generate metrics.");
      return;
    }
    metrics(sessionId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metrics."));
  }, []);

  const histogram = useMemo(() => {
    const h = data?.difficultyHistogram ?? {};
    const entries = Array.from({ length: 10 }, (_, i) => {
      const k = String(i + 1);
      return { difficulty: i + 1, count: Number(h[k] ?? 0) };
    });
    const max = Math.max(1, ...entries.map((e) => e.count));
    return { entries, max };
  }, [data]);

  const recent = useMemo(() => {
    const correct = data?.recentPerformanceWindow.correct ?? [];
    const difficulty = data?.recentPerformanceWindow.difficulty ?? [];
    const n = Math.max(correct.length, difficulty.length);
    return Array.from({ length: n }, (_, i) => ({
      correct: Boolean(correct[i]),
      difficulty: Number(difficulty[i] ?? 0),
    }));
  }, [data]);

  return (
    <main className="py-10">
      <Container>
        <Card>
          <CardHeader
            title="Metrics Dashboard"
            description="Accuracy, difficulty distribution, and recent performance."
            right={
              data ? (
                <div className="flex flex-wrap items-center gap-3">
                  <ScoreBadge score={data.currentScore} />
                  <StreakIndicator streak={data.currentStreak} />
                  <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-2">
                    <div className="text-xs text-foreground/70">Difficulty</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {data.currentDifficulty}
                    </div>
                  </div>
                </div>
              ) : null
            }
          />
          <CardBody className="space-y-6">
            {error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-700 dark:text-rose-300">
                {error}
              </div>
            ) : null}

            {!data && !error ? (
              <div className="rounded-xl border border-foreground/10 bg-background p-6 text-foreground/70 shadow-sm">
                Loading…
              </div>
            ) : null}

            {data ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <CardHeader title="Accuracy" description="Last 10 and overall." />
                  <CardBody>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3">
                        <div className="text-xs text-foreground/70">Last 10</div>
                        <div className="text-xl font-semibold tabular-nums">
                          {Math.round(data.accuracyLast10 * 100)}%
                        </div>
                      </div>
                      <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3">
                        <div className="text-xs text-foreground/70">Overall</div>
                        <div className="text-xl font-semibold tabular-nums">
                          {Math.round(data.accuracyOverall * 100)}%
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader
                    title="Recent Performance"
                    description="Most recent answers (up to 10)."
                  />
                  <CardBody>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((r, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                            r.correct
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          <span className="font-medium">{r.correct ? "✓" : "✕"}</span>
                          <span className="tabular-nums">D{r.difficulty}</span>
                        </div>
                      ))}
                      {recent.length === 0 ? (
                        <div className="text-sm text-foreground/60">No answers yet.</div>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>

                <Card className="overflow-hidden lg:col-span-2">
                  <CardHeader
                    title="Difficulty Histogram"
                    description="Attempts per difficulty (1–10)."
                  />
                  <CardBody>
                    <div className="grid grid-cols-1 gap-2">
                      {histogram.entries.map((e) => {
                        const w = Math.round((e.count / histogram.max) * 100);
                        return (
                          <div key={e.difficulty} className="flex items-center gap-3">
                            <div className="w-10 text-xs text-foreground/70 tabular-nums">
                              D{e.difficulty}
                            </div>
                            <div className="flex-1">
                              <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                                <div
                                  className="h-2 rounded-full bg-foreground/50"
                                  style={{ width: `${w}%` }}
                                />
                              </div>
                            </div>
                            <div className="w-12 text-right text-xs text-foreground/70 tabular-nums">
                              {e.count}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </Container>
    </main>
  );
}

