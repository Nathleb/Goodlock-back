# Goodlock

Backend for a tactical PvP dice game. Each player fields a team of 5 characters (each a
6-faced die); players secretly assign die-face effects each round, then all actions resolve in
priority order.

- **Backend** (`Goodlock-back`, this repo): NestJS + Socket.io. Game state is **in-memory**;
  Postgres (via Prisma) is used **only for auth** (users + refresh tokens).
- **Frontend** (`Goodlock-frontend`, sibling repo): React + Vite + TypeScript, packaged for
  Android via Capacitor.

> Roadmap & direction: [`docs/ROADMAP.md`](docs/ROADMAP.md) (mobile-first, to v1.0).
> Architecture & conventions: [`CLAUDE.md`](CLAUDE.md).

This document assumes both repos sit side by side:

```
projects/
  Goodlock-back/      # this repo
  Goodlock-frontend/
```

---

## Prerequisites

- **Node.js 20+** and npm
- **Docker** + Docker Compose (for the Postgres auth database)
- For **Android builds only**: a JDK (17 or 21) and the Android SDK (see [Mobile](#mobile-android)).

---

## 1. Backend (`Goodlock-back`)

```bash
cd Goodlock-back

# 1. Config — copy the template and adjust if you like (defaults work for local dev)
cp .env.example .env

# 2. Start Postgres (auth DB) in the background
docker compose up -d

# 3. Install deps
npm install

# 4. Apply DB migrations + generate the Prisma client
npx prisma migrate deploy
npx prisma generate

# 5. Run in watch mode
npm run start:dev
```

The server listens on **http://localhost:3000** (REST auth + Socket.io game protocol).

**Useful commands**

```bash
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
npm test             # run all tests (Jest)
npm run test:cov     # with coverage
npm run lint         # eslint --fix
```

**Environment variables** (see `.env.example`): `DATABASE_URL`, `POSTGRES_*`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
and optional `CORS_ORIGIN` (omit to allow all origins).

> Note: game state lives in memory in the `Manager` classes — restarting the backend wipes all
> rooms and in-progress games. Only `User`/`RefreshToken` are persisted.

---

## 2. Frontend (`Goodlock-frontend`)

```bash
cd Goodlock-frontend
npm install
npm run dev          # Vite dev server → http://localhost:5173
```

The client reads the backend URL from env (defaults to `http://localhost:3000`):

| Var            | Default                 | Purpose                  |
|----------------|-------------------------|--------------------------|
| `VITE_API_URL` | `http://localhost:3000` | REST (auth)              |
| `VITE_WS_URL`  | `http://localhost:3000` | Socket.io (game)         |

```bash
# Example: point at a different backend
VITE_API_URL=http://192.168.1.50:3000 VITE_WS_URL=http://192.168.1.50:3000 npm run dev
```

---

## 3. Play a local match (two players)

1. Backend running (step 1) and frontend running (step 2).
2. Open `http://localhost:5173` in a **normal window** and again in an **incognito/private
   window** (two separate sessions — two tabs in the same browser may share one).
3. Register/log in on each.
4. In one window create a room; in the other join with the room code.
5. Start the game and play through the phases (Placement → Roll → Keep → Assign → Resolve →
   Result).

---

## 4. Tests

```bash
# Backend
cd Goodlock-back && npm test

# Frontend (vitest harness is being re-stood up; see ROADMAP Phase 0)
cd Goodlock-frontend && npm test   # once configured
```

---

## Mobile (Android)

Goodlock is **mobile-first**; the Android build is the primary distribution target. iOS is
deferred (requires a Mac for signing).

### One-time setup

- A JDK on `PATH` (JDK 17 or 21; the `android/` Gradle wrapper is pinned to 8.7 for JDK-21
  compatibility).
- Android SDK (command-line tools). With the SDK installed, point Gradle at it via
  `android/local.properties` (gitignored):
  ```
  sdk.dir=/absolute/path/to/Android/Sdk
  ```
  and ensure platform `android-34` + `build-tools;34.0.0` are installed.

### Build an installable APK

```bash
cd Goodlock-frontend
npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`android:apk` = build web → `cap sync android` → `gradlew assembleDebug`.

The backend URL is baked at build time, so build with the URL the **phone** can reach (not
`localhost`):

```bash
VITE_API_URL=<backend-url> VITE_WS_URL=<backend-url> npm run android:apk
```

### Letting the phone reach the backend (dev)

A phone can't reach `localhost` or a WSL-internal IP. The low-friction path is a **cloudflared
tunnel**, which gives a public **HTTPS** URL (also avoids Android's cleartext-HTTP block):

```bash
# install once (Linux): download the cloudflared binary to ~/.local/bin and chmod +x

# each session, with the backend running on :3000:
cloudflared tunnel --url http://localhost:3000
# → copy the printed https://<random>.trycloudflare.com URL
```

Then build the APK pointed at that URL and install it on the phone (enable "install from
unknown sources"):

```bash
VITE_API_URL=https://<random>.trycloudflare.com \
VITE_WS_URL=https://<random>.trycloudflare.com \
npm run android:apk
```

> The free tunnel URL changes each run, so the APK is rebuilt per session. A planned
> improvement (ROADMAP Phase 0) makes the server URL settable at runtime on the phone so one
> APK works across sessions.

---

## Project layout

```
Goodlock-back/
  src/
    domain/          # pure game logic (no framework)
    application/     # coordinators, ports, DTOs, mappers
    infrastructure/  # NestJS adapters: WS gateway, in-memory managers, Prisma auth repos
    shared/          # Result type, branded IDs, utils
  prisma/            # schema + migrations (auth only)
  tmplt/             # character JSON templates
  tests/             # Jest specs mirroring src/
  docker-compose.yml # Postgres
  Dockerfile         # app container

Goodlock-frontend/
  src/               # React app (game phases, services, dtos)
  android/           # Capacitor Android native project (committed)
  capacitor.config.ts
```

---

## Troubleshooting

- **Backend can't connect to DB** — is `docker compose up -d` running? Does `DATABASE_URL` match
  the `POSTGRES_*` values? (`docker compose ps` to check the container.)
- **Prisma "migrations" / client errors** — re-run `npx prisma migrate deploy && npx prisma
  generate`.
- **Phone shows a blank screen / can't connect** — the APK's baked URL must be reachable from
  the phone (use the tunnel URL, not `localhost`); confirm the backend and tunnel are both up.
- **Android build fails on JDK** — the wrapper is pinned to Gradle 8.7 (JDK 21 OK). If you see
  "Unsupported class file major version", confirm `android/gradle/wrapper/gradle-wrapper.properties`
  uses `gradle-8.7-all.zip`.
- **Restarted backend, game vanished** — expected: game state is in-memory by design.
