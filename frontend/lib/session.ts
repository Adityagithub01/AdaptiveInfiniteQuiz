const LS_KEY = "aiq_sessionId";
const COOKIE_KEY = "aiq_sessionId";

export function getSessionIdFromLocalStorage(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LS_KEY);
}

export function setSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, sessionId);
  // Also set a cookie so SSR pages (leaderboard) can read it.
  // Not httpOnly (set from client), scoped to site.
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(sessionId)}; path=/; max-age=31536000; samesite=lax`;
}

