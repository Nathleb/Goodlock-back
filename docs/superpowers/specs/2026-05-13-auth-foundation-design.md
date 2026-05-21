# Auth Foundation Design

## Goal

Add persistent user identity to Goodlock. A user registers and logs in via HTTP, receives a JWT pair, and connects to the WebSocket game server using that JWT. The current ephemeral `deviceIdentifier` reconnection mechanism is replaced by `userId`.

## Scope

This is the first sub-project in a larger account/collection platform. It delivers:
- User registration and login (HTTP)
- JWT access + refresh token pair with rotation
- Authenticated WebSocket connection
- GDPR baseline: right to access (`GET /auth/me`), right to erasure (`DELETE /auth/account`)

Collection, character ownership, and other meta-game features are out of scope for this sub-project.

---

## Architecture

Two transports, one identity:

```
HTTP  POST /auth/register  →  creates User, returns JWT pair
HTTP  POST /auth/login     →  validates credentials, returns JWT pair
HTTP  POST /auth/refresh   →  rotates refresh token, returns new JWT pair
HTTP  POST /auth/logout    →  invalidates refresh token
HTTP  GET  /auth/me        →  returns own profile (GDPR: right to access)
HTTP  DELETE /auth/account →  hard-deletes account (GDPR: right to erasure)

WS    connect({ auth: { token: <accessToken> } })
      → gateway validates JWT, extracts userId, creates/reconnects session
```

**Key principle:** The access token is sent on every WS connection. The refresh token is only sent to `POST /auth/refresh`. Two separate JWT secrets ensure a refresh token cannot masquerade as an access token.

**New NestJS modules:**
- `PrismaModule` (global) — wraps PrismaClient, injectable everywhere
- `AuthModule` — `AuthController` + `AuthCoordinatorService` + `JwtModule`

---

## Domain Layer

### `src/shared/branded.types.ts`
Add `UserId` brand:
```ts
export type UserId = string & { readonly __brand: 'UserId' };
```

### `src/domain/types/User.type.ts` (new)
```ts
import { UserId } from "@shared/branded.types";

type User = {
    id: UserId;
    username: string;
    passwordHash: string;
    createdAt: Date;
};

export default User;
```

### `src/application/dtos/Session.dto.ts` (modify)
Replace `deviceIdentifier: string` with `userId: UserId`:
```ts
export type Session = {
    sessionId: string;
    socketId: string;
    userId: UserId;
    roomId?: string;
};
```

**Security note:** `passwordHash` never appears in any response DTO, log, or error message.

---

## Application Layer

### Ports

**`src/application/ports/UserPort.ts`**
```ts
interface UserPort {
    findByUsername(username: string): Promise<User | undefined>;
    findById(id: UserId): Promise<User | undefined>;
    save(user: User): Promise<void>;
    delete(id: UserId): Promise<void>;
}
```

**`src/application/ports/RefreshTokenPort.ts`**
```ts
interface RefreshTokenPort {
    save(tokenHash: string, userId: UserId, expiresAt: Date): Promise<void>;
    findByHash(tokenHash: string): Promise<{ userId: UserId; expiresAt: Date } | undefined>;
    deleteByHash(tokenHash: string): Promise<void>;
    deleteAllForUser(userId: UserId): Promise<void>;
}
```

Refresh tokens are stored **hashed** in the DB (bcrypt, cost 10) — a leaked DB row cannot be replayed.

### Tokens

Add to `src/application/ports/tokens.ts`:
```ts
export const USER_PORT = 'USER_PORT';
export const REFRESH_TOKEN_PORT = 'REFRESH_TOKEN_PORT';
```

### `AuthCoordinatorService`

`src/application/services/AuthCoordinator.service.ts`

| Method | Behaviour |
|--------|-----------|
| `register(username, password)` | Reject duplicate usernames. Hash password with bcrypt cost 12. Save User. Issue token pair. |
| `login(username, password)` | On any failure (unknown username or wrong password): throw generic `UnauthorizedException('Invalid credentials')` — never reveal which field is wrong. |
| `refresh(rawToken)` | Hash incoming token, find in DB, check expiry. **Rotate**: delete old token record, issue new pair. On reuse of an already-rotated token: `deleteAllForUser` (compromise signal). |
| `logout(rawToken)` | Delete that single refresh token record. |
| `getMe(userId)` | Return `{ id, username, createdAt }`. Never return `passwordHash`. |
| `deleteAccount(userId)` | `deleteAllForUser(userId)` then `UserPort.delete(userId)`. Hard delete — no soft delete. |

