# Session Security & Action Legality

**Status:** implemented 2026-05-12

## Goal

Three guarantees on the WebSocket path:

1. A request that arrives without a usable session, room or game never disappears silently: the client gets an `error { code, message }` (`NOT_CONNECTED` or `ACTION_NOT_AVAILABLE`, see the Result-based error handling spec).
2. A player who already confirmed a phase (`playersReady[i] = true`) cannot confirm it again.
3. A player who already confirmed cannot change that phase's input afterwards (e.g. `rearrangeTeam` after `confirmPlacement`).

Authentication itself is separate: `handleConnection` disconnects sockets without a valid JWT, and the coordinator maps `socketId` -> session -> player index. Phase guards (`checkPhase`) and character ownership checks are unchanged by this feature.

## Design

### Infrastructure: `SessionGuard`

`src/infrastructure/adapters/websocket/guards/Session.guard.ts`. A `CanActivate` guard applied to the gateway class with `@UseGuards(SessionGuard)`, so it covers every `@SubscribeMessage()` handler.

- Looks up the session by the client's socket id through `SessionPort`.
- No session: throws `WsException({ code: 'NOT_CONNECTED', message: 'Not connected' })`; the gateway's `WsErrorFilter` is the only emitter of the resulting `error` event.
- Session present: returns `true`.

Since `handleConnection` always creates a session for an authenticated socket, this fires only in edge cases (a race, a bug). It is defense in depth, not the primary auth mechanism.

### Application: one generic error for missing game context

`GameCoordinatorService.getContext(socketId)` returns an `ACTION_NOT_AVAILABLE` error when there is no session, no room id, no room, no game state, or the session is not a player of the room. Every game action treats it the same way:

```ts
const context = this.getContext(socketId);
if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
```

The message is deliberately the same for every cause, so no internal state is exposed.

### Domain: `checkNotReady`

`src/domain/services/Phase.service.ts` exports `checkNotReady(gs, playerIndex)`, which returns an `ALREADY_CONFIRMED` error (`'Player has already confirmed'`) when `gs.playersReady[playerIndex]` is true.

| Where | Action | Purpose |
|---|---|---|
| `GameLoop.service.ts` `confirmSelection` | confirm the kept 4 | no double confirm |
| `GameLoop.service.ts` `confirmPlacement` | confirm the layout | no double confirm |
| `GameLoop.service.ts` `confirmKeep` | confirm the locks | no double confirm |
| `GameCoordinator.service.ts` `rearrangeTeam` | change the layout | no change after confirm |

The coordinator reports a failed check to the client as an `error { code, message }` event through `emitFailure`. To change something after confirming, the player first cancels the confirmation (see the cancel-confirm spec).

## What this does not change

- Dead characters can still be targeted.
- No new phases, events or DTOs.
- Character ownership checks and `checkPhase` guards.

## Tests

- `SessionGuard`: returns `true` with a session; throws the `NOT_CONNECTED` `WsException` without one (and does not emit: one `error` event reaches the client, checked on a real socket).
- Coordinator: each game action emits `error` instead of dropping the request when the game context is missing.
- `Phase.service.spec.ts`: `checkNotReady` returns an `ALREADY_CONFIRMED` error when ready, the state when not.
- Double confirm: a second `confirmSelection` / `confirmPlacement` / `confirmKeep` is rejected; `rearrangeTeam` after `confirmPlacement` is rejected.
