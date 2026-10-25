# Cancel confirmation and secret single-confirm

**Status:** implemented 2026-05-12

## Goal

A player who confirmed a phase (`playersReady[i] = true`) can take the confirmation back, and a lone confirmation is never revealed to the opponent. The opponent learns that someone confirmed only when the phase actually advances.

## Behavior

### Cancel

Three client events undo a confirmation: `cancelSelection`, `cancelPlacement`, `cancelKeep` (no payload). Each is the mirror of the matching confirm.

- Domain (`src/domain/services/GameLoop.service.ts`): `cancelSelection`, `cancelPlacement`, `cancelKeep` are pure functions. They assert the phase (throw outside it), return the **same state reference** when the player was not ready (a no-op), and otherwise clear `playersReady[i]`. `cancelSelection` also clears that player's stored pick.
- Application (`GameCoordinatorService`): the coordinator saves the state only when the domain returned a new reference, and reports a thrown phase error to the caller with an `error` event.
- Only the canceller is told. `cancelSelection` and `cancelPlacement` echo the canceller's own per-viewer state back to their socket (the client is controlled by that state and must see `playersReady[self] = false`). `cancelKeep` emits nothing. The opponent is never notified of a cancel.

### Single confirm

When the first player confirms, the room is not notified. The confirmer's own socket receives their own view of the state (opponent data masked, `GameStateMapper.toDTOForViewer` / `toDTOForPlacement`) so the client learns `playersReady[self] = true` and can show a waiting state. When the second player confirms, the phase advances and the new state is broadcast to the whole room (`gameStateUpdated`, or `roundResolved` when the last KEEP confirm triggers resolution).

Decision: confirmations stay secret until the phase advances, rather than broadcasting a "player X is ready" signal, because a visible ready flag leaks timing information and lets the opponent pressure or react to it. A deliberate readiness indicator, if ever wanted, would be its own lightweight event.

A player who has already confirmed cannot confirm again nor change the phase's input (see the session-security-action-legality spec).

## Tests

Domain specs cover each cancel function (clears the flag, no-op reference when not ready, throws outside its phase). Coordinator specs cover the cancel methods (state saved or not, echo to the canceller only, error outside the phase) and that a first confirm does not reach the room.
