"use client";

import { memo } from "react";
import { cn } from "@/lib/cn";

export const Card = memo(function Card(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-foreground/10 bg-background/60 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/40",
        props.className
      )}
    >
      {props.children}
    </section>
  );
});

export const CardHeader = memo(function CardHeader(props: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-foreground/10 px-6 py-5">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-sm text-foreground/60">{props.description}</p>
        ) : null}
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  );
});

export const CardBody = memo(function CardBody(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-6 py-5", props.className)}>{props.children}</div>;
});

