import type {
  LeaderboardSnapshotResponse,
  MetricsResponse,
  QuizAnswerRequest,
  QuizAnswerResponse,
  QuizNextResponse,
} from "./apiTypes";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export async function quizNext(sessionId?: string | null): Promise<QuizNextResponse> {
  return await apiGet<QuizNextResponse>(`/v1/quiz/next${buildQuery({ sessionId: sessionId ?? undefined })}`);
}

export async function quizAnswer(req: QuizAnswerRequest): Promise<QuizAnswerResponse> {
  return await apiPost<QuizAnswerResponse>("/v1/quiz/answer", req);
}

export async function leaderboardScore(params?: { sessionId?: string | null; limit?: number }): Promise<LeaderboardSnapshotResponse> {
  return await apiGet<LeaderboardSnapshotResponse>(
    `/v1/leaderboard/score${buildQuery({ sessionId: params?.sessionId ?? undefined, limit: params?.limit })}`
  );
}

export async function leaderboardStreak(params?: { sessionId?: string | null; limit?: number }): Promise<LeaderboardSnapshotResponse> {
  return await apiGet<LeaderboardSnapshotResponse>(
    `/v1/leaderboard/streak${buildQuery({ sessionId: params?.sessionId ?? undefined, limit: params?.limit })}`
  );
}

export async function metrics(sessionId: string): Promise<MetricsResponse> {
  return await apiGet<MetricsResponse>(`/v1/metrics${buildQuery({ sessionId })}`);
}

