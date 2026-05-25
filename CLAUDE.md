# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goodlock is the backend for a tactical PvP dice game. Each player fields a team of 5 characters (each represented by a 6-faced die). Players secretly assign die face effects each round, then all actions resolve in priority order. Built with NestJS + Socket.io; no database yet (all state in-memory).

## Active plugins

Three Claude Code plugins are installed and cooperate on this project. Each has a distinct role.

- **Superpowers** drives development methodology: brainstorming, planning, TDD execution, debugging.
- **Context-Mode** keeps the context window clean by sandboxing tool output.
- **Claude-Mem** persists decisions across sessions and re-injects relevant context on session start.

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
- `services/` `RoomService`, `SessionService`, `CharacterService`, `CharacterGeneration`, `PriorityQueue`, `Player`, `Position`, `GameInit`
- `factories/` `EffectFactory`: registry pattern for creating effects by label; effects must be registered before use
- `strategies/` `SingleTargetDamage/Heal/Shield`; implement per-effect resolution logic

Character templates live in `tmplt/*.json` and are parsed by `CharacterGeneration.service.ts` (`createCharacterFromJsonTemplate`).

### Application layer (`src/application/`)

- `ports/` interfaces `RoomPort`, `SessionPort`, `WebSocketPort` (tokens in `tokens.ts`)
- `services/` `RoomCoordinatorService`, `SessionCoordinatorService`: bridge domain services with WebSocket handlers
- `mappers/` `RoomMapper`: domain `Room` -> `RoomDTO`
- `dtos/` `RoomDTO`, `PlayerDTO`, `GameStateDTO`

### Infrastructure layer (`src/infrastructure/adapters/`)

- `managers/` `SessionManager`, `RoomManager`: in-memory `Map`-based state stores
- `websocket/session.gateway.ts` single `@WebSocketGateway()` handling connection/disconnection and events: `createRoom`, `joinRoom`, `quitRoom`
- `websocket/shared.gateway.ts` `SharedWebSocketService` holds the Socket.io server instance (shared across services)
- `websocket/services/` `WebSocketService` (emit helpers), `RoomWebSocketHandlerService`, `SessionWebSocketHandlerService`, `ErrorWebSocketHandlerService`

### Shared utilities (`src/shared/`)

- `result.type.ts` `Result<T, E>` / `ok()` / `err()` / `unwrap()`. Use this for domain error handling instead of throwing.
- `branded.types.ts` `SessionId`, `SocketId`, `RoomId`, `PlayerId`, `CharacterId`, `DeviceId` branded string types to prevent ID mix-ups
- `id.utils.ts`, `random.utils.ts`

### Key design rules

1. **Coordinator pattern**: Application-layer coordinators (`RoomCoordinatorService`, `SessionCoordinatorService`) call domain services then dispatch WebSocket events. The gateway calls coordinators, never domain services directly.
2. **Session identity**: `socketId` changes on reconnect; `sessionId` (UUID) + `deviceIdentifier` are persistent. `SessionService.createOrReconnectSession` handles the re-binding.
3. **All game resolution is server-side**: dice rolls, action resolution, priority ordering. The client is display-only.
4. **Priority resolution**: `finalPriority(face) = face.priority + character.baseSpeed`.

## Workflow for any non-trivial task

For any change touching domain logic, application services, the WebSocket protocol, or the architectural layers, follow this sequence. Skip it only for typos, formatting, dependency bumps without API changes, and renaming.

### Step 1: Recover prior context

At session start, Claude-Mem injects observations from previous sessions. Read them before proposing anything. If the task references past decisions (a new effect strategy, a refactor in progress, a known bug), query the memory via the `mem-search` skill with a natural-language question before suggesting a direction.

### Step 2: Brainstorm against the architecture

Invoke `/brainstorm` (Superpowers) and frame the discussion within the existing constraints:

- Which layer does this belong to (domain, application, infrastructure)?
- Does it require a new port, a new adapter, or both?
- Does it return `Result<T, E>` or throw? (Default: `Result`. Throwing is reserved for genuinely exceptional infrastructure failures.)
- Are new branded IDs needed?
- Does it introduce a new effect, strategy, or character template?

