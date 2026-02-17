



"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function Home() {
  const [healthStatus, setHealthStatus] = useState<string>("Checking...");

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
        const response = await fetch(`${backendUrl}/health`);
        const data = await response.json();
        setHealthStatus(data.status === "ok" ? "✅ Connected" : "❌ Error");
      } catch (error) {
        setHealthStatus("❌ Disconnected");
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative py-12">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/5 p-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_30%_10%,rgba(127,127,127,0.25),transparent)]" />
          <div className="relative">
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Adaptive quizzes. Infinite practice. Real-time competition.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-foreground/70">
              Answer questions, build streaks, and watch your rank update live.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/quiz">
                <Button variant="primary">Start Quiz</Button>
              </Link>
              <Link href="/leaderboard">
                <Button>Leaderboards</Button>
              </Link>
              <Link href="/dashboard">
                <Button>Metrics</Button>
              </Link>
            </div>

            <div className="mt-6 text-sm text-foreground/60">
              Backend status: <span className="font-medium">{healthStatus}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardHeader
              title="Adaptive difficulty"
              description="Stability rules prevent ping-pong oscillations."
            />
            <CardBody className="text-sm text-foreground/70">
              Increases require sustained correctness; decreases react quickly when you miss.
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Scoring & streaks"
              description="Multipliers reward consistency and accuracy."
            />
            <CardBody className="text-sm text-foreground/70">
              Your streak and last-10 accuracy shape the score delta on every answer.
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Live leaderboards"
              description="WebSockets push updates instantly."
            />
            <CardBody className="text-sm text-foreground/70">
              Score and current-streak leaderboards update after each committed answer.
            </CardBody>
          </Card>
        </div>
      </Container>
    </main>
  );
}
