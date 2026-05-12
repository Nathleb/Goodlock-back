# Session Security & Action Legality

**Date:** 2026-05-12
**Status:** Approved

## Problem

Three enforcement gaps exist in the current WebSocket backend:

1. `getContext()` silently drops requests when session/room/game context is missing — the client receives no feedback.
2. A player who has already confirmed a phase (`playersReady[i] = true`) can call confirm handlers again, mutating game state twice.
3. A player who has confirmed a phase can still call mutation handlers for that phase (e.g. `rearrangeTeam` after `confirmPlacement`).

Authentication is already handled: `handleConnection` disconnects sockets without `deviceIdentifier`, and `getContext()` maps socketId → sessionId → playerIndex. Phase guards (`assertPhase`) and character ownership checks also exist. This spec addresses only the remaining gaps.

## Design

### Layer 1 — Infrastructure: `SessionGuard`

**File:** `src/infrastructure/adapters/websocket/guards/Session.guard.ts`

A NestJS `CanActivate` guard applied to the gateway class via `@UseGuards(SessionGuard)`. It covers all `@SubscribeMessage()` handlers.

**Behaviour:**
- Extracts `socketId` from `context.switchToWs().getClient<Socket>().id`
- Calls `sessionPort.getSession(socketId)`
- If session is `null`: emits `error` event `{ message: 'Not connected' }` to the socket and returns `false`
- If session exists: returns `true`

**Note:** Since `handleConnection` always creates a session for authenticated sockets, this guard fires only in edge cases (implementation bugs, race conditions). It is defense-in-depth, not the primary auth mechanism.

**Injection:** The guard needs `SessionPort`. It uses `Inject(SESSION_PORT)` via the NestJS DI system (declared as an injectable service or constructed via `ModuleRef`).

### Layer 2 — Application: Generic error on missing game context

**File:** `src/application/services/GameCoordinator.service.ts`

All six callers of `getContext()` currently do:
```ts
const ctx = this.getContext(socketId);
if (!ctx) return;
```

Change to:
```ts
const ctx = this.getContext(socketId);
if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
```

The same generic message covers all failure cases (no session, no roomId, no room, no gameState, not in room). No internal state is exposed.

### Layer 3 — Domain: `assertNotReady`

**File:** `src/domain/services/Phase.service.ts`

New pure function added alongside the existing `assertPhase`:

```ts
export function assertNotReady(gs: GameState, playerIndex: PlayerIndex): void {
    if (gs.playersReady[playerIndex]) throw new Error('Player has already confirmed');
}
```

**Call sites:**

| Location | Handler | Purpose |
|---|---|---|
| `GameLoop.service.ts` | `confirmPlacement` | Prevent double-confirm |
| `GameLoop.service.ts` | `confirmKeep` | Prevent double-confirm |
| `GameLoop.service.ts` | `confirmAssignment` | Prevent double-confirm |
| `GameCoordinator.service.ts` | `rearrangeTeam` | Prevent post-confirm mutation |
| `GameCoordinator.service.ts` | `toggleDieLock` | Prevent post-confirm mutation |
| `GameCoordinator.service.ts` | `selectTarget` | Prevent post-confirm mutation |

The coordinator calls `assertNotReady` inside the existing `try/catch` block, so thrown errors are automatically forwarded to the client as `error` events via `emitError`.

## What this does NOT change

- Dead characters can still be targeted (resolution layer ignores dead targets).
- No new phases, no new events, no new DTOs.
- Character ownership checks and `assertPhase` guards are unchanged.

## Test coverage

- `SessionGuard`: unit test — guard returns false and emits error when session is null.
- `getContext` error path: one test per coordinator method verifying `error` is emitted instead of silently dropping.
- `assertNotReady`: unit test in `Phase.service.spec.ts` — throws when ready, passes when not ready.
- Double-confirm: test that a second `confirmPlacement`/`confirmKeep`/`confirmAssignment` call emits `error`.
- Post-confirm mutation: test that `rearrangeTeam` after `confirmPlacement` emits `error`.
