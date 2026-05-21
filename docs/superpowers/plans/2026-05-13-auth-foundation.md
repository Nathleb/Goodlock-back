# Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-authenticated user accounts — HTTP register/login/GDPR endpoints + WebSocket connection authenticated by JWT instead of the current `deviceIdentifier`.

**Architecture:** Hexagonal layers preserved. New `User` domain type + `AuthCoordinatorService` in application layer + Prisma repositories in infrastructure. Existing session system migrated from `deviceIdentifier` to `userId`. Access tokens (15 min JWT) + refresh tokens (7-day, SHA-256 hashed in DB, rotation with reuse detection that wipes all sessions on compromise).

**Tech Stack:** NestJS 11, Prisma, PostgreSQL 16, @nestjs/jwt, @nestjs/config, @nestjs/throttler, bcrypt, Docker Compose

**Security notes baked into every task:**
- Passwords: bcrypt cost 12
- Refresh tokens: SHA-256 hashed in DB (random tokens don't need bcrypt — they're already 256-bit entropy)
- Login errors: always generic "Invalid credentials" — never reveal whether username exists
- Two JWT secrets: access token cannot be used as refresh token
- `passwordHash` never appears in any response DTO, log, or error

**Note:** Commits are left to the user — tasks end with `npm run test` verification, not `git commit`.

---

## File Map

**Create:**
- `docker-compose.yml`
- `.env` (git-ignored) + `.env.example`
- `prisma/schema.prisma`
- `src/infrastructure/prisma/prisma.service.ts`
- `src/infrastructure/prisma/prisma.module.ts`
- `src/domain/types/User.type.ts`
- `src/application/ports/UserPort.ts`
- `src/application/ports/RefreshTokenPort.ts`
- `src/application/dtos/RegisterDto.ts`
- `src/application/dtos/LoginDto.ts`
- `src/application/dtos/RefreshDto.ts`
- `src/application/dtos/AuthResponseDto.ts`
- `src/application/dtos/MeDto.ts`
- `src/application/services/AuthCoordinator.service.ts`
- `src/infrastructure/adapters/repositories/UserRepository.ts`
- `src/infrastructure/adapters/repositories/RefreshTokenRepository.ts`
- `src/infrastructure/adapters/http/AuthController.ts`
- `src/infrastructure/adapters/websocket/guards/JwtAccess.guard.ts`
- `src/infrastructure/auth.module.ts`
- `tests/AuthCoordinator.service.spec.ts`

**Modify:**
- `src/shared/branded.types.ts` — add `UserId`
- `src/application/ports/tokens.ts` — add `USER_PORT`, `REFRESH_TOKEN_PORT`
- `src/application/dtos/Session.dto.ts` — `deviceIdentifier` → `userId: UserId`
- `src/application/ports/SessionPort.ts` — update `createOrReconnectSession` signature
- `src/infrastructure/adapters/managers/session.manager.ts` — `byDeviceId` → `byUserId`
- `src/application/services/SessionCoordinator.service.ts` — update `handleConnect(socketId, userId)`
- `src/infrastructure/adapters/websocket/session.gateway.ts` — JWT extraction instead of `deviceIdentifier`
- `src/app.module.ts` — import `AuthModule`, `ConfigModule`, `ThrottlerModule`
- `.gitignore` — add `.env`
- `tests/SessionCoordinator.service.spec.ts` — update `deviceIdentifier` → `userId`

---

### Task 1: Install packages + Docker + environment

**Files:**
- Modify: `package.json` (via npm install)
- Create: `docker-compose.yml`
- Create: `.env`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install new packages**

```bash
npm install @nestjs/jwt @nestjs/config @nestjs/throttler bcrypt prisma @prisma/client
npm install --save-dev @types/bcrypt
npx prisma init --datasource-provider postgresql
```

`npx prisma init` creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`. Verify both exist before continuing.

- [ ] **Step 2: Create docker-compose.yml**

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

- [ ] **Step 3: Set up .env**

Replace the `DATABASE_URL` line that `prisma init` generated and add JWT config. Final `.env`:

```
DATABASE_URL="postgresql://goodlock:goodlock@localhost:5432/goodlock"
JWT_ACCESS_SECRET=change-me-to-a-long-random-string-for-access
JWT_REFRESH_SECRET=change-me-to-a-different-long-random-string-for-refresh
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

