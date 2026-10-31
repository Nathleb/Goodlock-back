# Disconnect/Reconnect Lifecycle — Design

**Status:** implemented 2026-06-11

## Goal

A mobile player who backgrounds the app, loses the network or signs in elsewhere must be able to come back to the same seat in a started game, without the opponent's secret information leaking in the snapshot, and an opponent who never returns (or never confirms) must not leave the game hanging forever.

## Product decisions

| Question | Decision |
|---|---|
| Outcome when a disconnected player never returns | **The opponent chooses**: a *claim victory* option opens after a grace period; the game otherwise waits. |
| Grace period before the claim is available | **60 seconds** (`CLAIM_GRACE_MS`). |
| Scope | **Disconnects and AFK** (connected but never confirming) feed the same claim flow. AFK limit defaults to **120 seconds** per confirmation window (`CLAIM_AFK_LIMIT_MS`). |
| Lobby (non-started rooms) | **Quit on disconnect.** Seats are cheap to re-acquire and the room list stays honest. |
| Second device / duplicate login | **The new connection wins.** The old socket gets `sessionEvicted` and is force-disconnected. |
| Voluntary `quitRoom` mid-game | A **concession**: immediate `gameOver` for the opponent. |

## Architecture decision

Decision: timestamps plus on-demand validation rather than per-game timers. The server stores facts with timestamps (`disconnectedAt`, `phaseStartedAt`) and validates `claimVictory` against the clock when it arrives. Server-side validation is required in any design (clients cannot be trusted), and clients need deadlines for a countdown in any design, so server-driven timers would only add a cancellation matrix (reconnect, confirm, cancel, phase change, game over, room deletion) without changing what users see. Countdowns are sent as remaining milliseconds computed server-side at emit time, so client clock skew is irrelevant.

The only interval in the system is a once-per-minute janitor in `RoomManager` (cleanup, not gameplay timing).

## Design

### Stable identity and room lifecycle

- `Room.playerOrder: [sessionId, sessionId]` is snapshotted in `startRoom` and never changes. `resolvePlayerIndex` (`Room.service.ts`) uses it for started rooms, so a later change to `playersId` can never shift a player's team mapping.
- `SessionCoordinatorService.handleDisconnect`:
  - room not started: quit the room, notify, transfer ownership as needed;
  - room started: keep the player in the room, mark their presence disconnected with `disconnectedAt = now`, emit `presenceChanged` to the room.
- `quitRoom` on a started game (not yet in RESULT) is a concession: the game moves to RESULT, `gameOver { winner: opponentIndex, reason: 'concede' }` goes to the room, and the quitter's presence is marked disconnected so the janitor rule can fire; then room membership changes as usual.
- **Janitor** (`RoomManager.sweepAbandonedRooms`, every 60 s): deletes started rooms where every player has been disconnected for at least 10 minutes.

### Presence and reconnect

- `Room.presence: [PlayerPresence, PlayerPresence]` (`{ connected, disconnectedAt }`), indexed like `playerOrder`, kept by `SessionCoordinatorService` on connect and disconnect of started-room members.
- On every connect the server first sends `sessionStarted { sessionId }` (clients locate their seat in `room.players` with it).
- Reconnect (`handleConnect` with a session that has a started room): mark presence connected, emit `presenceChanged` to the room, then send the reconnector `roomUpdated` and a **viewer-aware snapshot** through `GameStateMapper.toDTOForViewer(gs, viewerIndex)`:
  - SELECTION: both revealed decks and only the viewer's own pick;
  - PLACEMENT: the opponent's team sent as `[]`;
  - KEEP with the opponent already confirmed: the opponent's `isFaceLocked` masked (their fresh lock choices stay private until the reroll broadcast);
  - the snapshot carries `afkClaimInMs`.
- **Eviction:** `SessionManager.createOrReconnectSession` reports the previous socket as `evictedSocketId`; the coordinator emits `sessionEvicted { reason: 'signed-in-elsewhere' }` to it and force-disconnects it. The disconnect event of an evicted socket then finds no session for it and changes nothing, which removes the fast/slow reconnect race.

### Claim victory

Pure domain function in `Claim.service.ts`:

```
evaluateClaim(gs, claimantIndex, opponentPresence, phaseStartedAt, now, config)
  -> { valid: true, reason: 'forfeit' | 'afk' } | { valid: false, error }
```

A game already in RESULT is rejected. Otherwise, first match wins:

- **forfeit**: the opponent is disconnected and `now - disconnectedAt >= graceMs`.
- **afk**: the phase is one where players confirm (SELECTION, PLACEMENT, KEEP), the claimant is ready, the opponent is not, and `now - phaseStartedAt >= afkLimitMs`.

Supporting pieces:

- `phaseStartedAt` is stamped in exactly one place: `RoomManager.updateGameState` sets it when `gameState.phase` or `gameState.rollsLeft` changed (also set by `startGame`). The `rollsLeft` clause covers KEEP rerolls, which start a new confirmation window without leaving KEEP.
- `claimVictory` (no payload) -> `GameCoordinatorService.claimVictory` runs `evaluateClaim` against the opponent's presence. Valid: the game moves to RESULT and `gameOver { winner, reason }` goes to the room. Invalid: the standard `error` event.
- Elimination also emits `gameOver { winner, reason: 'elimination' }` so the contract is uniform; `winner` is `0`, `1` or `'draw'`.
- `computeAfkClaimInMs` produces the AFK countdown. The forfeit countdown in `presenceChanged` is `graceMs` itself: it is sent at the moment of the disconnect.
- Config from env, validated at boot (`src/infrastructure/config/claim.config.ts`): `CLAIM_GRACE_MS` (60000) and `CLAIM_AFK_LIMIT_MS` (120000), injected as `CLAIM_CONFIG`.

### WebSocket contract

| Event | Direction | Payload |
|---|---|---|
| `sessionStarted` | server -> socket | `{ sessionId }` |
| `presenceChanged` | server -> room | `{ playerIndex, connected, claimInMs: number \| null }` (`claimInMs` = remaining grace when disconnected, `null` when connected) |
| `sessionEvicted` | server -> old socket | `{ reason: 'signed-in-elsewhere' }`, followed by a forced disconnect |
| `gameStateUpdated` | server -> room/socket | the state DTO plus `afkClaimInMs: number \| null` (remaining AFK window for the non-ready player, computed at emit time) |
| `claimVictory` | client -> server | none |
| `gameOver` | server -> room | `{ winner: 0 \| 1 \| 'draw', reason: 'elimination' \| 'forfeit' \| 'afk' \| 'concede' }` |

## Error handling and tests

All decision logic is pure and takes `now` as a parameter, so specs use a fixed clock and no fake timers (the janitor sweep is called directly with a `now`).

- Domain: `evaluateClaim` (every ground, the boundary at exactly the grace and AFK limits, RESULT rejected), presence transitions, `playerOrder` resolution.
- Application: disconnect on a started room versus a lobby room, reconnect snapshot masking per phase, eviction not corrupting presence, claim accepted or rejected per ground, concession on mid-game quit, janitor sweep.
- Infrastructure: gateway wiring for `claimVictory` and the eviction kick.

## Out of scope

- Rematch or room reuse after `gameOver` (room disposal stays as is plus the janitor).
- A dedicated opponent-readiness indicator (deliberately not sent: see the cancel-confirm spec).
