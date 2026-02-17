"use client";

import { memo } from "react";

export const QuestionCard = memo(function QuestionCard(props: {
  prompt: string;
  difficulty: number;
}) {
  return (
    <section className="rounded-xl border border-foreground/10 bg-background p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Question</h2>
        <span className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs font-medium">
          Difficulty {props.difficulty}
        </span>
      </div>
      <p className="text-base leading-relaxed text-foreground/90">{props.prompt}</p>
    </section>
  );
});