- [ ] **Step 4: Create .env.example**

```
DATABASE_URL="postgresql://user:password@localhost:5432/goodlock"
JWT_ACCESS_SECRET=your-access-secret-32-chars-minimum
JWT_REFRESH_SECRET=your-refresh-secret-32-chars-minimum-different-from-access
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

- [ ] **Step 5: Add .env to .gitignore**

Open `.gitignore` and add at the end:
```
.env
```

`.env.example` stays tracked (it has no real secrets).

- [ ] **Step 6: Start Postgres**

```bash
docker compose up -d
```

Expected: container `goodlock-db-1` running. Verify: `docker compose ps`

- [ ] **Step 7: Verify build still passes**

```bash
npm run build
```

Expected: no errors.

---

### Task 2: Prisma schema + PrismaService + PrismaModule

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/infrastructure/prisma/prisma.service.ts`
- Create: `src/infrastructure/prisma/prisma.module.ts`

- [ ] **Step 1: Write prisma/schema.prisma**

Replace the entire file:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(uuid())
  username      String         @unique
  passwordHash  String
  createdAt     DateTime       @default(now())
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique
  userId    String
  isRevoked Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`onDelete: Cascade` — deleting a User row wipes all their RefreshTokens automatically (GDPR erasure).
`isRevoked` — used for rotation reuse detection: a revoked token still in DB signals a compromised session.

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected output includes: `Your database is now in sync with your schema.`
This also runs `prisma generate` automatically.

- [ ] **Step 3: Create PrismaService**

`src/infrastructure/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    async onModuleInit(): Promise<void> {
        await this.$connect();
    }
}
```

- [ ] **Step 4: Create PrismaModule**

`src/infrastructure/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()` makes `PrismaService` available across all modules without re-importing.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: no errors.

---

### Task 3: Domain types + ports + tokens

**Files:**
- Modify: `src/shared/branded.types.ts`
- Create: `src/domain/types/User.type.ts`
- Create: `src/application/ports/UserPort.ts`
- Create: `src/application/ports/RefreshTokenPort.ts`
- Modify: `src/application/ports/tokens.ts`

No tests for pure types and interfaces.

- [ ] **Step 1: Add UserId to branded.types.ts**

Open `src/shared/branded.types.ts` and append:

```ts
export type UserId = string & { readonly __brand: 'UserId' };
```

- [ ] **Step 2: Create User domain type**

`src/domain/types/User.type.ts`:

```ts
import { UserId } from '@shared/branded.types';

type User = {
    id: UserId;
    username: string;
    passwordHash: string;
    createdAt: Date;
};

export default User;
```

- [ ] **Step 3: Create UserPort**

`src/application/ports/UserPort.ts`:

```ts
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';

export interface UserPort {
    findByUsername(username: string): Promise<User | undefined>;
    findById(id: UserId): Promise<User | undefined>;
    save(user: User): Promise<void>;
    delete(id: UserId): Promise<void>;
}
```

- [ ] **Step 4: Create RefreshTokenPort**

`src/application/ports/RefreshTokenPort.ts`:

```ts
import { UserId } from '@shared/branded.types';

export interface RefreshTokenRecord {
    userId: UserId;
    expiresAt: Date;
    isRevoked: boolean;
}

export interface RefreshTokenPort {
    save(tokenHash: string, userId: UserId, expiresAt: Date): Promise<void>;
    findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
    revokeByHash(tokenHash: string): Promise<void>;
    deleteByHash(tokenHash: string): Promise<void>;
    deleteAllForUser(userId: UserId): Promise<void>;
}
```

- [ ] **Step 5: Add tokens**

Open `src/application/ports/tokens.ts` and append:

```ts
export const USER_PORT = Symbol('UserPort');
export const REFRESH_TOKEN_PORT = Symbol('RefreshTokenPort');
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: no errors.

---

### Task 4: Auth DTOs

**Files:**
- Create: `src/application/dtos/RegisterDto.ts`
- Create: `src/application/dtos/LoginDto.ts`
- Create: `src/application/dtos/RefreshDto.ts`
- Create: `src/application/dtos/AuthResponseDto.ts`
- Create: `src/application/dtos/MeDto.ts`

- [ ] **Step 1: RegisterDto**

`src/application/dtos/RegisterDto.ts`:

```ts
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
    @IsString()
    @MinLength(3)
    @MaxLength(20)
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username can only contain letters, numbers and underscores' })
    username: string;

    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;
}
```

MaxLength 72 on password: bcrypt silently truncates at 72 bytes — cap it explicitly.

- [ ] **Step 2: LoginDto**

`src/application/dtos/LoginDto.ts`:

```ts
import { IsString } from 'class-validator';

