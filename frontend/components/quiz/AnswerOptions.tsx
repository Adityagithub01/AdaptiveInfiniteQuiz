"use client";

import { memo, useCallback } from "react";

export const AnswerOptions = memo(function AnswerOptions(props: {
  choices: string[];
  disabled?: boolean;
  onSelect: (answer: string) => void;
}) {
  const onClick = useCallback(
    (answer: string) => () => {
      props.onSelect(answer);
    },
    [props]
  );

  return (
    <div className="grid grid-cols-1 gap-3">
      {props.choices.map((c) => (
        <button
          key={c}
          type="button"
          disabled={props.disabled}
          onClick={onClick(c)}
          className="rounded-xl border border-foreground/10 bg-background px-4 py-3 text-left text-sm text-foreground/90 shadow-sm transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {c}
        </button>
      ))}
    </div>
  );
});

