# CLAUDE.md

## Project

Goodlock is the backend for a tactical PvP dice game (each character is a 6-faced die; rules, phases and authoring principles are in `docs/GAME-DESIGN.md`). Built with NestJS + Socket.io. **Game state is in-memory** (rooms, sessions, live game state live in `Manager` classes, never persisted). A **Postgres database (via Prisma)** persists authentication (`User`, `RefreshToken`) and player data (`UserCharacter`: which catalog characters a user owns; `Deck` + `DeckSlot`: decks of 6 characters, max 5 per user). Character definitions are not in the database: they are git-authored in `tmplt/*.json`. Postgres runs locally via `docker-compose.yml`; the app itself is containerized via `Dockerfile`.

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

# Quality gates (see "Quality gates" below)
npm run quality         # check:arch + check:dup + check:dead
npm run check:arch      # dependency-cruiser: layers and cycles
npm run check:dup       # jscpd: duplicated code
npm run check:dead      # knip in production mode, compared to quality-baseline.json
npm run test:mutation   # Stryker, slow (about 30 min the first time, incremental after)
npm run test:scripts    # tests of scripts/quality-ratchet.mjs
```

## Architecture

Hexagonal Architecture, three layers. Dependencies point inward only (enforced by `no-restricted-imports` in `eslint.config.mjs`: domain imports no other layer, no NestJS, Prisma or socket.io; application imports no infrastructure):

```
src/
  domain/          # Pure game logic and types. No NestJS, no I/O. Imports nothing from the other layers.
  application/     # Use cases: coordinators, ports (interfaces), DTOs, mappers. Imports domain only.
  infrastructure/  # NestJS adapters: WebSocket gateway, HTTP controllers, in-memory managers, Prisma repositories, catalog loader. Implements the ports.
  shared/          # Cross-layer utilities (branded IDs, the Result re-export)
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
4. **Priority resolution**: the rules (bracket, then speed, tiebreak) are in `docs/GAME-DESIGN.md` section 3. The queue is a flat `QueueEntry[]`; entries carry the actor's speed.
5. **Match entry and secrecy**: each player picks a deck in the room (`selectDeck`, loaded from the DB and snapshotted in the in-memory room — the only `await` on the WebSocket path). `startGame` opens SELECTION: both 6-decks are revealed, each player secretly keeps 4. The opponent's picks and team stay hidden (sent as `[]`) through SELECTION and PLACEMENT; the first room-wide state is the ROLL. Any emission before ROLL must go through the per-viewer mappers (`GameStateMapper.toDTOForViewer`). On connect the server sends `sessionStarted { sessionId }`; clients locate their seat (player index) in `room.players` with it.
6. **Auto-targeting**: players never choose targets (rules in `docs/GAME-DESIGN.md` section 3). Each effect in a template carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies. `team` holds 4 characters ordered by slot; `position.slot` (0..4, `BOARD_SIZE` = 5) is the truth, never the array index.
7. **HTTP vs WebSocket**: player data (auth, collection, decks) goes over HTTP controllers; lobby and match flow goes over the WebSocket gateway. The one exception is `selectDeck`, a WebSocket event that loads the deck from the DB. A new feature goes on the side of the data it touches; do not split one use case across both without discussing it.

## Reference docs

Read only when relevant, they are not loaded automatically: `docs/GAME-DESIGN.md` (game rules, dice authoring principles, value scale; read before any change to game mechanics or character templates, and update it when a feature changes a rule it states), `docs/ROADMAP.md` (the only backlog and the direction to v1.0), `docs/SCALING.md` (before any decision on shared state or several instances).

## Workflow (Goodlock specifics)

The general workflow (plan, TDD, verify, review, record, git rules, conventional commits, trivial-task bypass) lives in `~/.claude/CLAUDE.md`. It applies to any change touching domain logic, application services, the WebSocket protocol, or the architectural layers. Also covered by the workflow: `prisma/schema.prisma` and migrations (always the full workflow) and `tmplt/*.json` edits (no plan, but `npm run test` must pass, since the catalog is validated at boot). `Dockerfile`, `docker-compose.yml` and `docs/` are trivial unless they change behavior. What follows is only what Goodlock adds.

