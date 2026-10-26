# Session Security & Action Legality

**Status:** implemented 2026-05-12

## Goal

Three guarantees on the WebSocket path:

1. A request that arrives without a usable session, room or game never disappears silently: the client gets an `error`.
2. A player who already confirmed a phase (`playersReady[i] = true`) cannot confirm it again.
3. A player who already confirmed cannot change that phase's input afterwards (e.g. `rearrangeTeam` after `confirmPlacement`).

Authentication itself is separate: `handleConnection` disconnects sockets without a valid JWT, and the coordinator maps `socketId` -> session -> player index. Phase guards (`assertPhase`) and character ownership checks are unchanged by this feature.

## Design

### Infrastructure: `SessionGuard`

`src/infrastructure/adapters/websocket/guards/Session.guard.ts`. A `CanActivate` guard applied to the gateway class with `@UseGuards(SessionGuard)`, so it covers every `@SubscribeMessage()` handler.

- Looks up the session by the client's socket id through `SessionPort`.
- No session: emits `error { message: 'Not connected' }` to that socket and returns `false`.
- Session present: returns `true`.

Since `handleConnection` always creates a session for an authenticated socket, this fires only in edge cases (a race, a bug). It is defense in depth, not the primary auth mechanism.

### Application: one generic error for missing game context

`GameCoordinatorService.getContext(socketId)` returns `null` when there is no session, no room id, no room, no game state, or the session is not a player of the room. Every game action treats `null` the same way:

```ts
const ctx = this.getContext(socketId);
if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
```

The message is deliberately the same for every cause, so no internal state is exposed.

### Domain: `assertNotReady`

`src/domain/services/Phase.service.ts` exports `assertNotReady(gs, playerIndex)`, which throws `'Player has already confirmed'` when `gs.playersReady[playerIndex]` is true.

| Where | Action | Purpose |
|---|---|---|
| `GameLoop.service.ts` `confirmSelection` | confirm the kept 4 | no double confirm |
| `GameLoop.service.ts` `confirmPlacement` | confirm the layout | no double confirm |
| `GameLoop.service.ts` `confirmKeep` | confirm the locks | no double confirm |
| `GameCoordinator.service.ts` `rearrangeTeam` | change the layout | no change after confirm |

The coordinator calls these inside its existing `try/catch`, so a thrown error reaches the client as an `error` event through `emitError`. To change something after confirming, the player first cancels the confirmation (see the cancel-confirm spec).

## What this does not change

- Dead characters can still be targeted.
- No new phases, events or DTOs.
- Character ownership checks and `assertPhase` guards.

## Tests

- `SessionGuard`: returns `true` with a session; returns `false` and emits `error` without one.
- Coordinator: each game action emits `error` instead of dropping the request when the game context is missing.
- `Phase.service.spec.ts`: `assertNotReady` throws when ready, passes when not.
- Double confirm: a second `confirmSelection` / `confirmPlacement` / `confirmKeep` is rejected; `rearrangeTeam` after `confirmPlacement` is rejected.
