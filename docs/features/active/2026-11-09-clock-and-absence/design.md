# Clock and absence — design

Rules implemented (rules reference `../Goodlock-specs/GAME-DESIGN.md`, `META.md`): SEL-1, CLOCK-1, CLOCK-2, CLOCK-3, KEEP-3, KEEP-4, AWAY-1, AWAY-2, AWAY-3, AWAY-4, END-1, END-3, GAME-7 (clocks and presence are public), ROOM-6.

## Gaps closed

- No clock: the code has a claim system instead (`claimVictory`, AFK limit, grace period, sweeper of abandoned rooms). The rules replace it with a per-player clock and a reconnection time, and a loss at 0.
- No concession action: only leaving the room concedes (AWAY-1 also asks for an explicit concession).
- The reason of a win is `elimination | forfeit | afk | concede`; END-3 says dead characters, clock, reconnection time or concession.
- The room outlives the match: ROOM-6 sends both players back to the room browser.

## Model (domain, pure: time is a parameter)

- `PlayerClock = { remainingMs, reconnectionMs, connected }`; `GameState.clocks: [PlayerClock, PlayerClock]` and `GameState.clockUpdatedAt` (epoch ms). Starting values come from `Clock.service` constants (10 min, 3 min, increment 10 s: CLOCK-1). `connected` moves from `Room.presence` into the clocks: AWAY-2 makes presence a matter of the clock, and with the claim system gone nothing else reads `disconnectedAt`.
- A player's clock runs when the phase is Selection, Placement or Keep and they have not confirmed (CLOCK-2, SEL-3, PLACE-3, KEEP-3). Reconnection time runs while `connected` is false, together with the clock when it runs (AWAY-2).
- `settleClocks(gs, now)`: charges the time since `clockUpdatedAt` to what ran, then stamps `now`. Every state change goes through `settleClocks` first, so the accounting uses the state that held during the interval. `setConnected(gs, p, connected, now)` settles, then flips.
- `nextExpiry(gs)` gives the earliest moment a clock or a reconnection time reaches 0, with its player and reason; `expireClocks(gs, now)` settles up to that moment and decides the match: the loser's opponent wins, `endReason` `clock` or `reconnection` (CLOCK-3, AWAY-3). Time out at the same millisecond: player 0 loses (rules silent, flagged to the user).
- `addIncrement(gs)`: +10 s on both clocks when both players have confirmed a Keep (KEEP-4); called by `confirmKeep`.
- `GameState.endReason?: 'elimination' | 'clock' | 'reconnection' | 'concede'` next to `winner` (END-3); `checkMatchEnd` sets `elimination`; `concede(gs, p)` sets `concede` (AWAY-1).
- `createSelectionState(decks, now)` starts the clocks (SEL-1).

## Application

- Port `MatchTimerPort { schedule(roomId, at, onExpire): void; cancel(roomId): void }`; the adapter wraps `setTimeout` (unref'd). `GameCoordinatorService` reschedules from `nextExpiry` after every state change and presence change, and `expire(roomId)` ends the match.
- Every game action starts with `settleClocks`, every emission carries the settled clocks (`GameStateDTO.clocks: [{ remainingMs, reconnectionMs, running, connected }]`; the client counts down from the message it receives).
- `presenceChanged { playerIndex, connected, reconnectionMs }` replaces `{ ..., claimInMs }`.
- `concede` event (AWAY-1); leaving a started match calls the same code.
- After `gameOver` the room is closed: both sessions leave it and the room is deleted (ROOM-6); the sweeper and its interval go away.
- Removed: `claimVictory`, `Claim.service`, `ClaimConfig` and its env variables, `afkClaimInMs`, `phaseStartedAt`, `Room.presence`, `RoomPort.setPresence`, the `CLAIM_NOT_ALLOWED` code.

## Decision: the opponent's clock moves at the end of a decision phase only

CLOCK-2 pauses a clock when its player confirms and GAME-7 shows both clocks, which would reveal a confirmation (GAME-9). The user decided: a player's clock is shown to the opponent only as of the end of each decision phase, never during one. `PlayerClock.publishedMs` holds that value (set by `publishClocks` when a decision phase ends, increment included). In what a player receives, their own clock is live; the opponent's `remainingMs` is the published value and `running` is false; clients count down only their own clock. What both players receive at once carries the published values. The reconnection time and who is connected stay live and public (GAME-7).