- **Memory roles**: the auto-memory (`MEMORY.md` and its `project_*` files) holds the state of features (what shipped, what is pending). Claude-Mem holds the history of decisions and observations. To recover context, read `MEMORY.md` for the state, then run `mem-search` for the why when the task touches past work (an effect, a refactor in progress, a known bug, a pending spec). Record state in the auto-memory only; decisions go in "Decision:" phrasing for Claude-Mem to capture.
- **Plan**: also state new ports/adapters, new branded IDs and new effects/templates. Order steps bottom-up: domain types → domain services/strategies → application ports/coordinators/DTOs/mappers → infrastructure adapters/gateway events, each with the tests to write first.
- **Step size**: a step never spans more than one layer.
- **Verify**: `npm run test`, `npm run lint:check`, `npx tsc --noEmit` (typechecks src and tests together), and `npm run build` before a Docker build. Never use `npm run lint` (`--fix`) as a check: it rewrites files. Then every quality gate below (`npm run quality`, and `npm run test:mutation` on the code of the feature). GitHub Actions (`.github/workflows/ci.yml`) runs all of them on every push to `main` and every pull request.
- **Review**: the `reviewer` agent is defined globally in `~/.claude/agents/reviewer.md`. `/code-review` is the lighter alternative.
- **Record**: mark the feature's `project_*` auto-memory entry as done (absolute date, what shipped, what is pending, e.g. client follow-up) and keep its `MEMORY.md` line in sync; create the entry if none exists.
- **Subagents**: besides search and the review, a protocol change can be mirrored in Goodlock-app by a subagent (no shared state).

## Quality gates

These are guardrails (rules in `~/.claude/CLAUDE.md`). Each one is a ratchet: it was measured on the existing code and fails when the code gets worse than that level. When a gate blocks, fix the cause. Never silence a finding, exclude a file or raise a threshold. When a cleanup improves a level, tighten it in the same commit.

Stryker and dependency-cruiser need Node 22 or later (the app itself and the `verify` CI job use Node 20, like the Dockerfile), so the `quality` and `mutation` CI jobs run on Node 22.

The level of each ratchet is the number in the file named below (not repeated here, so it cannot go stale).

| Gate | Tool | Where the level is set |
| --- | --- | --- |
| Tests | jest | all green |
| Complexity | ESLint `complexity` | `eslint.config.mjs` |
| Layers, cycles | dependency-cruiser | the known cycles in `.dependency-cruiser-known-violations.json`, no new one |
| Duplication | jscpd | `threshold` in `.jscpd.json` |
| Dead code | knip, production mode (code only tests use counts as dead) | `knipIssues` in `quality-baseline.json` |
| Useless tests | Stryker | `thresholds.break` in `stryker.config.json` |

The block below is read by the tooling in `~/.claude/` (the `blockers-report` skill and the no-bypass hook). Keep it in sync with the table. A `failure` is a regex on the output of the command.

```quality-gates
{
  "gates": [
    { "name": "jest", "command": "npm run test", "failure": "\\b[1-9]\\d* failed\\b|^FAIL\\s+\\S+" },
    { "name": "eslint", "command": "npm run lint:check", "failure": "✖ \\d+ problems? \\([1-9]\\d* errors?" },
    { "name": "tsc", "command": "npx tsc --noEmit", "failure": "error TS\\d+" },
    { "name": "dependency-cruiser", "command": "npm run check:arch", "failure": "(?<!\\d)[1-9]\\d* dependency violations?" },
    { "name": "jscpd", "command": "npm run check:dup", "failure": "found too many duplicates" },
    { "name": "knip", "command": "npm run check:dead", "failure": "more dead-code issues" },
    { "name": "stryker", "command": "npm run test:mutation", "failure": "Final mutation score [\\d.]+ under breaking threshold" }
  ],
  "suppressions": [
    "eslint-disable", "@ts-ignore", "@ts-expect-error", "@ts-nocheck", "istanbul ignore",
    "Stryker disable", "jscpd:ignore", "@public", "@internal", "/* eslint "
  ],
  "guardFiles": [
    "eslint.config.mjs", "stryker.config.json", ".jscpd.json", "knip.json",
    ".dependency-cruiser.cjs", ".dependency-cruiser-known-violations.json",
    "quality-baseline.json", "scripts/quality-ratchet.mjs", "package.json", ".gitignore",
    "jest.config.ts", "tsconfig.json", ".github/workflows/"
  ]
}
```

## Recurring tasks

**Add an effect**: add the label to `EffectLabel` (`domain/types/EffectLabels.type.ts`); write the strategy in `domain/strategies/` (red test first, one spec per strategy); add its case to `effectFor` (`domain/strategies/effectFor.ts`: the exhaustive switch does not compile until it is there); check that `validateEffectTargets` accepts its target groups; use it in a `tmplt/*.json` template and run the catalog specs, since a bad catalog stops the app from booting.

**Add a WebSocket event**: domain function first (red test); coordinator method in `application/services/` (a failed Result is reported as `error { code, message }`, see Conventions); handler in `session.gateway.ts` with the existing guards; payload class in `adapters/websocket/payloads/` and a DTO plus mapper if state is emitted. The gateway validates every `@MessageBody()` with a `ValidationPipe` (`whitelist` and `forbidNonWhitelisted`), so every property of a payload class needs a class-validator decorator, or every real client message is refused with "property X should not exist". `tests/SessionGateway.validation.spec.ts` mounts the gateway on a real socket: add a case there for the new payload. Anything emitted before ROLL goes through `GameStateMapper.toDTOForViewer`. Then mirror the event in Goodlock-app (see Client contract).

