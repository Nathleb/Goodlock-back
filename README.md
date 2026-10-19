# Goodlock

Backend for a tactical PvP dice game. Each player brings a deck of 6 characters, keeps 4 after
seeing the opponent's deck (team preview), and lays them out on a 5-cell board with one cell left
empty (each character is a 6-faced die). Two dead characters lose the match. Each round players roll and lock dice, then every action resolves in priority order
with automatic targeting.

- **Backend** (`Goodlock-back`, this repo): NestJS + Socket.io. Live game state is **in-memory**;
  Postgres (via Prisma) stores auth (users, refresh tokens) and player data (owned characters, decks).
- **Mobile client** (`Goodlock-app`, sibling repo): **Flutter + Flame** (prototype, Oct 2026). See
  its `CLAUDE.md`; `dart run tool/bot_match.dart` plays a full match against this backend.

> Roadmap & direction: [`docs/ROADMAP.md`](docs/ROADMAP.md) (mobile-first, to v1.0).
> Architecture & conventions: [`CLAUDE.md`](CLAUDE.md).

This document assumes both repos sit side by side:

```
projects/
  Goodlock-back/      # this repo
  Goodlock-app/       # Flutter + Flame client (prototype)
```

---

## Prerequisites

- **Node.js 20+** and npm
- **Docker** + Docker Compose (for the Postgres database). On WSL2 with Docker Desktop, start
  Docker Desktop first so the `docker` CLI and WSL integration are available.
- For the **client**: the Flutter SDK and the Android SDK (see [Client](#2-client-goodlock-app-flutter--flame)).

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
> rooms and in-progress games. Only auth and player data (users, tokens, collection, decks) are persisted.

---

## 2. Client (`Goodlock-app`, Flutter + Flame)

Requires the Flutter SDK (`~/development/flutter`, on `PATH`) and the Android SDK with platform
`android-36` + `build-tools;36.0.0`.

```bash
cd Goodlock-app
flutter test                                   # unit + widget tests
dart run tool/bot_match.dart --server http://localhost:3000   # end-to-end: two bots play a match
flutter build apk --debug                      # build/app/outputs/flutter-apk/app-debug.apk
```

The server URL is entered on the login screen (*Serveur*) and remembered; a default can be baked
at build time with `--dart-define=SERVER_URL=<url>`. The *Démo Resolve hors ligne* button needs no
server at all. See the app's own `CLAUDE.md` for details.

---

## 3. Tests

```bash
cd Goodlock-back && npm test    # backend (Jest)
cd Goodlock-app && flutter test # client
```

---

## Mobile (Android)

Goodlock is **mobile-first**; Android is the primary distribution target. iOS is deferred
(requires a Mac for signing).

### Letting the phone reach the backend (dev)

A phone can't reach `localhost` or a WSL-internal IP. The low-friction path is a **cloudflared
tunnel**, which gives a public **HTTPS** URL (also avoids Android's cleartext-HTTP block):

```bash
# install once (Linux): download the cloudflared binary to ~/.local/bin and chmod +x

# each session, with the backend running on :3000:
cloudflared tunnel --url http://localhost:3000
# → copy the printed https://<random>.trycloudflare.com URL
```

Install the APK on the phone (enable "install from unknown sources") and paste the tunnel URL
into the login screen's server field.

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
```

---

## Troubleshooting

- **Backend can't connect to DB** — is `docker compose up -d` running? Does `DATABASE_URL` match
  the `POSTGRES_*` values? (`docker compose ps` to check the container.)
- **Prisma "migrations" / client errors** — re-run `npx prisma migrate deploy && npx prisma
  generate`.
- **Phone can't connect** — the server URL on the login screen must be reachable from the phone
  (use the tunnel URL, not `localhost`); confirm the backend and tunnel are both up.
- **Restarted backend, game vanished** — expected: game state is in-memory by design.
