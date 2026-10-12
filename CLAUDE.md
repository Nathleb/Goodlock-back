# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goodlock is the backend for a tactical PvP dice game. Each player fields a team of 5 characters (each represented by a 6-faced die). Players secretly roll and lock die faces each round, then all actions resolve in priority order (each face carries its own target cells — see Auto-targeting below). Built with NestJS + Socket.io. **Game state is in-memory** (rooms, sessions, live game state live in `Manager` classes, never persisted). A **Postgres database (via Prisma)** persists authentication (`User`, `RefreshToken`) and player data (`UserCharacter`: which catalog characters a user owns; `Deck` + `DeckSlot`: decks of 7 characters, max 5 per user). Character definitions are not in the database: they are git-authored in `tmplt/*.json`. Postgres runs locally via `docker-compose.yml`; the app itself is containerized via `Dockerfile`.

## Tooling

- **Plan mode** (Shift+Tab) enforces planning: no file can be modified until the plan is approved.
- **Claude-Mem** persists observations across sessions and re-injects relevant context on session start. Query past work with the `mem-search` skill.
- **Context-Mode** keeps the context window clean by sandboxing verbose tool output (`ctx_execute`, `ctx_batch_execute`, `ctx_search`).

## Commands

```bash
# Development
npm run start:dev       # watch mode
npm run build           # compile to dist/

# Tests
npm run test            # run all tests
npm run test:watch      # watch mode
npm run test:cov        # with coverage
npm run test:failed     # re-run only failed tests

# Run a single test file
npx jest tests/Room.service.spec.ts

# Lint & format
npm run lint
npm run format
```

## Architecture

Follows Hexagonal Architecture with three layers:

```
src/
  domain/          # Pure game logic, no framework, no I/O
  application/     # Use-case orchestration, ports, DTOs, mappers
  infrastructure/  # NestJS adapters: WebSocket gateway, in-memory managers
  shared/          # Cross-layer utilities (Result type, branded IDs)
```

**TypeScript path aliases** (defined in `tsconfig.json`):
- `@domain/*` -> `src/domain/*`
- `@application/*` -> `src/application/*`
- `@infrastructure/*` -> `src/infrastructure/*`
- `@shared/*` -> `src/shared/*`

### Domain layer (`src/domain/`)

