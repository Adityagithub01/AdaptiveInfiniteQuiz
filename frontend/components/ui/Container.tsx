"use client";

import { memo } from "react";
import { cn } from "@/lib/cn";

export const Container = memo(function Container(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-6", props.className)}>
      {props.children}
    </div>
  );
});

