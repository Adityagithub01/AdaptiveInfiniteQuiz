"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { Moon, Sun } from "lucide-react";

const navItems = [
  { href: "/quiz", label: "Quiz" },
  { href: "/leaderboard", label: "Leaderboards" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export const SiteHeader = memo(function SiteHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const items = useMemo(() => navItems, []);

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-lg px-2 py-1 text-sm font-semibold tracking-tight hover:bg-foreground/5"
          >
            AdaptiveInfiniteQuiz
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-10 w-10 px-0"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </Container>
    </header>
  );
});

