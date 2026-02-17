# AdaptiveInfiniteQuiz

AdaptiveInfiniteQuiz is a full-stack quiz platform with:
- **Adaptive difficulty** (stability rules to prevent ping-pong)
- **Real-time leaderboards** (Socket.io)
- **PostgreSQL** as the source of truth
- **Redis caching** for hot reads and leaderboard snapshots

The repo is structured as a **Next.js App Router frontend** + **Express API backend**.

## Architecture

- **Frontend (Next.js + Tailwind + TS)**:
  - `/quiz`: one-question flow using `GET /v1/quiz/next` and `POST /v1/quiz/answer`
  - `/leaderboard`: SSR initial snapshot + live updates via WebSockets
  - `/dashboard`: metrics view from `GET /v1/metrics`

- **Backend (Express + TS)**:
  - **Postgres**: sessions, questions, answer log, user state, leaderboard tables
  - **Redis**:
    - session→userId cache
    - user_state cache
    - question pools (by difficulty) + question cache
    - leaderboard ZSETs + cached snapshots
  - **Socket.io** broadcasts leaderboard snapshot updates to rooms:
    - `leaderboard:score`
    - `leaderboard:streak`

## Adaptive difficulty algorithm (high-level)

Difficulty range is **1–10** (clamped).

Rules implemented (see `backend/src/services/adaptiveDifficulty.ts`):
- **Wrong answer** → difficulty decreases (fast correction)
- **Correct answer**:
  - only increases after **2 consecutive correct** (minimum streak gate)
  - rolling window (last 5 answers):
    - \(>70\%\) correct → increase
    - \(<40\%\) correct → decrease
- **Streak tracking** and **max streak**
- **Streak decay**: after **24h inactivity**, streak resets before applying the next answer

The design prevents “ping-pong” oscillation by requiring **sustained performance** before increases.

## Scoring (formula)

On each answer:
\[
scoreDelta = (difficulty \times 10)\times streakMultiplier \times accuracyFactor
\]

- `streakMultiplier`: 1–2 → 1.0x, 3–5 → 1.5x, 6+ → 2.0x
- `accuracyFactor`: % correct in **last 10 answers** (current + previous 9)
- Wrong answers apply the same magnitude as a **negative** delta.

## Redis caching strategy (TTL + invalidation)

Redis keys and default TTLs are configurable via `backend/.env`.

- **Session → userId** (`session:user:{sessionId}`): default **3600s**
  - Avoids repeated DB lookups; supports stateless backend.
- **User state snapshot** (`user_state:{userId}`): default **15s**
  - **Write-through after commit** in `POST /v1/quiz/answer`.
  - Reads used in `GET /v1/quiz/next` and `GET /v1/metrics`.
- **Question pool by difficulty** (`questions:pool:difficulty:{d}`): default **6h**
  - Redis SET of question IDs per difficulty, lazily rebuilt.
  - Avoids DB `ORDER BY RANDOM()` scans.
- **Question cache** (`question:{questionId}`): default **24h**
  - Stores public question shape only (no correct hash).
- **Leaderboard snapshots** (`leaderboard:snapshot:{type}:{limit}`): default **5s**
  - Write-through refresh on every answer submission.

**Strong consistency rule**:
- Postgres is the source of truth for writes.
- Cache updates and WebSocket broadcasts happen **after DB commit**.

## Setup (local dev)

### Prerequisites
- Node.js 20+
- Docker Desktop (recommended for Postgres/Redis)

### 1) Environment variables

- Frontend:
  - copy `frontend/.env.example` → `frontend/.env`
- Backend:
  - copy `backend/.env.example` → `backend/.env`
- (Optional) root:
  - copy `.env.example` → `.env` (for compose variables)

### 2) Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

### 3) Start Postgres + Redis

```bash
docker-compose up -d postgres redis
```

### 4) Run migrations + seed questions

```bash
cd backend
npm run migrate
npm run seed:questions
```

### 5) Run backend + frontend

```bash
cd backend && npm run dev
# in another terminal:
cd frontend && npm run dev
```

Open:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:3001/health`

## Docker (one command)

This project is set up so it runs with:

```bash
docker-compose up --build
```

Notes:
- The **backend container runs migrations automatically** at startup (idempotent SQL).
- For SSR inside Docker, the frontend uses `BACKEND_INTERNAL_URL` (defaults to `http://backend:3001`).

## API documentation (v1)

### Quiz

#### `GET /v1/quiz/next`
Query:
- `sessionId` (optional)

Returns:
- `questionId, difficulty, prompt, choices`
- `sessionId, stateVersion`
- `currentScore, currentStreak`

#### `POST /v1/quiz/answer`
Body:
- `sessionId`
- `questionId`
- `answer`
- `stateVersion` (optimistic locking)
- `answerIdempotencyKey` (idempotency for retries)

Returns:
- `correct`
- `newDifficulty, newStreak`
- `scoreDelta, totalScore`
- `stateVersion`
- `leaderboardRankScore, leaderboardRankStreak`

Error cases:
- `409`: `stateVersion conflict` (client should refresh and retry)
- retries with the same `answerIdempotencyKey` return the same stored response snapshot

### Leaderboards

#### `GET /v1/leaderboard/score`
Query:
- `sessionId` (optional, to compute `userRank`)
- `limit` (optional)

#### `GET /v1/leaderboard/streak`
Query:
- `sessionId` (optional)
- `limit` (optional)

Both return:
- `{ type, updatedAt, limit, entries, userRank }`

### Metrics

#### `GET /v1/metrics`
Query:
- `sessionId` (required)

Returns:
- score/streak/difficulty
- accuracy last10 + overall
- difficulty histogram
- recent performance window

### Health

#### `GET /health`
Returns connectivity status for Postgres and Redis.

## WebSockets (Socket.io)

Client can subscribe to real-time leaderboard snapshots:
- Emit: `leaderboard:subscribe` with `"score"` or `"streak"`
- Receive: `leaderboard:update` with `{ type, updatedAt, limit, entries }`

Rooms:
- `leaderboard:score`
- `leaderboard:streak`

## Future improvements

- **Redis-backed distributed rate limiting** (instead of in-memory)
- **Server-side quiz sessions** (if you want server-driven question ordering / anti-cheat)
- **Better leaderboard ranking** with tie-breakers (updated_at, total attempts, etc.)
- **DB migrations tooling** (e.g. node-pg-migrate / drizzle / prisma) + down migrations
- **More question types** and tag-based selection
- **E2E tests** (Playwright) and load tests for `/v1/quiz/answer`
- **Observability** (structured logs, tracing, metrics)


Drive Recording Link :- https://drive.google.com/file/d/1y6WsZcLTlBkmzr0m-tXNUdDQ-Hs7mwxd/view?usp=drivesdk
