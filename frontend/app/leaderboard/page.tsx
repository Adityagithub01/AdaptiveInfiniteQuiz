import { cookies } from "next/headers";
import type { LeaderboardSnapshotResponse } from "@/lib/apiTypes";
import { LeaderboardLive } from "@/components/leaderboard/LeaderboardLive";
import { Container } from "@/components/ui/Container";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

function baseUrl(): string {
  // SSR runs inside the Next.js server (and inside Docker in compose).
  // Prefer internal service DNS to avoid calling localhost (which would be the frontend container).
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3001"
  );
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return (await res.json()) as T;
}

export default async function LeaderboardPage() {
  const sessionId = cookies().get("aiq_sessionId")?.value ?? null;
  const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";

  const [score, streak] = await Promise.all([
    getJson<LeaderboardSnapshotResponse>(`/v1/leaderboard/score${q}`),
    getJson<LeaderboardSnapshotResponse>(`/v1/leaderboard/streak${q}`),
  ]);

  return (
    <main className="py-10">
      <Container>
        <Card>
          <CardHeader
            title="Leaderboards"
            description="SSR initial snapshot, then live via WebSockets."
          />
          <CardBody>
            <LeaderboardLive initialScore={score} initialStreak={streak} />
          </CardBody>
        </Card>
      </Container>
    </main>
  );
}