**Schema change** (`prisma/schema.prisma`): there is no natural red test for a schema step. Verify it with `npx prisma validate`, `npx prisma generate` and `npx tsc --noEmit`, plus a repository or module spec if behavior changes. Create the migration without applying it: `npx prisma migrate dev --create-only --name <topic>` (needs the local Postgres up). Applying it (`npx prisma migrate dev`) is a human-only step. Run `npx prisma generate` after any schema change, or `tsc` fails on the client types.

## Client contract

The client is the sibling repo `../Goodlock-app` (Flutter + Flame). There is no shared package and no generated types: the protocol is mirrored by hand. WebSocket events are in `lib/net/game_socket.dart`, payload models in `lib/net/models.dart`, HTTP calls in `lib/net/api.dart`, game constants in `lib/net/rules.dart`. A protocol change here is not done until those files match; a subagent can do the mirroring.

## Guardrails

- Migrations: Released: no (flip to yes at v1.0, see docs/ROADMAP.md). While not released, the data is disposable and the schema history is not precious. Prefer adding a new migration, but squashing or rewriting migrations and resetting the dev DB is acceptable when the user asks. Once the game is released, never edit an applied migration. Never hand-edit the generated Prisma client.
- Environment: the tests mock Prisma and need no database. Running the app needs the local Postgres (`docker-compose.yml`) and a `.env` (template: `.env.example`); do not commit `.env`.

## Conventions for this codebase

**Errors (WebSocket path)**: a function in `src/domain/` or `src/application/` that can fail because of a player action returns `Result<T, DomainError>` (`Result` is `neverthrow`, re-exported by `shared/result.type.ts`; `DomainError` is a plain `{ code, message }` object built with `domainError(code, message)` in `domain/errors/DomainError.ts`). Add a code to `DOMAIN_ERROR_CODES` when a new rule can be broken, and keep the message player-readable. Chain checks with `andThen`/`map` (see `confirmKeep`).

A bug, a broken invariant or an authoring/boot error is not a `DomainError`: it stays a thrown plain `Error` (`effectFor` parameter checks, template and catalog validation, config readers, "Unknown character in deck"). For a step the coordinator has just set up itself, `invariant(result)` (`application/errors/invariant.ts`) turns a failure into such a throw.

Coordinators send every failure to the client with `emitFailure`: a `DomainError` keeps its code and message, anything thrown is logged and reported as `INTERNAL` / "Internal error" (`toErrorPayload`). The gateway answers a refused request through `WsErrorFilter` (`INVALID_REQUEST` for a bad payload, `NOT_CONNECTED` without a session). The client always receives `error { code, message }`; the codes are `DOMAIN_ERROR_CODES` in `domain/errors/DomainError.ts` plus `INVALID_REQUEST`, `NOT_CONNECTED` and `INTERNAL` in `application/dtos/Error.dto.ts`.

The HTTP coordinators (auth, collection, decks) still throw Nest exceptions from `application/`; moving them to the same scheme is a separate change. Do not add custom error classes.

**Randomness**: domain code calls `Math.random` directly through `domain/utils/Random.utils.ts` (`roll1D`: dice rolls and the initiative draw). Resolution itself is never random. Tests make it deterministic with `jest.spyOn(Math, 'random')` and restore it with `jest.restoreAllMocks()` in `afterEach` (Jest's `restoreMocks` is off). A `mockReturnValueOnce` sequence depends on the number and order of calls, so changing how a roll is drawn can break such tests without any behavior change.

**Branded IDs**: never accept a raw `string` as an identifier in service signatures. Always use `SessionId`, `RoomId`, `PlayerId`, etc. If a new identifier type is needed, add it to `shared/branded.types.ts`.

**Test colocation**: tests live in `tests/` mirroring `src/` structure. One spec file per service or strategy. Domain specs must not import NestJS.

**Game state stays in-memory**: the `Manager` classes in `infrastructure/adapters/managers/` are the single source of truth for all game state (rooms, sessions, live games) and must never be persisted to the database. Persistence (Prisma/Postgres) is reserved for **auth and player data** — `User`, `RefreshToken`, `UserCharacter`, `Deck`, `DeckSlot` — accessed via the repositories in `adapters/repositories/`. Content (character definitions) stays in `tmplt/`, not in the database. Do not introduce a new DB-backed entity, a different ORM, or persist game state without explicit discussion.
