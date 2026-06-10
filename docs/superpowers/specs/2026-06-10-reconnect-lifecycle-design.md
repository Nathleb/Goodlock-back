# Disconnect/Reconnect Lifecycle — Design

**Date:** 2026-06-10
**Status:** Approved by Lebi (design review in session)

## Problem

The 2026-06-10 deep review found that the session/room/disconnect lifecycle is the
biggest pre-v1.0 risk, especially for mobile (app backgrounding + polling transport):

1. `SessionCoordinator.handleDisconnect` calls `quitRoom` unconditionally, even for
   started games. A slow reconnect (after the socket.io ping timeout) is locked out
   forever because `addPlayerToRoom` throws `Game already started`. Fast reconnects
   only survive by a race: the new connection evicts the old socketId before the old
   socket's disconnect event fires.
2. The remaining player's `playerIndex` is derived from `room.playersId.indexOf(...)`;
   when the other player is removed mid-game, the survivor's index shifts and maps to
   the wrong `gameState.players` team.
3. `handleConnect` emits the full `GameStateMapper.toDTO` on reconnect, regardless of
   phase — leaking the opponent's true placement during PLACEMENT and their persisted
   targets after a first ASSIGN confirm.
4. `SessionManager.createOrReconnectSession` evicts the old socket mapping but never
   disconnects the socket; the ghost stays in the socket.io room and keeps receiving
   game broadcasts.
5. A disconnected (or AFK) opponent leaves the game hanging forever; there is no
   forfeit path.

## Decisions (product)

| Question | Decision |
|---|---|
| Outcome when a disconnected player never returns | **Opponent chooses**: a *Claim victory* option appears after the grace period; the game otherwise waits. |
| Grace period before the claim is available | **60 seconds** (env-configurable). |
| Scope | **Disconnects and AFK** (connected but never confirming) both feed the same claim flow. AFK limit defaults to **120 seconds** per phase (env-configurable). |
| Lobby (non-started rooms) | **Keep quit-on-disconnect.** Seats are cheap to re-acquire; the room list stays honest. |
| Second device / duplicate login | **New connection wins.** Old socket gets `sessionEvicted` and is force-disconnected. |
| Voluntary `quitRoom` mid-game | Counts as a **concession**: immediate `gameOver` for the opponent. |

## Decision (architecture)