export class LoginDto {
    @IsString()
    username: string;

    @IsString()
    password: string;
}
```

- [ ] **Step 3: RefreshDto**

`src/application/dtos/RefreshDto.ts`:

```ts
import { IsString } from 'class-validator';

export class RefreshDto {
    @IsString()
    refreshToken: string;
}
```

- [ ] **Step 4: AuthResponseDto**

`src/application/dtos/AuthResponseDto.ts`:

```ts
export class AuthResponseDto {
    accessToken: string;
    refreshToken: string;
}
```

- [ ] **Step 5: MeDto**

`src/application/dtos/MeDto.ts`:

```ts
export class MeDto {
    id: string;
    username: string;
    createdAt: Date;
}
```

`passwordHash` is never present here. `id` is `string` (not `UserId`) because branded types are TypeScript-only and don't affect serialization.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: no errors.

---

### Task 5: AuthCoordinatorService — TDD

**Files:**
- Create: `tests/AuthCoordinator.service.spec.ts`
- Create: `src/application/services/AuthCoordinator.service.ts`

- [ ] **Step 1: Write failing tests**

`tests/AuthCoordinator.service.spec.ts`:

```ts
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { UserPort } from '@application/ports/UserPort';
import { RefreshTokenPort } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('bcrypt', () => ({
    hash: jest.fn(),
    compare: jest.fn(),
}));

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const USER_ID = 'user-uuid-1' as UserId;
const MOCK_USER: User = {
    id: USER_ID,
    username: 'testuser',
    passwordHash: 'hashed-password',
    createdAt: new Date('2026-01-01'),
};

const mockUserPort: jest.Mocked<UserPort> = {
    findByUsername: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
};

const mockRefreshTokenPort: jest.Mocked<RefreshTokenPort> = {
    save: jest.fn(),
    findByHash: jest.fn(),
    revokeByHash: jest.fn(),
    deleteByHash: jest.fn(),
    deleteAllForUser: jest.fn(),
};

const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-access-token'),
};

const mockConfigService = {
    get: (key: string) => ({
        JWT_ACCESS_SECRET: 'access-secret-test',
        JWT_REFRESH_SECRET: 'refresh-secret-test',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
    }[key] ?? ''),
};

let service: AuthCoordinatorService;

beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockRefreshTokenPort.save.mockResolvedValue(undefined);
    service = new AuthCoordinatorService(
        mockUserPort,
        mockRefreshTokenPort,
        mockJwtService as any,
        mockConfigService as any,
    );
});

describe('register', () => {
    it('saves a new user and returns token pair', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        mockUserPort.save.mockResolvedValue(undefined);

        const result = await service.register({ username: 'newuser', password: 'password123' });

        expect(mockUserPort.findByUsername).toHaveBeenCalledWith('newuser');
        expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12);
        expect(mockUserPort.save).toHaveBeenCalledTimes(1);
        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
        expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('throws ConflictException when username is taken', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);

        await expect(service.register({ username: 'testuser', password: 'password123' }))
            .rejects.toThrow(ConflictException);

        expect(mockUserPort.save).not.toHaveBeenCalled();
    });
});

describe('login', () => {
    it('returns token pair on valid credentials', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(true as never);

        const result = await service.login({ username: 'testuser', password: 'correct-password' });

        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
    });

    it('throws generic UnauthorizedException when username does not exist', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);

        await expect(service.login({ username: 'ghost', password: 'any' }))
            .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws generic UnauthorizedException when password is wrong', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);

        await expect(service.login({ username: 'testuser', password: 'wrong' }))
            .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('returns the same error message for wrong username and wrong password', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        let errorMessage = '';
        try { await service.login({ username: 'ghost', password: 'any' }); }
        catch (e: any) { errorMessage = e.message; }

        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);
        let errorMessage2 = '';
        try { await service.login({ username: 'testuser', password: 'wrong' }); }
        catch (e: any) { errorMessage2 = e.message; }

        expect(errorMessage).toBe(errorMessage2);
    });
});

