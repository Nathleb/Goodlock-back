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
npm run lint            # eslint --fix (rewrites files)
npm run lint:check      # eslint without --fix
npx tsc --noEmit        # typecheck src and tests
npm run format
```

## Architecture

Hexagonal Architecture, three layers. Dependencies point inward only:

```
src/
  domain/          # Pure game logic and types. No NestJS, no I/O. Imports nothing from the other layers.
  application/     # Use cases: coordinators, ports (interfaces), DTOs, mappers. Imports domain only.
  infrastructure/  # NestJS adapters: WebSocket gateway, HTTP controllers, in-memory managers, Prisma repositories, catalog loader. Implements the ports.
  shared/          # Cross-layer utilities (branded IDs; no Result type yet)
```

**Path aliases** (`tsconfig.json`): `@domain/*`, `@application/*`, `@infrastructure/*`, `@shared/*` map to the matching `src/` folder.

Facts that the code does not make obvious:

- Game state (rooms, sessions, live games) lives only in the in-memory managers `infrastructure/adapters/managers/`. The only DB-backed code is the repositories in `infrastructure/adapters/repositories/`.
- Character definitions are read from `tmplt/*.json` at boot by `FileCharacterCatalog`, which validates them: a bad catalog stops the app from starting. Every runtime `Character` carries its `catalogId`.
- Write to `UserCharacter` only through `CollectionCoordinatorService`, which validates against the catalog. `DeckCoordinatorService` answers 404 for another user's deck and refuses to delete the last deck.
- `CollectionController` and `DeckController` are declared in `AppModule` (not in their own modules) because `AuthModule` imports `CollectionModule` and `DeckModule`; declaring them there would create a cycle.
- The WebSocket events and their payloads are in `infrastructure/adapters/websocket/session.gateway.ts` and `payloads/`; read them there rather than from a list here.

### Key design rules

1. **Coordinator pattern**: Application-layer coordinators (`*CoordinatorService`) call domain services then dispatch WebSocket events. The gateway calls coordinators, never domain services directly.
2. **Session identity**: `socketId` changes on reconnect; `sessionId` (UUID) + `deviceIdentifier` are persistent. `SessionService.createOrReconnectSession` handles the re-binding.
3. **All game resolution is server-side**: dice rolls, action resolution, priority ordering. The client is display-only.
4. **Priority resolution (Pokemon-style)**: two independent keys. Actions sort by `face.priority` (a small bracket modifier) descending, then by `character.baseSpeed` descending within the same bracket. Equal `(bracket, speed)` pairs are shuffled (random tiebreak). Speed never crosses brackets. The queue is a flat `QueueEntry[]`; entries carry the actor's speed.
5. **Match entry and secrecy**: each player picks a deck in the room (`selectDeck`, loaded from the DB and snapshotted in the in-memory room — the only `await` on the WebSocket path). `startGame` opens SELECTION: both 6-decks are revealed, each player secretly keeps 4. The opponent's picks and team stay hidden (sent as `[]`) through SELECTION and PLACEMENT; the first room-wide state is the ROLL. Any emission before ROLL must go through the per-viewer mappers (`GameStateMapper.toDTOForViewer`). On connect the server sends `sessionStarted { sessionId }`; clients locate their seat (player index) in `room.players` with it.
6. **Auto-targeting**: players never choose targets. Each effect in a template carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies. Off-board cells are dropped; no cell = fizzle. The empty cell is kept: each effect decides what it does there (Damage/Heal/Shield: nothing on that cell, the rest of the pattern still applies; Swap moves the character into it, so the hole travels). `team` holds 4 characters ordered by slot; `position.slot` (0..4, `BOARD_SIZE` = 5) is the truth, never the array index. Phases: SELECTION -> PLACEMENT -> ROLL -> KEEP -> RESOLVE -> RESULT (no ASSIGN).
7. **HTTP vs WebSocket**: player data (auth, collection, decks) goes over HTTP controllers; lobby and match flow goes over the WebSocket gateway. The one exception is `selectDeck`, a WebSocket event that loads the deck from the DB. A new feature goes on the side of the data it touches; do not split one use case across both without discussing it.

## Reference docs

Read only when relevant, they are not loaded automatically: `docs/ROADMAP.md` (the only backlog and the direction to v1.0), `docs/SCALING.md` (before any decision on shared state or several instances).

## Workflow (Goodlock specifics)

The general workflow (plan, TDD, verify, review, record, git rules, conventional commits, trivial-task bypass) lives in `~/.claude/CLAUDE.md`. It applies to any change touching domain logic, application services, the WebSocket protocol, or the architectural layers. Also covered by the workflow: `prisma/schema.prisma` and migrations (always the full workflow) and `tmplt/*.json` edits (no plan, but `npm run test` must pass, since the catalog is validated at boot). `Dockerfile`, `docker-compose.yml` and `docs/` are trivial unless they change behavior. What follows is only what Goodlock adds.

- **Memory roles**: the auto-memory (`MEMORY.md` and its `project_*` files) holds the state of features (what shipped, what is pending). Claude-Mem holds the history of decisions and observations. To recover context, read `MEMORY.md` for the state, then run `mem-search` for the why when the task touches past work (an effect, a refactor in progress, a known bug, a pending spec). Record state in the auto-memory only; decisions go in "Decision:" phrasing for Claude-Mem to capture.
- **Plan**: also state new ports/adapters, new branded IDs and new effects/templates. Order steps bottom-up: domain types → domain services/strategies → application ports/coordinators/DTOs/mappers → infrastructure adapters/gateway events, each with the tests to write first.
- **Step size**: a step never spans more than one layer.
- **Verify**: `npm run test`, `npm run lint:check`, `npx tsc --noEmit` (typechecks src and tests together), and `npm run build` before a Docker build. Never use `npm run lint` (`--fix`) as a check: it rewrites files.
- **Review**: the `reviewer` agent is defined globally in `~/.claude/agents/reviewer.md`. `/code-review` is the lighter alternative.
- **Record**: mark the feature's `project_*` auto-memory entry as done (absolute date, what shipped, what is pending, e.g. client follow-up) and keep its `MEMORY.md` line in sync; create the entry if none exists.
- **Subagents**: besides search and the review, a protocol change can be mirrored in Goodlock-app by a subagent (no shared state).

## Recurring tasks

**Add an effect**: add the label to `EffectLabel` (`domain/types/EffectLabels.type.ts`); write the strategy in `domain/strategies/` (red test first, one spec per strategy); register it in `buildEffectFactory()` (`domain/services/GameInit.service.ts`; `CatalogModule` provides the result as `EFFECT_FACTORY`); check that `validateEffectTargets` accepts its target groups; use it in a `tmplt/*.json` template and run the catalog specs, since a bad catalog stops the app from booting.

**Add a WebSocket event**: domain function first (red test); coordinator method in `application/services/` (it catches errors and emits them, see Conventions); handler in `session.gateway.ts` with the existing guards; payload type in `adapters/websocket/payloads/` and a DTO plus mapper if state is emitted. Anything emitted before ROLL goes through `GameStateMapper.toDTOForViewer`. Then mirror the event in Goodlock-app (see Client contract).

**Schema change** (`prisma/schema.prisma`): there is no natural red test for a schema step. Verify it with `npx prisma validate`, `npx prisma generate` and `npx tsc --noEmit`, plus a repository or module spec if behavior changes. Create the migration without applying it: `npx prisma migrate dev --create-only --name <topic>` (needs the local Postgres up). Applying it (`npx prisma migrate dev`) is a human-only step. Run `npx prisma generate` after any schema change, or `tsc` fails on the client types.

## Client contract

The client is the sibling repo `../Goodlock-app` (Flutter + Flame). There is no shared package and no generated types: the protocol is mirrored by hand. WebSocket events are in `lib/net/game_socket.dart`, payload models in `lib/net/models.dart`, HTTP calls in `lib/net/api.dart`, game constants in `lib/net/rules.dart`. A protocol change here is not done until those files match; a subagent can do the mirroring.

## Guardrails

- Migrations: Released: no (flip to yes at v1.0, see docs/ROADMAP.md). While not released, the data is disposable and the schema history is not precious. Prefer adding a new migration, but squashing or rewriting migrations and resetting the dev DB is acceptable when the user asks. Once the game is released, never edit an applied migration. Never hand-edit the generated Prisma client.
- Environment: the tests mock Prisma and need no database. Running the app needs the local Postgres (`docker-compose.yml`) and a `.env` (template: `.env.example`); do not commit `.env`.

## Conventions for this codebase

**Errors**: the subject of domain errors is not settled yet. Today the domain throws plain `Error`, the WebSocket coordinators catch it and emit `'error' { message }`, and the HTTP coordinators throw Nest exceptions. Do not introduce custom error classes or a new error scheme without discussing it first.

**Result over exceptions** (target convention; `Result<T, E>` is not implemented yet, and introducing it is a dedicated change, not something to slip into a feature): once `shared/result.type.ts` exists, any function in `src/domain/` or `src/application/` that can fail in a domain-meaningful way returns `Result<T, E>`, and throwing is reserved for non-recoverable `infrastructure/` errors.

**Randomness**: domain code calls `Math.random` directly (`domain/utils/Random.utils.ts`, `shuffled()` in `PriorityQueue.service.ts`). Tests make it deterministic with `jest.spyOn(Math, 'random')` and restore it with `jest.restoreAllMocks()` in `afterEach` (Jest's `restoreMocks` is off). A `mockReturnValueOnce` sequence depends on the number and order of calls, so changing the shuffle algorithm can break such tests without any behavior change.

**Branded IDs**: never accept a raw `string` as an identifier in service signatures. Always use `SessionId`, `RoomId`, `PlayerId`, etc. If a new identifier type is needed, add it to `shared/branded.types.ts`.

**Test colocation**: tests live in `tests/` mirroring `src/` structure. One spec file per service or strategy. Domain specs must not import NestJS.

**Game state stays in-memory**: the `Manager` classes in `infrastructure/adapters/managers/` are the single source of truth for all game state (rooms, sessions, live games) and must never be persisted to the database. Persistence (Prisma/Postgres) is reserved for **auth and player data** — `User`, `RefreshToken`, `UserCharacter`, `Deck`, `DeckSlot` — accessed via the repositories in `adapters/repositories/`. Content (character definitions) stays in `tmplt/`, not in the database. Do not introduce a new DB-backed entity, a different ORM, or persist game state without explicit discussion.
