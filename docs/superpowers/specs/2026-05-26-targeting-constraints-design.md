# Targeting Constraints Design

**Date:** 2026-05-26  
**Status:** Approved

## Problem

Targeting rules (e.g. "only ally team") are currently duplicated as ad-hoc guards inside individual effect strategies (`target.playerIndex !== actorPlayerIndex`). This is fragile, inconsistent, and invisible to the client.

## Design

### Constraint enum

New file: `src/domain/types/TargetConstraint.type.ts`

```ts
enum TargetConstraint {
    NONE       = "NONE",        // face needs no player-chosen target
    ALLY_ONLY  = "ALLY_ONLY",   // must target own team
    ENEMY_ONLY = "ENEMY_ONLY",  // must target opponent team
    ANY        = "ANY",         // any valid position
}
```

### DieFace

`src/domain/types/DieFace.type.ts` gains:

```ts
targetConstraint: TargetConstraint;
```

### FaceTemplate

`src/domain/types/BaseDieInstructions.type.ts` — `FaceTemplate` gains the same field. `CharacterGeneration.service.ts` carries it through when building the runtime `DieFace`.

### JSON templates

Each face object in `tmplt/*.json` gains a `"targetConstraint"` key (one of the four enum values).

### Validator utility

New file: `src/domain/services/TargetValidator.ts`

```ts
function validateTarget(
    constraint: TargetConstraint,
    actorPlayerIndex: PlayerIndex,
    target: Position | null,
): Result<void, string>
```

Rules:
- `NONE`       → ok (target is null, ignored)
- `ALLY_ONLY`  → err if `target === null || target.playerIndex !== actorPlayerIndex`
- `ENEMY_ONLY` → err if `target === null || target.playerIndex === actorPlayerIndex`
- `ANY`        → err if `target === null`

### Resolution pipeline

Before iterating `face.effects` and calling `solve()`, the pipeline calls `validateTarget`. On `err`, resolution aborts for that face and the error propagates to the coordinator, which emits a WebSocket error event to the offending client. On `ok`, `solve()` is called with a guaranteed valid target.

### Strategy cleanup

All manual `playerIndex` guards are removed from strategies (e.g. `SwapAlly`). Strategies trust the pipeline has already validated the target.

### DTO

`targetConstraint` is added to the face shape in `GameStateDTO`. The client receives it per face and uses it to restrict selectable slots during ASSIGN phase. The server remains the authoritative enforcer.

## Scope

Files affected:
1. `src/domain/types/TargetConstraint.type.ts` — new
2. `src/domain/types/DieFace.type.ts` — add field
3. `src/domain/types/BaseDieInstructions.type.ts` — add field to `FaceTemplate`
4. `src/domain/services/CharacterGeneration.service.ts` — carry field through
5. `src/domain/services/TargetValidator.ts` — new
6. Resolution pipeline (GameCoordinator or equivalent) — call validator
7. `src/domain/strategies/Swap.class.ts` — remove manual guard
8. `tmplt/*.json` — add `targetConstraint` per face
9. `src/application/dtos/` — add field to face DTO

## Out of scope

- Slot-range constraints (e.g. "only slots 0–2") — future extension
- `SELF_ONLY` — self-targeting effects use `actorId` directly, no player selection needed