describe('refresh', () => {
    const RAW_TOKEN = 'raw-refresh-token-string';
    const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

    it('rotates token and returns new pair when token is valid', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 60_000),
            isRevoked: false,
        });
        mockRefreshTokenPort.revokeByHash.mockResolvedValue(undefined);

        const result = await service.refresh({ refreshToken: RAW_TOKEN });

        expect(mockRefreshTokenPort.findByHash).toHaveBeenCalledWith(TOKEN_HASH);
        expect(mockRefreshTokenPort.revokeByHash).toHaveBeenCalledWith(TOKEN_HASH);
        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
    });

    it('throws UnauthorizedException when token is not found', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue(undefined);

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is expired', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() - 60_000),
            isRevoked: false,
        });

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);

        expect(mockRefreshTokenPort.deleteByHash).toHaveBeenCalledWith(TOKEN_HASH);
    });

    it('wipes all sessions and throws when a revoked token is reused (compromise)', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 60_000),
            isRevoked: true,
        });
        mockRefreshTokenPort.deleteAllForUser.mockResolvedValue(undefined);

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);

        expect(mockRefreshTokenPort.deleteAllForUser).toHaveBeenCalledWith(USER_ID);
    });
});

describe('logout', () => {
    it('deletes the refresh token', async () => {
        const RAW_TOKEN = 'logout-token';
        const HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');
        mockRefreshTokenPort.deleteByHash.mockResolvedValue(undefined);

        await service.logout({ refreshToken: RAW_TOKEN });

        expect(mockRefreshTokenPort.deleteByHash).toHaveBeenCalledWith(HASH);
    });
});

describe('getMe', () => {
    it('returns user profile without passwordHash', async () => {
        mockUserPort.findById.mockResolvedValue(MOCK_USER);

        const result = await service.getMe(USER_ID);

        expect(result.id).toBe(USER_ID);
        expect(result.username).toBe('testuser');
        expect(result.createdAt).toEqual(new Date('2026-01-01'));
        expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws NotFoundException when user does not exist', async () => {
        mockUserPort.findById.mockResolvedValue(undefined);

        await expect(service.getMe(USER_ID)).rejects.toThrow(NotFoundException);
    });
});