### DTOs

- `RegisterDto`: `username: string` (3–20 chars, alphanumeric+underscore), `password: string` (8–72 chars)
- `LoginDto`: same fields
- `RefreshDto`: `refreshToken: string`
- `AuthResponseDto`: `{ accessToken: string, refreshToken: string }`
- `MeDto`: `{ id: string, username: string, createdAt: Date }`

`passwordHash` is never present in any response DTO.

---

## Infrastructure Layer

### Prisma Schema

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
    id           String         @id @default(uuid())
    username     String         @unique
    passwordHash String
    createdAt    DateTime       @default(now())
    refreshTokens RefreshToken[]
}

model RefreshToken {
    id        String   @id @default(uuid())
    tokenHash String   @unique
    userId    String
    expiresAt DateTime
    createdAt DateTime @default(now())
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`onDelete: Cascade` on `RefreshToken` ensures GDPR erasure is complete — deleting a User row wipes all their tokens automatically.

### Docker Compose

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: goodlock
      POSTGRES_USER: goodlock
      POSTGRES_PASSWORD: goodlock
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
```

### Environment

`.env` (git-ignored, add to `.gitignore`):
```
DATABASE_URL="postgresql://goodlock:goodlock@localhost:5432/goodlock"
JWT_ACCESS_SECRET=<strong-random-32+-chars>
JWT_REFRESH_SECRET=<different-strong-random-32+-chars>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

Two separate secrets: a refresh token cannot be validated as an access token even if the signing algorithm matches.

### Repositories

- `src/infrastructure/adapters/repositories/UserRepository.ts` — implements `UserPort` via `PrismaService`
- `src/infrastructure/adapters/repositories/RefreshTokenRepository.ts` — implements `RefreshTokenPort` via `PrismaService`

### HTTP Controller

`src/infrastructure/adapters/http/AuthController.ts`

| Method | Route | Guard | Rate limit |
|--------|-------|-------|------------|
| POST | `/auth/register` | None | 5 req/min/IP |
| POST | `/auth/login` | None | 5 req/min/IP |
| POST | `/auth/refresh` | None | 10 req/min/IP |
| POST | `/auth/logout` | `JwtAccessGuard` | — |
| GET | `/auth/me` | `JwtAccessGuard` | — |
| DELETE | `/auth/account` | `JwtAccessGuard` | — |

Rate limiting via `@nestjs/throttler`.

### WebSocket Integration

`SessionGateway.handleConnection` changes:
- **Before:** reads `client.handshake.auth.deviceIdentifier`, calls `handleConnect(socketId, deviceIdentifier)`
- **After:** reads `client.handshake.auth.token`, validates via `JwtService` using `JWT_ACCESS_SECRET`, extracts `userId`. On invalid/missing token: `client.disconnect()`. Calls `handleConnect(socketId, userId)`

`SessionManager`:
- `byDeviceId` map renamed to `byUserId: Map<UserId, Session>`
- `createOrReconnectSession(socketId, userId)` replaces `createOrReconnectSession(socketId, deviceIdentifier)`

---

## Security Summary

| Concern | Mitigation |
|---------|------------|
| Password storage | bcrypt cost 12 |
| Refresh token storage | bcrypt cost 10 (hashed in DB) |
| Token theft (access) | 15-minute expiry |
| Token theft (refresh) | Rotation + reuse detection → full session wipe |
| Username enumeration | Generic "Invalid credentials" on login failure |
| Brute force | Rate limiting: 5 req/min on register + login |
| Secret leakage | Two separate JWT secrets, loaded from env |
| SQL injection | Prisma parameterised queries |
| Over-collection | No email, no real name — username only |

## GDPR Summary

| Right | Implementation |
|-------|----------------|
| Right to access | `GET /auth/me` returns own data |
| Right to erasure | `DELETE /auth/account` hard-deletes User + cascades RefreshTokens |
| Data minimisation | Only `username`, `passwordHash`, `createdAt` stored |
| No sensitive exposure | `passwordHash` never in any response, log, or error |
