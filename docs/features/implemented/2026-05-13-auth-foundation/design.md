# Auth Foundation Design

**Status:** implemented 2026-05-21

## Goal

Persistent user identity. A user registers and logs in over HTTP, receives an access JWT and an opaque refresh token, and connects to the WebSocket game server with the access JWT. The session is keyed by `userId`, which is what makes a reconnect land on the same player.

Out of scope for this feature: character ownership and the meta game (see the collection and decks specs, which build on it).

## Architecture

Two transports, one identity:

```
HTTP  POST   /auth/register  -> creates User, returns { accessToken, refreshToken }
HTTP  POST   /auth/login     -> validates credentials, returns a token pair
HTTP  POST   /auth/refresh   -> rotates the refresh token, returns a new pair
HTTP  POST   /auth/logout    -> deletes the given refresh token (204)
HTTP  GET    /auth/me        -> own profile (GDPR: right to access)
HTTP  DELETE /auth/account   -> hard-deletes the account (GDPR: right to erasure, 204)

WS    connect({ auth: { token: <accessToken> } })
      -> gateway verifies the JWT, extracts userId, creates or re-binds the session
```

The access token is sent on every WS connection. The refresh token is only ever sent to `/auth/refresh` and `/auth/logout`. `logout`, `me` and `account` require a valid access token (`JwtAccessGuard`, `Authorization: Bearer ...`).

Decision: the refresh token is an opaque random string (64 random bytes, hex) stored hashed, rather than a second JWT, because it carries no claims and a leaked database row cannot be replayed. There is a single JWT secret, for access tokens only.

Modules: `PrismaModule` (global, wraps the Prisma client) and `AuthModule` (`AuthController`, `AuthCoordinatorService`, `JwtModule`, the two repositories). `AuthModule` imports `CollectionModule` and `DeckModule` to grant starter content (see below).

## Domain and application

- `User` (`src/domain/types/User.type.ts`): `{ id: UserId, username, passwordHash, createdAt }`. `UserId` is a branded id.
- `Session` (`src/application/dtos/Session.dto.ts`): `{ sessionId, socketId, userId, roomId? }`.
- Ports (tokens `USER_PORT`, `REFRESH_TOKEN_PORT`):
  - `UserPort`: `findByUsername`, `findById`, `save`, `delete`.
  - `RefreshTokenPort`: `save(tokenHash, userId, expiresAt)`, `findByHash` (returns `userId`, `expiresAt`, `isRevoked`), `revokeByHash`, `deleteByHash`, `deleteAllForUser`.

`AuthCoordinatorService` (`src/application/services/AuthCoordinator.service.ts`):

| Method | Behaviour |
|---|---|
| `register` | Reject a taken username (409). Hash the password with bcrypt (cost 12). Save the user, grant starter content, issue a token pair. |
| `login` | Unknown username or wrong password both throw the same `UnauthorizedException('Invalid credentials')`: never reveal which was wrong. Then grant starter content (idempotent) and issue a pair. |
| `refresh` | Hash the incoming token (SHA-256) and look it up. Unknown: 401. Already revoked (reuse of a rotated token): `deleteAllForUser` as a compromise signal, then 401. Expired: delete it, 401. Otherwise revoke it (kept as a tombstone so reuse is detectable) and issue a new pair. |
| `logout` | Delete that one refresh token record. |
| `getMe` | `{ id, username, createdAt }`, never `passwordHash`. |
| `deleteAccount` | `deleteAllForUser`, then `UserPort.delete`. Hard delete. |

Refresh tokens live 7 days. Access tokens use `JWT_ACCESS_EXPIRES_IN`. Decision: refresh tokens are hashed with SHA-256 rather than bcrypt, because they are already 512 bits of entropy, so a slow hash adds nothing and would make every refresh expensive.

Starter content: on register and login, every user is granted the whole catalog and a starter deck (`CollectionCoordinatorService.grantAll`, `DeckCoordinatorService.ensureStarterDeck`). This is temporary until acquisition exists. It is idempotent, and a failure there is logged and never fails authentication: the account already exists, and the next login heals it.

DTOs (class-validator, global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`): `RegisterDto` and `LoginDto` take `username` (3-20 chars, letters, digits, underscore) and `password` (8-72 chars); `RefreshDto` takes `refreshToken`; responses are `AuthResponseDto { accessToken, refreshToken }` and `MeDto { id, username, createdAt }`. `passwordHash` is never in a response, log or error.

## Infrastructure

- Prisma schema (`prisma/schema.prisma`): `User` (id uuid, unique `username`, `passwordHash`, `createdAt`) and `RefreshToken` (id, unique `tokenHash`, `userId`, `isRevoked`, `expiresAt`, `createdAt`) with `onDelete: Cascade` from `User`, so deleting a user wipes its tokens (and, by the same cascade, its collection and decks).
- Repositories `UserRepository` and `RefreshTokenRepository` implement the ports through `PrismaService`.
- `AuthController` (`/auth`) with `@nestjs/throttler`: `register` 5 requests/min/IP, `login` and `refresh` 10 requests/min/IP, plus a global default of 100/min.
- Gateway `handleConnection` reads `handshake.auth.token`, verifies it with `JwtService`, and calls `SessionCoordinatorService.handleConnect(socketId, userId)`. A missing or invalid token disconnects the socket.
- `SessionManager` keeps one live session per user (`byUserId`); `createOrReconnectSession(socketId, userId)` re-binds the existing session to the new socket and reports the previous socket for eviction (see the reconnect-lifecycle spec).
- Config (`.env`, git-ignored; `.env.example` documents every variable): `DATABASE_URL`, `POSTGRES_*` (read by `docker-compose.yml`, Postgres 16), `JWT_ACCESS_SECRET` (at least 32 characters, checked at boot by `jwtConfigFromEnv`), `JWT_ACCESS_EXPIRES_IN` (e.g. `15m`), `CORS_ORIGIN`, `CLAIM_*`.

## Security summary

| Concern | Mitigation |
|---|---|
| Password storage | bcrypt cost 12 |
| Refresh token storage | SHA-256 hash of a 512-bit random token |
| Access token theft | short expiry |
| Refresh token theft | rotation plus reuse detection that deletes all of the user's tokens |
| Username enumeration | generic "Invalid credentials" on login |
| Brute force | throttling on register, login, refresh |
| Secret handling | secret from env, length validated at boot |
| SQL injection | Prisma parameterised queries |
| Over-collection | username only: no email, no real name |

## GDPR

| Right | Implementation |
|---|---|
| Access | `GET /auth/me` |
| Erasure | `DELETE /auth/account` hard-deletes the user, cascading to tokens and player data |
| Minimisation | only `username`, `passwordHash`, `createdAt` |