describe('deleteAccount', () => {
    it('deletes all refresh tokens then the user', async () => {
        mockRefreshTokenPort.deleteAllForUser.mockResolvedValue(undefined);
        mockUserPort.delete.mockResolvedValue(undefined);

        await service.deleteAccount(USER_ID);

        expect(mockRefreshTokenPort.deleteAllForUser).toHaveBeenCalledWith(USER_ID);
        expect(mockUserPort.delete).toHaveBeenCalledWith(USER_ID);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/AuthCoordinator.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@application/services/AuthCoordinator.service'`

- [ ] **Step 3: Implement AuthCoordinatorService**

`src/application/services/AuthCoordinator.service.ts`:

```ts
import { Injectable, ConflictException, UnauthorizedException, NotFoundException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { USER_PORT, REFRESH_TOKEN_PORT } from '@application/ports/tokens';
import { UserPort } from '@application/ports/UserPort';
import { RefreshTokenPort } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';
import { RegisterDto } from '@application/dtos/RegisterDto';
import { LoginDto } from '@application/dtos/LoginDto';
import { RefreshDto } from '@application/dtos/RefreshDto';
import { AuthResponseDto } from '@application/dtos/AuthResponseDto';
import { MeDto } from '@application/dtos/MeDto';

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_AUTH_ERROR = 'Invalid credentials';

@Injectable()
export class AuthCoordinatorService {
    constructor(
        @Inject(USER_PORT) private readonly userPort: UserPort,
        @Inject(REFRESH_TOKEN_PORT) private readonly refreshTokenPort: RefreshTokenPort,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async register(dto: RegisterDto): Promise<AuthResponseDto> {
        const existing = await this.userPort.findByUsername(dto.username);
        if (existing) throw new ConflictException('Username already taken');

        const passwordHash = await bcrypt.hash(dto.password, 12);
        const user: User = {
            id: randomUUID() as UserId,
            username: dto.username,
            passwordHash,
            createdAt: new Date(),
        };
        await this.userPort.save(user);
        return this.issueTokenPair(user.id, user.username);
    }

    async login(dto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.userPort.findByUsername(dto.username);
        if (!user) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        return this.issueTokenPair(user.id, user.username);
    }

    async refresh(dto: RefreshDto): Promise<AuthResponseDto> {
        const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');
        const record = await this.refreshTokenPort.findByHash(tokenHash);

        if (!record) throw new UnauthorizedException('Invalid refresh token');

        if (record.isRevoked) {
            await this.refreshTokenPort.deleteAllForUser(record.userId);
            throw new UnauthorizedException('Session compromised, please log in again');
        }

        if (record.expiresAt < new Date()) {
            await this.refreshTokenPort.deleteByHash(tokenHash);
            throw new UnauthorizedException('Refresh token expired');
        }

        await this.refreshTokenPort.revokeByHash(tokenHash);

        const user = await this.userPort.findById(record.userId);
        if (!user) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        return this.issueTokenPair(record.userId, user.username);
    }

    async logout(dto: RefreshDto): Promise<void> {
        const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');
        await this.refreshTokenPort.deleteByHash(tokenHash);
    }

    async getMe(userId: UserId): Promise<MeDto> {
        const user = await this.userPort.findById(userId);
        if (!user) throw new NotFoundException('User not found');
        return { id: user.id, username: user.username, createdAt: user.createdAt };
    }

    async deleteAccount(userId: UserId): Promise<void> {
        await this.refreshTokenPort.deleteAllForUser(userId);
        await this.userPort.delete(userId);
    }

    private async issueTokenPair(userId: UserId, username: string): Promise<AuthResponseDto> {
        const accessToken = await this.jwtService.signAsync(
            { sub: userId, username },
            {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
                expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
            },
        );

        const rawRefreshToken = randomBytes(64).toString('hex');
        const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

        await this.refreshTokenPort.save(tokenHash, userId, expiresAt);

        return { accessToken, refreshToken: rawRefreshToken };
    }
}
```

Note: `crypto.randomUUID()` is used inline in `register` (Node built-in, no import needed at runtime). `randomBytes` is imported from `'crypto'` for the refresh token.

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest tests/AuthCoordinator.service.spec.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npm run test
```

Expected: all suites pass (no regressions).

---

### Task 6: Repositories

**Files:**
- Create: `src/infrastructure/adapters/repositories/UserRepository.ts`
- Create: `src/infrastructure/adapters/repositories/RefreshTokenRepository.ts`

No unit tests — these are thin Prisma wrappers. Correctness is verified end-to-end after module wiring.

- [ ] **Step 1: Create UserRepository**

`src/infrastructure/adapters/repositories/UserRepository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { UserPort } from '@application/ports/UserPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';

@Injectable()
export class UserRepository implements UserPort {
    constructor(private readonly prisma: PrismaService) {}

    async findByUsername(username: string): Promise<User | undefined> {
        const row = await this.prisma.user.findUnique({ where: { username } });
        return row ? this.toUser(row) : undefined;
    }

    async findById(id: UserId): Promise<User | undefined> {
        const row = await this.prisma.user.findUnique({ where: { id } });
        return row ? this.toUser(row) : undefined;
    }

    async save(user: User): Promise<void> {
        await this.prisma.user.upsert({
            where: { id: user.id },
            update: { username: user.username, passwordHash: user.passwordHash },
            create: { id: user.id, username: user.username, passwordHash: user.passwordHash, createdAt: user.createdAt },
        });
    }

    async delete(id: UserId): Promise<void> {
        await this.prisma.user.delete({ where: { id } });
    }

    private toUser(row: { id: string; username: string; passwordHash: string; createdAt: Date }): User {
        return {
            id: row.id as UserId,
            username: row.username,
            passwordHash: row.passwordHash,
            createdAt: row.createdAt,
        };
    }
}
```

- [ ] **Step 2: Create RefreshTokenRepository**

`src/infrastructure/adapters/repositories/RefreshTokenRepository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { RefreshTokenPort, RefreshTokenRecord } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';

@Injectable()
export class RefreshTokenRepository implements RefreshTokenPort {
    constructor(private readonly prisma: PrismaService) {}

    async save(tokenHash: string, userId: UserId, expiresAt: Date): Promise<void> {
        await this.prisma.refreshToken.create({
            data: { tokenHash, userId, expiresAt },
        });
    }

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
        const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
        if (!row) return undefined;
        return {
            userId: row.userId as UserId,
            expiresAt: row.expiresAt,
            isRevoked: row.isRevoked,
        };
    }

    async revokeByHash(tokenHash: string): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { tokenHash },
            data: { isRevoked: true },
        });
    }

    async deleteByHash(tokenHash: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    async deleteAllForUser(userId: UserId): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
}
```

`deleteByHash` uses `deleteMany` (not `delete`) to avoid throwing if the record doesn't exist.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

---

### Task 7: AuthController + JwtAccessGuard

**Files:**
- Create: `src/infrastructure/adapters/websocket/guards/JwtAccess.guard.ts`
- Create: `src/infrastructure/adapters/http/AuthController.ts`

- [ ] **Step 1: Create JwtAccessGuard**

`src/infrastructure/adapters/websocket/guards/JwtAccess.guard.ts`:

```ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface JwtPayload {
    sub: string;
    username: string;
}

@Injectable()
export class JwtAccessGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');

        const token = authHeader.slice(7);
        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
            });
            request.user = payload;
            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
