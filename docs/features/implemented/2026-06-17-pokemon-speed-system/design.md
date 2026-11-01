# Pokemon-style Speed System — Design

**Status:** implemented 2026-06-17

## Model

Resolution order comes from independent keys, never summed (the bracket, the SPEED state, the base speed):

- A face's **priority** (`DieFace.priority`) is a small integer **bracket**, authored by hand on each face (a `+2` attack and a `-1` heavy attack are both legal).
- A character's **speed** (`baseSpeed`) orders actions **within** a bracket. Speed never crosses brackets.

Resolution order: bracket descending, then the SPEED state (hasted, neutral, slowed), then speed descending. Entries with equal `(bracket, SPEED state, speed)` go to the player holding the initiative token, then by slot ascending (see the initiative spec). So a `+1` face always resolves before any `0` face regardless of speed; two `0` faces resolve fastest first.

Decision: two independent axes rather than `priority + baseSpeed` on one number, because a slow character on a high-priority face must not outrun a fast character on a low-priority face merely because the numbers add up; the bracket expresses "this move goes first", the speed expresses "this character is quick".

Decision: the initiative token (drawn at init, flipped each round) rather than a random tiebreak among equal `(bracket, speed)`, because it stays fair over a match while keeping the resolution exactly predictable for the client preview. Inside one team, ties go by slot ascending.

Negative and arbitrary integer brackets are naturally supported (the queue is not index-based, so there is no bound to guard).

## Engine

`src/domain/services/PriorityQueue.service.ts`:

- `PriorityQueue` is a flat `readonly QueueEntry[]`; `QueueEntry = [DieFace, actorId, actorSpeed]`, so each entry is self-contained for sorting. `createPriorityQueue()` takes no argument.
- `addAllEffectsToPriorityQueue` queues every character's current face with its `baseSpeed`.
- `unstackPriorityQueueWithLog` consumes each entry once. Before every step it sorts the entries that have not played yet with a pure sort: `priority` desc, the SPEED state (hasted, neutral, slowed), `speed` desc, the actors of `GameState.initiativePlayerIndex` first, then `position.slot` asc. The initiative and slot keys are captured when RESOLVE starts; only the SPEED state is read live, so a HASTE or SLOW landing mid-round reorders the rest (inside a bracket only) while hp, shield and positions never do. No random call.
- Each entry is then resolved in order: a dead actor is skipped (and logged as skipped), otherwise each effect's cells are resolved from the actor's current position and applied (see the auto-targeting spec).

The `ResolveStep` log shape does not depend on the ordering model, so DTOs, the gateway and the client are unaffected by it.

## Templates

`tmplt/*.json` carry placeholder values, not balanced ones: face `priority` is a small bracket (damage faces at `0`, support and movement faces at `+1` by default, varied a little per character so the ordering is exercised), and `baseSpeed` is spread widely enough that within-bracket order is decisive and distinct between characters. Movement (`Swap`) shares the `+1` bracket with shield and heal and only beats attacks.

The template integrity spec (`tests/templates.spec.ts`) is the only bar: every template parses, every face `priority` is a small integer within a sane range, and every `baseSpeed` is widened.

## Tests

- `PriorityQueue.service.spec`: a higher bracket resolves before a lower one regardless of speed; within a bracket higher speed goes first; equal bracket and speed resolve in a deterministic order, the initiative holder first, then by slot (see the initiative spec); negative brackets resolve last; a dead actor is skipped.
- `templates.spec`: bracket and speed ranges for every template.
