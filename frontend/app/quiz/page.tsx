"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnswerOptions } from "@/components/quiz/AnswerOptions";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { ScoreBadge } from "@/components/quiz/ScoreBadge";
import { StreakIndicator } from "@/components/quiz/StreakIndicator";
import { Container } from "@/components/ui/Container";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { quizAnswer, quizNext } from "@/lib/apiClient";
import { getSessionIdFromLocalStorage, setSessionId } from "@/lib/session";
import type { QuizNextResponse } from "@/lib/apiTypes";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; q: QuizNextResponse }
  | { kind: "error"; message: string };

export default function QuizPage() {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    scoreDelta: number;
  } | null>(null);

  const q = view.kind === "ready" ? view.q : null;

  const loadNext = useCallback(async () => {
    setLastResult(null);
    try {
      const existing = getSessionIdFromLocalStorage();
      const next = await quizNext(existing);
      if (!existing || existing !== next.sessionId) {
        setSessionId(next.sessionId);
      }
      setView({ kind: "ready", q: next });
    } catch (e) {
      setView({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load quiz.",
      });
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const headerStats = useMemo(() => {
    if (!q) return null;
    return {
      score: q.currentScore,
      streak: q.currentStreak,
      difficulty: q.difficulty,
      stateVersion: q.stateVersion,
    };
  }, [q]);

  const onSelect = useCallback(
    async (answer: string) => {
      if (!q || submitting) return;
      setSubmitting(true);
      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;

        const res = await quizAnswer({
          sessionId: q.sessionId,
          questionId: q.questionId,
          answer,
          stateVersion: q.stateVersion,
          answerIdempotencyKey: idempotencyKey,
        });

        setLastResult({ correct: res.correct, scoreDelta: res.scoreDelta });
        await loadNext();
      } catch (e) {
        // If we get a 409 (stateVersion conflict), just refresh next question/state.
        await loadNext();
      } finally {
        setSubmitting(false);
      }
    },
    [q, submitting, loadNext]
  );

  return (
    <main className="py-10">
      <Container>
        <Card>
          <CardHeader
            title="Quiz"
            description="One question at a time. Difficulty adapts as you play."
            right={
              headerStats ? (
                <div className="flex flex-wrap items-center gap-3">
                  <ScoreBadge score={headerStats.score} />
                  <StreakIndicator streak={headerStats.streak} />
                  <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-2">
                    <div className="text-xs text-foreground/70">Difficulty</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {headerStats.difficulty}
                    </div>
                  </div>
                </div>
              ) : null
            }
          />
          <CardBody className="space-y-5">
            {lastResult ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  lastResult.correct
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                }`}
              >
                {lastResult.correct ? "Correct" : "Wrong"} · Score delta{" "}
                <span className="font-medium tabular-nums">
                  {lastResult.scoreDelta}
                </span>
              </div>
            ) : null}

            {view.kind === "loading" ? (
              <div className="rounded-xl border border-foreground/10 bg-background p-6 text-foreground/70 shadow-sm">
                Loading…
              </div>
            ) : null}

            {view.kind === "error" ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-700 dark:text-rose-300">
                {view.message}
              </div>
            ) : null}

            {q ? (
              <div className="grid grid-cols-1 gap-6">
                <QuestionCard prompt={q.prompt} difficulty={q.difficulty} />
                <AnswerOptions
                  choices={q.choices}
                  disabled={submitting}
                  onSelect={onSelect}
                />
                <div className="text-xs text-foreground/50">
                  Session:{" "}
                  <span className="font-mono">{q.sessionId.slice(0, 8)}…</span> ·
                  State v{q.stateVersion}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </Container>
    </main>
  );
}