```

- [ ] **Step 2: Create AuthController**

`src/infrastructure/adapters/http/AuthController.ts`:

```ts
import { Controller, Post, Get, Delete, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { RegisterDto } from '@application/dtos/RegisterDto';
import { LoginDto } from '@application/dtos/LoginDto';
import { RefreshDto } from '@application/dtos/RefreshDto';
import { AuthResponseDto } from '@application/dtos/AuthResponseDto';
import { MeDto } from '@application/dtos/MeDto';
import { JwtAccessGuard, JwtPayload } from '../websocket/guards/JwtAccess.guard';
import { UserId } from '@shared/branded.types';

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller('auth')
export class AuthController {
    constructor(private readonly authCoordinator: AuthCoordinatorService) {}

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
        return this.authCoordinator.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
        return this.authCoordinator.login(dto);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
        return this.authCoordinator.refresh(dto);
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAccessGuard)
    logout(@Body() dto: RefreshDto): Promise<void> {
        return this.authCoordinator.logout(dto);
    }

    @Get('me')
    @UseGuards(JwtAccessGuard)
    getMe(@Req() req: AuthenticatedRequest): Promise<MeDto> {
        return this.authCoordinator.getMe(req.user.sub as UserId);
    }

    @Delete('account')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAccessGuard)
    deleteAccount(@Req() req: AuthenticatedRequest): Promise<void> {
        return this.authCoordinator.deleteAccount(req.user.sub as UserId);
    }
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

---

### Task 8: Module wiring

**Files:**
- Create: `src/infrastructure/auth.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create AuthModule**

`src/infrastructure/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './adapters/http/AuthController';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { UserRepository } from './adapters/repositories/UserRepository';
import { RefreshTokenRepository } from './adapters/repositories/RefreshTokenRepository';
import { JwtAccessGuard } from './adapters/websocket/guards/JwtAccess.guard';
import { USER_PORT, REFRESH_TOKEN_PORT } from '@application/ports/tokens';

@Module({
    imports: [
        JwtModule.register({}),
    ],
    controllers: [AuthController],
    providers: [
        AuthCoordinatorService,
        JwtAccessGuard,
        { provide: USER_PORT, useClass: UserRepository },
        { provide: REFRESH_TOKEN_PORT, useClass: RefreshTokenRepository },
    ],
    exports: [JwtModule, JwtAccessGuard],
})
export class AuthModule {}
```

`JwtModule.register({})` registers with no default secret — secrets are passed explicitly in `signAsync`/`verifyAsync` calls.
`exports: [JwtModule]` — makes `JwtService` available in `AppModule` for the WebSocket gateway.

- [ ] **Step 2: Update AppModule**

Replace `src/app.module.ts` entirely:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ROOM_PORT, SESSION_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';
import { SessionGuard } from '@infrastructure/adapters/websocket/guards/Session.guard';
import { PrismaModule } from '@infrastructure/prisma/prisma.module';
import { AuthModule } from '@infrastructure/auth.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
        PrismaModule,
        AuthModule,
    ],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: ROOM_PORT, useClass: RoomManager },
        { provide: SESSION_PORT, useClass: SessionManager },
        { provide: WEBSOCKET_PORT, useClass: WebSocketService },
        SharedWebSocketService,
        RoomCoordinatorService,
        SessionCoordinatorService,
        GameCoordinatorService,
        SessionGateway,
        SessionGuard,
    ],
})
export class AppModule {}
```