Contains all game logic with zero NestJS dependencies:
- `types/` plain TypeScript types for `Character`, `Room`, `Session`, `GameState`, `Die`, `DieFace`, `Effect`, etc.
- `entities/` `CharacterEntity` (JSON template shape read from `tmplt/*.json`)
- `services/` `RoomService`, `SessionService`, `CharacterService`, `CharacterGeneration`, `CharacterCatalog` (`validateCatalog`: id presence/shape/uniqueness), `Deck` (`validateDeck`, `DECK_SIZE` = 7, `MAX_DECKS_PER_USER` = 5), `PriorityQueue`, `Player`, `GameInit`
- `services/TargetResolution.service.ts` `resolveTargets` (template target groups -> positions, from the actor's current slot) and `validateEffectTargets` (template validation)
- `factories/` `EffectFactory`: registry pattern for creating effects by label; effects must be registered before use
- `strategies/` `Damage`, `Heal`, `Shield`, `Swap`: generic effects applied to the cells resolved for them

Character templates live in `tmplt/*.json`, each with a stable authored `"id"` (`[a-z0-9-]+`, branded `CatalogId`; it is stored in DB rows, so never rename it). They are loaded once at boot by the catalog and built with `createCharacterFromTemplate`; every runtime `Character` carries its `catalogId`. Characters are never removed from the catalog (pre-release, a replacement reuses the id), so stored ids never dangle: validate on write, no "retired character" handling.

### Application layer (`src/application/`)

- `ports/` interfaces `RoomPort`, `SessionPort`, `WebSocketPort`, `CatalogPort` (sync, in-memory), `CollectionPort` (async, DB), `DeckPort` (async, DB) (tokens in `tokens.ts`)
- `services/` `RoomCoordinatorService`, `SessionCoordinatorService`, `AuthCoordinatorService`, `GameCoordinatorService`, `CollectionCoordinatorService` (the only write path into `UserCharacter`, validated against the catalog), `DeckCoordinatorService` (deck CRUD; another user's deck answers 404; last deck can't be deleted): bridge domain services with WebSocket/HTTP handlers
- `mappers/` `RoomMapper`: domain `Room` -> `RoomDTO`; `CollectionMapper`: template -> `CollectionCharacterDTO`; `DeckMapper`
- `dtos/` `RoomDTO`, `PlayerDTO`, `GameStateDTO`, `CollectionDTO`, `DeckDTO`/`SaveDeckDto`

### Infrastructure layer (`src/infrastructure/adapters/`)

- `managers/` `SessionManager`, `RoomManager`: in-memory `Map`-based state stores (the source of truth for all game state)
- `prisma/` `PrismaModule` + `PrismaService`: the Prisma client wrapper used by the repositories
- `adapters/repositories/` `UserRepository`, `RefreshTokenRepository`, `UserCharacterRepository`, `DeckRepository`: the only DB-backed code
- `adapters/catalog/` `FileCharacterCatalog`: reads and validates `tmplt/*.json` at boot (`CatalogModule`, which also owns `EFFECT_FACTORY`); a bad catalog stops the app from starting
- `adapters/http/` `AuthController`, `RoomController`, `CollectionController` (`GET /collection`), `DeckController` (`GET/POST /decks`, `PUT/DELETE /decks/:id`): REST endpoints
- `catalog.module.ts`, `collection.module.ts`, `deck.module.ts`, `auth.module.ts`: `AuthModule` imports `CollectionModule` and `DeckModule` (starter collection + deck on register/login), so `CollectionController` and `DeckController` are declared in `AppModule` to avoid a cycle
- `websocket/session.gateway.ts` single `@WebSocketGateway()` handling connection/disconnection and events: `createRoom`, `joinRoom`, `quitRoom`
- `websocket/shared.gateway.ts` `SharedWebSocketService` holds the Socket.io server instance (shared across services)
- `websocket/guards/` `JwtAccessGuard`, `SessionGuard`: JWT-based auth guards
- `websocket/services/` `WebSocketService` (emit helpers), `RoomWebSocketHandlerService`, `SessionWebSocketHandlerService`, `ErrorWebSocketHandlerService`

### Shared utilities (`src/shared/`)

- `branded.types.ts` `SessionId`, `SocketId`, `RoomId`, `PlayerId`, `CharacterId`, `DeviceId`, `UserId`, `CatalogId`, `DeckId` branded string types to prevent ID mix-ups
- `Result<T, E>` is **not implemented yet** (no `result.type.ts`); existing code throws. Introducing it is a dedicated change, not something to slip into a feature.

### Key design rules

1. **Coordinator pattern**: Application-layer coordinators (`RoomCoordinatorService`, `SessionCoordinatorService`) call domain services then dispatch WebSocket events. The gateway calls coordinators, never domain services directly.
2. **Session identity**: `socketId` changes on reconnect; `sessionId` (UUID) + `deviceIdentifier` are persistent. `SessionService.createOrReconnectSession` handles the re-binding.
3. **All game resolution is server-side**: dice rolls, action resolution, priority ordering. The client is display-only.
4. **Priority resolution (Pokemon-style)**: two independent keys. Actions sort by `face.priority` (a small bracket modifier) descending, then by `character.baseSpeed` descending within the same bracket. Equal `(bracket, speed)` pairs are shuffled (random tiebreak). Speed never crosses brackets. The queue is a flat `QueueEntry[]`; entries carry the actor's speed.
5. **Auto-targeting**: players never choose targets. Each effect in a template carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies. Off-board cells are dropped; no cell = fizzle. Phases: PLACEMENT -> ROLL -> KEEP -> RESOLVE -> RESULT (no ASSIGN).

## Workflow for any non-trivial task

Applies to any change touching domain logic, application services, the WebSocket protocol, or the architectural layers. See "Trivial tasks" for exceptions.

### 1. Recover context

Read the memory injected at session start (Claude-Mem observations + `MEMORY.md`). If the task touches past work (an effect, a refactor in progress, a known bug, a pending spec), run `mem-search` and check `docs/superpowers/specs/` and `docs/superpowers/plans/` before proposing anything.

### 2. Plan — always, before any code

Work in plan mode. The plan states:

- Which layer the change belongs to; new ports/adapters needed.
- Error handling (see "Result over exceptions"), new branded IDs, new effects/templates.
- Ordered steps, bottom-up: domain types → domain services/strategies → application ports/coordinators/DTOs/mappers → infrastructure adapters/gateway events, each with the tests to write first.

Each step is one testable unit: one failing test, the minimum code, tests green, one commit. A step that touches more than one layer or would take more than ~30 minutes gets split.

Wait for explicit approval. For a feature spanning several commits or sessions, save the approved spec/plan as `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` (existing location, kept for continuity) and update the plan's checkboxes as steps land.

### 3. Implement in TDD

For each step: failing test (red) → minimum code (green) → refactor with tests green. Domain tests live in `tests/` and never import NestJS. If three fix attempts fail on the same point, stop and discuss the design instead of persisting.

### 4. Verify

Run `npm run test` then `npm run lint` (route full output through Context-Mode). Never claim done without passing output.

### 5. Record

- State architectural decisions as "Decision: [choice] rather than [alternative] because [reason]." so Claude-Mem captures them.
- Update the auto-memory: mark the feature's `project_*` entry as done (absolute date, what shipped, what is still pending, e.g. frontend follow-up) and keep its `MEMORY.md` line in sync. Create the entry if none exists.
- Commit with a conventional message.

## Subagents

Use subagents only for: broad codebase searches where only the conclusion matters (`Explore`), an independent review before merging a large feature (`/code-review` or a reviewer agent given the spec + diff), or tasks with no shared state (e.g. mirroring a protocol change in Goodlock-frontend). TDD implementation stays in the main session, which holds the plan and the conventions.

## Context hygiene (Context-Mode)

- Verbose output (listings, logs, full test runs, external API calls, large files) goes through `ctx_execute` / `ctx_batch_execute`; only the summary enters the conversation.
- Never read a file longer than 200 lines in full unless editing it; use `ctx_index` + `ctx_search`.
- Batch multiple searches in one `ctx_batch_execute`.
- External docs (NestJS, Socket.io): `ctx_fetch_and_index`, not `WebFetch`.

## Sensitive data

Wrap any secret, API key, or private information in `<private>...</private>` tags; the Claude-Mem hook strips it before storage.

## Conventions for this codebase

**Result over exceptions** (target convention, pending `Result<T, E>`): once `shared/result.type.ts` exists, any function in `src/domain/` or `src/application/` that can fail in a domain-meaningful way returns `Result<T, E>`, and throwing is reserved for non-recoverable `infrastructure/` errors. Until then, follow the existing code's convention.

**Branded IDs**: never accept a raw `string` as an identifier in service signatures. Always use `SessionId`, `RoomId`, `PlayerId`, etc. If a new identifier type is needed, add it to `shared/branded.types.ts`.

**Test colocation**: tests live in `tests/` mirroring `src/` structure. One spec file per service or strategy. Domain specs must not import NestJS.

**Game state stays in-memory**: the `Manager` classes in `infrastructure/adapters/managers/` are the single source of truth for all game state (rooms, sessions, live games) and must never be persisted to the database. Persistence (Prisma/Postgres) is reserved for **auth and player data** — `User`, `RefreshToken`, `UserCharacter`, `Deck`, `DeckSlot` — accessed via the repositories in `adapters/repositories/`. Content (character definitions) stays in `tmplt/`, not in the database. Do not introduce a new DB-backed entity, a different ORM, or persist game state without explicit discussion.

**Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. One commit per logical change.

## Trivial tasks (workflow bypass)

No plan needed for: doc typos and comment fixes, IDE-assisted renames, `prettier`/`eslint --fix`, dependency bumps with no API change, questions that don't modify code.

## When in doubt

If the request is ambiguous, ask before acting.
