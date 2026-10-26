# Batched Phase Actions Design

**Status:** implemented 2026-06-02

## Principle

A phase input is sent once, as a single batched event at confirm time. The client buffers its choices locally; the server only needs the final committed selection, because intermediate taps are noise. There is no per-tap event (no `toggleDieLock`, no target selection).

## Protocol

| Phase | Client -> server | Payload |
|---|---|---|
| SELECTION | `confirmSelection` | `{ characterIds: string[] }`: the catalog ids kept from the player's own deck |
| PLACEMENT | `rearrangeTeam` (as often as wanted), then `confirmPlacement` | `{ slots: (string \| null)[] }`, no payload for the confirm |
| KEEP | `confirmKeep` | `{ lockedCharacterIds: string[] }`: the characters whose face stays locked for the next reroll |

Each confirm has a `cancel*` counterpart without payload (see the cancel-confirm spec).

## Validation

Validation is **atomic**: if anything in the payload is invalid, the whole batch is rejected with an `error`, nothing is applied, and the player stays un-ready. This is the authoritative-server model: the client is never trusted.

- `confirmKeep`: every id must belong to the sending player's team. An empty array is valid (nothing locked). Characters absent from the list end up with `isFaceLocked = false`: the payload **sets** the lock state, it does not toggle it.
- `confirmSelection`: exactly `TEAM_SIZE` ids, no duplicates, all from the player's own deck (checked in the domain, `GameLoop.service.ts`).
- `rearrangeTeam`: validated by `placeTeam` (`BOARD_SIZE` cells, each team character exactly once, the rest `null`).

The gateway payload classes (`src/infrastructure/adapters/websocket/payloads/`) check the shape with class-validator; the semantic checks above live in the domain and the coordinator.

## Application layer

`GameCoordinatorService.confirmKeep(socketId, lockedCharacterIds)`:

1. Resolve the context (session, room, player index).
2. Reject any id that is not on the player's team.
3. Rebuild the player's team with `isFaceLocked = lockedSet.has(char.id)`.
4. Hand the resulting state to `doConfirm(socketId, ctx, gs, domainFn)`.

`doConfirm` receives the context and the pre-modified `GameState` as explicit parameters and derives nothing from outside: it runs the domain function (mark ready; when both are ready, reroll or advance), persists through `roomPort.updateGameState`, and emits. When the last confirm lands the game in RESOLVE, it resolves the round immediately.

## Domain

There is no "toggle one lock" in the production path: lock state is set from the batch inline in the coordinator, and domain tests build locked teams by constructing state directly.

## Frontend

The client holds the buffered choices (locks, layout, picks) and sends them at confirm time.