`ConfigModule.forRoot({ isGlobal: true })` — loads `.env`, makes `ConfigService` injectable everywhere.
`APP_GUARD + ThrottlerGuard` — applies rate limiting globally (HTTP only; `@Throttle` overrides per-route).

- [ ] **Step 3: Add tsconfig path alias for @infrastructure**

Open `tsconfig.json` and verify `@infrastructure/*` path exists. If not, add inside `compilerOptions.paths`:

```json
"@infrastructure/*": ["src/infrastructure/*"]
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```

Expected: all suites pass.

---

### Task 9: Session migration — deviceIdentifier → userId

This task migrates the session system to use `userId` from JWT instead of a client-generated `deviceIdentifier`. The gateway validates the JWT on connection and extracts `userId`.

**Files:**
- Modify: `src/application/dtos/Session.dto.ts`
- Modify: `src/application/ports/SessionPort.ts`
- Modify: `src/infrastructure/adapters/managers/session.manager.ts`
- Modify: `src/application/services/SessionCoordinator.service.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`
- Modify: `tests/SessionCoordinator.service.spec.ts`

- [ ] **Step 1: Update Session.dto.ts**

Replace the entire file:

```ts
import { UserId } from '@shared/branded.types';

export type Session = {
    sessionId: string;
    socketId: string;
    userId: UserId;
    roomId?: string;
};
```

- [ ] **Step 2: Update SessionPort.ts**

Open `src/application/ports/SessionPort.ts`. Change `createOrReconnectSession` signature:

```ts
import { UserId } from '@shared/branded.types';
import { Session } from '@application/dtos/Session.dto';

export interface SessionPort {
    createOrReconnectSession(socketId: string, userId: UserId): Session;
    getSession(socketId: string): Session | undefined;
    setSessionRoom(socketId: string, roomId: string | undefined): void;
    disconnectSession(socketId: string): void;
    deleteSession(socketId: string): void;
}
```

- [ ] **Step 3: Update SessionManager**

Replace `src/infrastructure/adapters/managers/session.manager.ts` entirely:

```ts
import { Injectable } from '@nestjs/common';
import { SessionPort } from '@application/ports/SessionPort';
import { Session } from '@application/dtos/Session.dto';
import { UserId } from '@shared/branded.types';

@Injectable()
export class SessionManager implements SessionPort {
    private readonly bySockId = new Map<string, Session>();
    private readonly byUserId = new Map<UserId, Session>();

    createOrReconnectSession(socketId: string, userId: UserId): Session {
        const existing = this.byUserId.get(userId);
        if (existing) {
            this.bySockId.delete(existing.socketId);
            const reconnected: Session = { ...existing, socketId };
            this.bySockId.set(socketId, reconnected);
            this.byUserId.set(userId, reconnected);
            return reconnected;
        }
        const session: Session = {
            sessionId: crypto.randomUUID(),
            socketId,
            userId,
        };
        this.bySockId.set(socketId, session);
        this.byUserId.set(userId, session);
        return session;
    }

    getSession(socketId: string): Session | undefined {
        return this.bySockId.get(socketId);
    }

    setSessionRoom(socketId: string, roomId: string | undefined): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        const updated: Session = { ...session, roomId };
        this.bySockId.set(socketId, updated);
        this.byUserId.set(session.userId, updated);
    }

    disconnectSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        // byUserId entry stays — enables reconnection
    }

    deleteSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        this.byUserId.delete(session.userId);
    }
}
```

- [ ] **Step 4: Update SessionCoordinatorService**

In `src/application/services/SessionCoordinator.service.ts`, change `handleConnect` signature from `deviceIdentifier: string` to `userId: UserId`:

