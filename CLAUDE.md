# CLAUDE.md

## Project

Goodlock is the backend for a tactical PvP dice game. Each player brings a deck of 6 characters, keeps 4 of them for the match after seeing the opponent's deck (team preview), and lays that team of 4 out on a 5-cell board, leaving one cell empty (each character is a 6-faced die). A player loses with 2 dead characters. Players secretly roll and lock die faces each round, then all actions resolve in priority order (each face carries its own target cells — see Auto-targeting below). Built with NestJS + Socket.io. **Game state is in-memory** (rooms, sessions, live game state live in `Manager` classes, never persisted). A **Postgres database (via Prisma)** persists authentication (`User`, `RefreshToken`) and player data (`UserCharacter`: which catalog characters a user owns; `Deck` + `DeckSlot`: decks of 6 characters, max 5 per user). Character definitions are not in the database: they are git-authored in `tmplt/*.json`. Postgres runs locally via `docker-compose.yml`; the app itself is containerized via `Dockerfile`.

## Tooling

- **Plan mode** (Shift+Tab) enforces planning: no file can be modified until the plan is approved.
- **Claude-Mem** persists observations across sessions and re-injects relevant context on session start. Query past work with the `mem-search` skill.

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
- `services/` `RoomService`, `SessionService`, `CharacterService`, `CharacterGeneration`, `CharacterCatalog` (`validateCatalog`: id presence/shape/uniqueness), `Deck` (`validateDeck`, `DECK_SIZE` = 6, `TEAM_SIZE` = 4, `MAX_DECKS_PER_USER` = 5), `PriorityQueue`, `Player`, `GameInit`
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
- `websocket/session.gateway.ts` single `@WebSocketGateway()` handling connection/disconnection and events: lobby `createRoom`, `joinRoom`, `quitRoom`, `selectDeck`; game `startGame`, `confirmSelection`/`cancelSelection`, `rearrangeTeam` (`{ slots }`: the 5 cells, one `null`), `confirmPlacement`/`cancelPlacement`, `confirmKeep`/`cancelKeep`, `claimVictory`
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
5. **Match entry and secrecy**: each player picks a deck in the room (`selectDeck`, loaded from the DB and snapshotted in the in-memory room — the only `await` on the WebSocket path). `startGame` opens SELECTION: both 6-decks are revealed, each player secretly keeps 4. The opponent's picks and team stay hidden (sent as `[]`) through SELECTION and PLACEMENT; the first room-wide state is the ROLL. Any emission before ROLL must go through the per-viewer mappers (`GameStateMapper.toDTOForViewer`). On connect the server sends `sessionStarted { sessionId }`; clients locate their seat (player index) in `room.players` with it.
6. **Auto-targeting**: players never choose targets. Each effect in a template carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies. Off-board cells are dropped; no cell = fizzle. The empty cell is kept: each effect decides what it does there (Damage/Heal/Shield: nothing on that cell, the rest of the pattern still applies; Swap moves the character into it, so the hole travels). `team` holds 4 characters ordered by slot; `position.slot` (0..4, `BOARD_SIZE` = 5) is the truth, never the array index. Phases: SELECTION -> PLACEMENT -> ROLL -> KEEP -> RESOLVE -> RESULT (no ASSIGN).

## Workflow (Goodlock specifics)

The general workflow (plan, TDD, verify, review, record, git rules, conventional commits, trivial-task bypass) lives in `~/.claude/CLAUDE.md`. It applies to any change touching domain logic, application services, the WebSocket protocol, or the architectural layers. What follows is only what Goodlock adds.

- **Recover context**: besides `MEMORY.md`, run `mem-search` (Claude-Mem) when the task touches past work (an effect, a refactor in progress, a known bug, a pending spec).
- **Plan**: state which layer the change belongs to and any new ports/adapters, error handling (see "Result over exceptions"), new branded IDs, new effects/templates. Order steps bottom-up: domain types → domain services/strategies → application ports/coordinators/DTOs/mappers → infrastructure adapters/gateway events, each with the tests to write first.
- **Step size**: one step = one tested behavior. If the red test needs two behaviors, split the step. A step never spans more than one layer.
- **TDD**: domain tests live in `tests/` and never import NestJS.
- **Verify**: `npm run test`, `npm run lint`, then `npm run build` (the Nest build typechecks, which tests and lint do not).
- **Review**: the `reviewer` agent is defined globally in `~/.claude/agents/reviewer.md`. `/code-review` is the lighter alternative.
- **Record**: state decisions as "Decision: [choice] rather than [alternative] because [reason]." so Claude-Mem captures them. Mark the feature's `project_*` memory entry as done (absolute date, what shipped, what is pending, e.g. client follow-up) and keep its `MEMORY.md` line in sync; create the entry if none exists.
- **Subagents**: besides search and the review, a protocol change can be mirrored in Goodlock-app by a subagent (no shared state).

## Guardrails

- Migrations: pre-release, the data is disposable and the schema history is not precious. Prefer adding a new migration, but squashing or rewriting migrations and resetting the dev DB is acceptable when the user asks. Once the game is released, never edit an applied migration. Never hand-edit the generated Prisma client.
- Never hand-edit `package-lock.json`; change it only through npm.
- Environment: the tests mock Prisma and need no database. Running the app needs the local Postgres (`docker-compose.yml`) and a `.env` (template: `.env.example`); do not commit `.env`.
- Secrets, API keys and private data go in `<private>...</private>` tags if they must appear in a prompt; the Claude-Mem hook strips them before storage.

## Conventions for this codebase

**Result over exceptions** (target convention, pending `Result<T, E>`): once `shared/result.type.ts` exists, any function in `src/domain/` or `src/application/` that can fail in a domain-meaningful way returns `Result<T, E>`, and throwing is reserved for non-recoverable `infrastructure/` errors. Until then, follow the existing code's convention.

**Branded IDs**: never accept a raw `string` as an identifier in service signatures. Always use `SessionId`, `RoomId`, `PlayerId`, etc. If a new identifier type is needed, add it to `shared/branded.types.ts`.

**Test colocation**: tests live in `tests/` mirroring `src/` structure. One spec file per service or strategy. Domain specs must not import NestJS.

**Game state stays in-memory**: the `Manager` classes in `infrastructure/adapters/managers/` are the single source of truth for all game state (rooms, sessions, live games) and must never be persisted to the database. Persistence (Prisma/Postgres) is reserved for **auth and player data** — `User`, `RefreshToken`, `UserCharacter`, `Deck`, `DeckSlot` — accessed via the repositories in `adapters/repositories/`. Content (character definitions) stays in `tmplt/`, not in the database. Do not introduce a new DB-backed entity, a different ORM, or persist game state without explicit discussion.
