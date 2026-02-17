"use client";

import { memo } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/90",
  secondary: "border border-foreground/10 bg-foreground/5 hover:bg-foreground/10",
  ghost: "hover:bg-foreground/5",
};

export const Button = memo(function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
  }
) {
  const { className, variant = "secondary", ...rest } = props;
  return <button className={cn(base, variants[variant], className)} {...rest} />;
});

