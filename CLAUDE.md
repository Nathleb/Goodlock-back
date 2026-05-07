# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goodlock is the backend for a tactical PvP dice game. Each player fields a team of 5 characters (each represented by a 6-faced die). Players secretly assign actions each round (play a face effect or swap positions), then all actions resolve in priority order. Built with NestJS + Socket.io; no database yet (all state in-memory).

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
  domain/          # Pure game logic — no framework, no I/O
  application/     # Use-case orchestration, ports, DTOs, mappers
  infrastructure/  # NestJS adapters: WebSocket gateway, in-memory managers
  shared/          # Cross-layer utilities (Result type, branded IDs, Zod helpers)
```

**TypeScript path aliases** (defined in `tsconfig.json`):
- `@domain/*` → `src/domain/*`
- `@application/*` → `src/application/*`
- `@infrastructure/*` → `src/infrastructure/*`
- `@shared/*` → `src/shared/*`

### Domain layer (`src/domain/`)

Contains all game logic with zero NestJS dependencies:
- `types/` — plain TypeScript types for `Character`, `Room`, `Session`, `GameState`, `Die`, `DieFace`, `Effect`, etc.
- `entities/` — `CharacterEntity` (JSON template shape read from `tmplt/*.json`)
- `services/` — `RoomService`, `SessionService`, `CharacterService`, `CharacterGeneration`, `PriorityQueue`, `Player`, `Position`, `GameInit`
- `factories/` — `EffectFactory`: registry pattern for creating effects by label; effects must be registered before use
- `strategies/` — `SingleTargetDamage/Heal/Shield`; implement per-effect resolution logic

Character templates live in `tmplt/*.json` and are parsed by `CharacterGeneration.service.ts` (`createCharacterFromJsonTemplate`).

### Application layer (`src/application/`)

- `ports/` — interfaces `RoomPort`, `SessionPort`, `WebSocketPort` (tokens in `tokens.ts`)
- `services/` — `RoomCoordinatorService`, `SessionCoordinatorService`: bridge domain services with WebSocket handlers
- `mappers/` — `RoomMapper`: domain `Room` → `RoomDTO`
- `dtos/` — `RoomDTO`, `PlayerDTO`, `GameStateDTO`

### Infrastructure layer (`src/infrastructure/adapters/`)

- `managers/` — `SessionManager`, `RoomManager`: in-memory `Map`-based state stores
- `websocket/session.gateway.ts` — single `@WebSocketGateway()` handling connection/disconnection and events: `createRoom`, `joinRoom`, `quitRoom`
- `websocket/shared.gateway.ts` — `SharedWebSocketService` holds the Socket.io server instance (shared across services)
- `websocket/services/` — `WebSocketService` (emit helpers), `RoomWebSocketHandlerService`, `SessionWebSocketHandlerService`, `ErrorWebSocketHandlerService`

### Shared utilities (`src/shared/`)

- `result.type.ts` — `Result<T, E>` / `ok()` / `err()` / `unwrap()` — use this for domain error handling instead of throwing
- `branded.types.ts` — `SessionId`, `SocketId`, `RoomId`, `PlayerId`, `CharacterId`, `DeviceId` branded string types to prevent ID mix-ups
- `id.utils.ts`, `random.utils.ts`, `zod-helpers.ts`

### Key design rules

1. **Coordinator pattern**: Application-layer coordinators (`RoomCoordinatorService`, `SessionCoordinatorService`) call domain services then dispatch WebSocket events. The gateway calls coordinators, never domain services directly.
2. **Session identity**: `socketId` changes on reconnect; `sessionId` (UUID) + `deviceIdentifier` are persistent. `SessionService.createOrReconnectSession` handles the re-binding.
3. **All game resolution is server-side**: dice rolls, action resolution, priority ordering — the client is display-only.
4. **Priority resolution**: `finalPriority(face) = face.priority + character.baseSpeed`; swap priority = `character.baseSpeed` only.