**Timestamps + on-demand validation** (Approach A). The server stores facts with
timestamps (`disconnectedAt`, `phaseStartedAt`) and validates `claimVictory` requests
against the clock when they arrive. No per-game `setTimeout` registry: server-side
validation is required in any design (clients can't be trusted), and clients need the
deadline timestamps for countdown UI in any design, so server-driven timers would add
a cancellation matrix (reconnect, confirm, cancel, phase change, game over, room
deletion) without changing user-facing behavior. Countdown values are sent as
`remainingMs` computed server-side at emit time, so client clock skew is irrelevant.

The only interval in the system is a global once-per-minute janitor (cleanup, not
gameplay timing).

## Design

### 1. Stable identity & room lifecycle

- `Room` gains `playerOrder: readonly [string, string]` (sessionIds), snapshotted in
  `startRoom` and immutable afterwards.
- `GameCoordinator.getContext` resolves `playerIndex` from `playerOrder` for started
  rooms. `playersId` mutations can no longer shift team mappings.
- `SessionCoordinator.handleDisconnect` branches:
  - room not started → current behavior (quit room, notify, owner transfer);
  - room started → keep the player in the room, mark presence disconnected with
    `disconnectedAt = now`, emit `presenceChanged` to the room.
- `quitRoom` on a started game = concession: emit
  `gameOver { winner: opponentIndex, reason: 'concede' }`, mark the quitter's
  presence as disconnected (so the janitor's "all players disconnected" rule can
  fire), then proceed with room membership changes as today.
- **Janitor:** one global `setInterval` (every 60s) deletes rooms where every player
  has been disconnected ≥ 10 minutes. This replaces the implicit cleanup that
  quit-on-disconnect used to provide for started rooms.

### 2. Presence & reconnect

- `Room` gains `presence: readonly [PlayerPresence, PlayerPresence]` indexed like
  `playerOrder`, where `PlayerPresence = { connected: boolean; disconnectedAt: number | null }`.
  Maintained by `SessionCoordinator` on connect/disconnect of started-room members.
- Reconnect (`handleConnect`, session has a started room):
  1. mark presence connected, clear `disconnectedAt`;
  2. emit `presenceChanged` to the room;
  3. send the reconnector a **viewer-aware snapshot** (new
     `GameStateMapper.toDTOForViewer(gs, viewerIndex)`):
     - PLACEMENT → existing `toDTOForPlacement` masking;
     - all phases → opponent `target` nulled;
     - KEEP, opponent already confirmed → opponent `isFaceLocked` masked (their fresh
       lock choices are private until the reroll broadcast).
- **Eviction:** `createOrReconnectSession` eviction now also emits `sessionEvicted`
  to the old socket and force-disconnects it server-side. The subsequent disconnect
  event for an evicted socket is a no-op for presence (it is an eviction, not a real
  drop) — this removes the fast/slow reconnect race entirely.

### 3. Claim victory

New pure domain function:

```
evaluateClaim(gs, claimantIndex, opponentPresence, phaseStartedAt, now, config)
  → { valid: true, reason: 'forfeit' | 'afk' } | { valid: false, error: string }
```

Valid grounds (first match wins):

- **forfeit** — opponent disconnected and `now − disconnectedAt ≥ config.graceMs`
  (default 60 000).
- **afk** — `gs.phase ∈ {PLACEMENT, KEEP, ASSIGN}`, claimant is ready, opponent is
  not ready, and `now − phaseStartedAt ≥ config.afkLimitMs` (default 120 000).

Supporting changes:

- `phaseStartedAt` is stamped in exactly one place: `RoomManager.updateGameState`
  sets `room.phaseStartedAt = now` when `gameState.phase` **or** `gameState.rollsLeft`
  changed (also set by `startGame`). The `rollsLeft` clause covers KEEP rerolls, which
  start a new confirmation sub-round without leaving the KEEP phase. No domain
  signature changes.
- New WS event `claimVictory` (no payload) → `GameCoordinator.claimVictory` runs
  `evaluateClaim`; valid → `gameOver { winner, reason }`; invalid → standard `error`
  emit.
- The existing elimination win path emits `gameOver { winner, reason: 'elimination' }`
  so the contract is uniform. `checkWinner`'s `'draw'` outcome keeps its current shape
  with `reason: 'elimination'`.
- Config from env: `CLAIM_GRACE_MS` (60000), `CLAIM_AFK_LIMIT_MS` (120000), validated
  at boot.

### 4. WebSocket contract changes

| Event | Direction | Payload |
|---|---|---|
| `presenceChanged` | server → room | `{ playerIndex, connected, claimInMs: number \| null }` (`claimInMs` = remaining grace, computed at emit) |
| `sessionEvicted` | server → old socket | `{ reason: 'signed-in-elsewhere' }`, followed by forced disconnect |
| `gameStateUpdated` | server → room/socket | existing DTO + `afkClaimInMs: number \| null` (remaining AFK window for the non-ready player, computed at emit; null when not applicable) |
| `claimVictory` | client → server | none |
| `gameOver` | server → room | `{ winner, reason: 'elimination' \| 'forfeit' \| 'afk' \| 'concede' }` (existing event, `reason` added) |

Reconnect snapshot reuses `gameStateUpdated` with the viewer-aware DTO.

### 5. Error handling & testing

- All new decision logic is pure and takes `now` as a parameter: domain specs use a
  fixed clock; no fake timers anywhere except (optionally) the janitor.
- TDD bottom-up per house workflow:
  1. domain — `evaluateClaim` (every ground, boundary at exactly grace/AFK limit,
     dead phases like RESOLVE/RESULT rejected), presence transitions, `playerOrder`
     resolution;
  2. application — coordinator specs: disconnect on started vs lobby room, reconnect
     snapshot masking per phase, eviction disconnect not corrupting presence, claim
     accepted/rejected per ground, concede on mid-game quit, janitor sweep;
  3. infrastructure — gateway wiring for `claimVictory`, eviction kick.

### Out of scope

- Rematch / room reuse after `gameOver` (room disposal stays as today + janitor).
- Opponent readiness indicator UI — but `presenceChanged` and the snapshot make it
  nearly free afterwards.
- Frontend implementation (separate repo): listen to `presenceChanged`,
  `sessionEvicted`, `gameOver.reason`; render countdowns from `claimInMs` /
  `afkClaimInMs`; send `claimVictory`.