The output is a short spec validated explicitly before moving on.

### Step 3: Plan

Invoke `/write-plan` (Superpowers). The plan must list, in order:

1. Domain types or entities to add or modify.
2. Domain services or strategies impacted.
3. Application ports, coordinators, DTOs, and mappers to adjust.
4. Infrastructure adapters and gateway events to wire.
5. Tests to write before each layer (TDD discipline applies bottom-up: domain first, then application, then infrastructure).

### Step 4: Execute in TDD

Invoke `/execute-plan` (Superpowers). For each unit:

1. Write the failing test (red). Domain tests live in `tests/` and never import from NestJS.
2. Implement the minimum to pass (green).
3. Refactor with tests green.

If three fix attempts fail on the same point, stop and trigger an architectural review rather than persisting.

### Step 5: Verify

Run `npm run test`, then `npm run lint`. Summarize the architectural decisions taken in a structured message so Claude-Mem captures them as observations. Format: "Decision: [choice] rather than [alternative] because [reason]."

## Context hygiene rules (Context-Mode)

The context window is finite. Apply the following systematically.

**Verbose output**: any listing, log dump, external API call, or large file read goes through `ctx_execute` or `ctx_batch_execute`. Never read a file longer than 200 lines in full; use `ctx_index` then `ctx_search` to target the relevant section.

**Test runs**: when running the full test suite, route through `ctx_execute` so only the failure summary enters the conversation. The full Jest output is rarely needed in context.

**Grouped searches**: if multiple searches are needed (cross-cutting refactor, hunting for a regression), batch them in a single `ctx_batch_execute` instead of sequential calls.

**External documentation**: for fetching NestJS or Socket.io docs, use `ctx_fetch_and_index` rather than `WebFetch`. Pages are indexed in FTS5 and queryable on demand without polluting context.

**Stats check**: on long sessions, run `/context-mode:stats` periodically. If the conversation slows down, the context is saturated despite the sandbox.

## Persistent memory rules (Claude-Mem)

Observations are captured automatically. Respect these conventions to maximize their usefulness.

**Architectural decisions**: state choices explicitly in messages such as "Decision: extracted PriorityQueue into a dedicated service rather than inlined in GameInit, because it will be reused by the future async combat system." This format is captured cleanly by the observer.

**Sensitive data**: wrap any secret, API key, or private information in `<private>...</private>` tags. The Claude-Mem hook strips this content before it reaches the worker and database.

**History queries**: to interrogate past sessions, ask natural questions ("How did we handle reconnection in the SessionService refactor?"). The `mem-search` skill auto-triggers.

## Conventions for this codebase

**Result over exceptions**: any function in `src/domain/` or `src/application/` that can fail in a domain-meaningful way returns `Result<T, E>`. Throwing is reserved for `infrastructure/` and only for non-recoverable system errors.

**Branded IDs**: never accept a raw `string` as an identifier in service signatures. Always use `SessionId`, `RoomId`, `PlayerId`, etc. If a new identifier type is needed, add it to `shared/branded.types.ts`.

**Test colocation**: tests live in `tests/` mirroring `src/` structure. One spec file per service or strategy. Domain specs must not import NestJS.

**No database, in-memory only**: do not introduce TypeORM, Prisma, or any persistence layer without explicit discussion. The `Manager` classes in `infrastructure/adapters/managers/` are the single source of truth for state.

**Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. One commit per logical change.

## Trivial tasks (workflow bypass)

The full workflow does not apply to:

- Documentation typos and comment fixes.
- Variable or file renaming with IDE refactor support.
- Running `prettier`/`eslint --fix`.
- Dependency version bumps with no API surface change.
- Clarification questions that do not modify code.

Anything else triggers the full workflow.

## When in doubt

If the request is ambiguous, ask a question before acting. A clarifying question costs thirty seconds; a wrong implementation costs hours to undo.