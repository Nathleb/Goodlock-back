# Batched Phase Actions Design

**Date:** 2026-06-02  
**Status:** Approved

## Context

The current WebSocket protocol sends one event per player action during KEEP and ASSIGN phases:
- `toggleDieLock { characterId }` fires on every die tap
- `selectTarget { characterId, target }` fires on every target change

Both phases end with a CONFIRM action. The server only needs the final committed selection — intermediate state is noise. The frontend already buffers selections locally (KeepPanel, AssignPanel). This spec collapses each phase to a single batched event sent at confirm time.

## Protocol changes

| Removed event | Replacement |
|---|---|
| `toggleDieLock { characterId }` | _(removed — frontend buffers locally)_ |
| `confirmKeep` _(no payload)_ | `confirmKeep { lockedCharacterIds: string[] }` |
| `selectTarget { characterId, target: { playerIndex, slot } }` | _(removed — frontend buffers locally)_ |
| `confirmAssignment` _(no payload)_ | `confirmAssignment { targets: { characterId: string, target: { playerIndex: number, slot: number } }[] }` |

`cancelKeep` and `cancelAssignment` are unchanged.

## Validation (both events)

Validation is **atomic**: if any entry in the payload is invalid, the whole batch is rejected with an error, nothing is applied, and the player stays un-ready. This follows the authoritative-server model standard in multiplayer games.

**`confirmKeep`**
- Every id in `lockedCharacterIds` must exist in the sending player's team.
- An empty array is valid (no characters locked).
- Characters absent from the list have `isFaceLocked = false`.

**`confirmAssignment`**
- The payload must contain exactly one entry per character (all 5 required).
- Every `characterId` must exist in the sending player's team.
- Every `target.playerIndex` must be 0 or 1.
- Every `target.slot` must be in range 0–4.

## Application layer — GameCoordinatorService

### Removed methods
- `toggleDieLock(socketId, characterId)` — deleted
- `selectTarget(socketId, characterId, rawTarget)` — deleted

### Changed: `confirmKeep(socketId, lockedCharacterIds: string[])`
1. `getContext(socketId)` — get ctx (`room`, `playerIndex`)
2. Validate: every id in `lockedCharacterIds` exists in `player.team`; emit error and return on first failure
3. Apply (SET semantics): rebuild player team with `isFaceLocked = lockedSet.has(char.id)` for each character
4. Build `gsWithLocks` with updated player state
5. Call `this.doConfirm(ctx, gsWithLocks, confirmKeep)` (see below)

### Changed: `confirmAssignment(socketId, targets: { characterId, target }[])`
1. `getContext(socketId)` — get ctx (`room`, `playerIndex`)
2. Validate: payload has 5 entries; every `characterId` in player's team; every `target.playerIndex` in `[0,1]`; every `target.slot` in `[0..4]`; emit error and return on first failure
3. Apply: loop over `targets`, calling `selectTargetOfCharacter(player, char.position.slot, target)` per entry to build updated player
4. Build `gsWithTargets` with updated player state
5. Call `this.doConfirm(ctx, gsWithTargets, domainConfirmAssignment)` (see below)

### Refactored: `doConfirm(ctx, gs, domainFn)`
Replaces the old `confirmAction(socketId, domainFn)`. Receives the full context (`room`, `playerIndex`) and the pre-modified `GameState` as explicit parameters — no internal `getContext` lookup, no `roomPort` read. All subsequent logic (mark ready, reroll or advance phase, emit) operates on the passed-in state.

This is the functional pattern: the helper derives nothing from external sources; it only writes back via `roomPort.updateGameState` and `wsPort`.

## Domain layer

### Removed: `toggleDieLockForCharacter`
Removed from `Player.service.ts`. The concept of "toggle one lock" no longer exists in the production path. The new SET semantics (`isFaceLocked = lockedSet.has(char.id)`) are applied inline in the coordinator.

All domain tests that used `toggleDieLockForCharacter` as a setup helper (`Roll.service.spec.ts`, `GameLoop.service.spec.ts`, `Round.service.spec.ts`) switch to direct state construction:

```typescript
const lockedIds = new Set([player.team[0].id]);
player = { ...player, team: player.team.map(c => ({ ...c, isFaceLocked: lockedIds.has(c.id) })) };
```

`Player.service.spec.ts` drops the `toggleDieLockForCharacter` describe block.

### Unchanged: `selectTargetOfCharacter`
Remains in `Player.service.ts`. Still called per-character in the `confirmAssignment` batch loop and used directly in domain/integration tests.

## Infrastructure layer — session.gateway.ts

- Remove `@SubscribeMessage('toggleDieLock')` handler
- Remove `@SubscribeMessage('selectTarget')` handler
- `@SubscribeMessage('confirmKeep')`: pass `data.lockedCharacterIds` to coordinator
- `@SubscribeMessage('confirmAssignment')`: pass `data.targets` to coordinator

## Test changes — GameCoordinator.service.spec.ts

**Deleted describe blocks:**
- `toggleDieLock` (~10 tests)
- `selectTarget` (~6 tests)
- Post-confirm mutation guards for `toggleDieLock` and `selectTarget`

**Updated describe blocks:**
- `confirmKeep`: update call signatures to pass `lockedCharacterIds`. Add: reject unknown characterId, accept empty array, accept all 5 locked
- `confirmAssignment`: update call signatures to pass `targets`. Add: reject unknown characterId, reject invalid `playerIndex`, reject out-of-bounds slot, reject payload with wrong count, accept full valid payload

## Scope

This change is backend-only. The frontend (Goodlock-frontend) will need matching changes to KeepPanel and AssignPanel to send batched payloads instead of per-tap events, but that is out of scope here.