```ts
import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { UserId } from '@shared/branded.types';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
    ) {}

    handleConnect(socketId: string, userId: UserId): void {
        const session = this.sessionPort.createOrReconnectSession(socketId, userId);
        if (!session.roomId) return;
        this.wsPort.joinRoom(socketId, session.roomId);
        const room = this.roomPort.getRoom(session.roomId);
        if (!room) return;
        this.wsPort.emitToSocket(socketId, 'roomUpdated', RoomMapper.toDTO(room));
        if (room.gameState) {
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(room.gameState));
        }
    }

    handleDisconnect(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        if (session.roomId) {
            const room = this.roomPort.quitRoom(session.sessionId);
            this.wsPort.leaveRoom(socketId, session.roomId);
            if (room) {
                this.wsPort.emitToRoom(session.roomId, 'roomUpdated', RoomMapper.toDTO(room));
            }
        }
        this.sessionPort.disconnectSession(socketId);
    }
}
```

- [ ] **Step 5: Update SessionGateway to validate JWT**

In `src/infrastructure/adapters/websocket/session.gateway.ts`, inject `JwtService` and `ConfigService`, and replace the `deviceIdentifier` handshake read with JWT validation:

```ts
import { UseGuards } from '@nestjs/common';
import {
    WebSocketGateway,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SharedWebSocketService } from './services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { JoinRoomPayload } from './payloads/JoinRoom.payload';
import { RearrangeTeamPayload } from './payloads/RearrangeTeam.payload';
import { ToggleDieLockPayload } from './payloads/ToggleDieLock.payload';
import { SelectTargetPayload } from './payloads/SelectTarget.payload';
import { SessionGuard } from './guards/Session.guard';
import { UserId } from '@shared/branded.types';

@UseGuards(SessionGuard)
@WebSocketGateway({ cors: { origin: '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    constructor(
        private readonly shared: SharedWebSocketService,
        private readonly sessionCoordinator: SessionCoordinatorService,
        private readonly roomCoordinator: RoomCoordinatorService,
        private readonly gameCoordinator: GameCoordinatorService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    afterInit(server: Server): void {
        this.shared.setServer(server);
    }

    handleConnection(client: Socket): void {
        const token = client.handshake.auth?.token as string | undefined;
        if (!token) {
            client.disconnect();
            return;
        }
        try {
            const payload = this.jwtService.verify<{ sub: string }>(token, {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
            });
            this.sessionCoordinator.handleConnect(client.id, payload.sub as UserId);
        } catch {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket): void {
        this.sessionCoordinator.handleDisconnect(client.id);
    }

    // Keep all existing @SubscribeMessage handlers unchanged below this line
    // (createRoom, joinRoom, quitRoom, confirmPlacement, confirmKeep,
    //  confirmAssignment, cancelPlacement, cancelKeep, cancelAssignment,
    //  rearrangeTeam, toggleDieLock, selectTarget, roll)
```

**Important:** Do not delete any existing `@SubscribeMessage` handlers — only the constructor, the two new injected services, and `handleConnection` change. Copy all existing handlers verbatim from the current file.

- [ ] **Step 6: Update SessionCoordinator tests**

In `tests/SessionCoordinator.service.spec.ts`, replace `deviceIdentifier` with `userId`:

```ts
import { UserId } from '@shared/branded.types';

const USER_ID = 'user-uuid-1' as UserId;
const SESSION: Session = { sessionId: 'p0', socketId: SOCKET, userId: USER_ID };
const SESSION_WITH_ROOM: Session = { ...SESSION, roomId: 'room-1' };
```

Update all `handleConnect` calls from `coordinator.handleConnect(SOCKET, 'dev-0')` to `coordinator.handleConnect(SOCKET, USER_ID)`.

Update all `createOrReconnectSession` expectation calls from `toHaveBeenCalledWith(SOCKET, 'dev-0')` to `toHaveBeenCalledWith(SOCKET, USER_ID)`.

- [ ] **Step 7: Run full test suite**

```bash
npm run test
```

Expected: all suites pass. If any test still references `deviceIdentifier`, search for it:

```bash
grep -r 'deviceIdentifier' tests/ src/
```

Expected: no results.

- [ ] **Step 8: Verify build + lint**

```bash
npm run build && npm run lint
```

Expected: no errors.
