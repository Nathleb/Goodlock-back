# Auto-targeting: no ASSIGN phase — design

**Status:** implemented 2026-09-22

## Goal

Players do not choose targets. Every die face carries predefined target cells in its template, and the server computes them at the moment each effect resolves. There is no ASSIGN phase and no target-related client event.

## Decisions

- Decision: targets are **cells (positions)**, never characters, because characters move (Swap) and the design targets board positions.
- Decision: targets are computed **at resolution time of each effect**, from the actor's **current** position, rather than frozen at the start of RESOLVE, because movement must keep its tactical weight.
- Decision: each **effect** (not face) carries its own targets, because one face can mix targets (e.g. "Sacrifice 3 HP to deal 9": self + enemy).
- Decision: an effect's targets are a **list of groups**; each group has a side, a mode (**absolute**: fixed slots; **relative**: offsets from the actor's slot) and an array of numbers. One effect can mix sides and modes (e.g. `[ENEMY ABS 0 1 2, ALLY REL 0]`). Patterns (single, cleave, full team, split, one-of-each-team) are just recognisable cell sets, not types.
- Decision: numbers are a JSON **array** (`[-1, 0, 1]`) rather than a concatenated string (`"-101"`), because relative offsets are negative and concatenation becomes ambiguous; arrays need no parser.
- Decision: a relative cell outside the board (slot < 0 or >= `BOARD_SIZE`) is **dropped**; an effect with no remaining cell **fizzles** (no-op).
- Decision: a cell reached several times by one effect is **hit once per occurrence** rather than deduplicated, because overlapping patterns stacking is part of the game.
- Decision: conditional targeting ("weakest enemy") is **out of scope**: it targets characters, not cells.
- Decision: the effect strategies are **generic effects, `Damage`, `FixedDamage`, `Heal`, `Shield`, `Swap`**, because the "who" lives in `targets`; only the "what" remains in the effect.

## 1. Domain model

```ts
// src/domain/types/TargetGroup.type.ts
type Side = 'ALLY' | 'ENEMY';           // relative to the acting character's team
type TargetMode = 'ABSOLUTE' | 'RELATIVE';

type TargetGroup = {
    readonly side: Side;
    readonly mode: TargetMode;
    readonly n: readonly number[];       // ABSOLUTE: slots 0..4, RELATIVE: offsets -4..4
};
```

`EffectLabel` is `Damage | FixedDamage | Heal | Shield | Swap`. A `DieFace` is `{ priority, description, effects: FaceEffect[] }`, and each `FaceEffect` is `{ label, magnitude, targets: TargetGroup[], impl }` where `impl` is the strategy registered for the label in `EffectFactory` (`magnitude` is ignored by `Swap`). The strategy interface is `solve(gs, targets: readonly Position[], actorId) -> { state, affected }`.

Board convention: `ENEMY` relative offset `0` is the enemy in the same slot index as the actor ("the one facing me"). `BOARD_SIZE` is 5 cells per side; the team has fewer characters than cells, so some cells are empty (see below).

Template JSON example, "Sacrifice 3 HP to deal 9 to the first three enemies":

```json
"effects": [
  { "effect": "FixedDamage", "magnitude": 3, "targets": [{ "side": "ALLY",  "mode": "RELATIVE", "n": [0] }] },
  { "effect": "Damage", "magnitude": 9, "targets": [{ "side": "ENEMY", "mode": "ABSOLUTE", "n": [0, 1, 2] }] }
]
```

Mixed example, one effect hitting enemies 0-2 and the actor itself:

```json
"targets": [
  { "side": "ENEMY", "mode": "ABSOLUTE", "n": [0, 1, 2] },
  { "side": "ALLY",  "mode": "RELATIVE", "n": [0] }
]
```

### Target resolution (pure)

`resolveTargets(groups, actor: Position): Position[]` in `src/domain/services/TargetResolution.service.ts`:

- Groups are flattened into cells, one per number in `n`.
- `playerIndex` is the actor's for `ALLY`, the other one for `ENEMY`.
- `slot` is `n` (ABSOLUTE) or `actor.slot + n` (RELATIVE).
- Cells outside the board are dropped. Order (groups, then numbers) is preserved.
- A cell reached several times is **kept every time**: the effect applies once per occurrence, in order (`ENEMY ABS [1, 1]` hits slot 1 twice).
- It never fails: an empty result is a legitimate fizzle.
- Empty cells are kept as targets; each effect decides what an empty cell means.

### Generic effects

| Effect | Behaviour on the resolved positions |
|---|---|
| `Damage` | damage (shield first) to the occupant of each position, once per occurrence |
| `FixedDamage` | sacrificed HP: lowers the occupant's HP by exactly the magnitude, once per occurrence; not absorbed by shield and never modified by buffs or debuffs (used for costs) |
| `Heal` | heal the occupant of each position, once per occurrence (capped at `maxHp`; a dead occupant is not healed) |
| `Shield` | add shield to the occupant of each position, once per occurrence |
| `Swap` | needs exactly 2 positions on the same side; exchanges their occupants. If one cell is empty the occupant **moves** there (the hole travels); two empty cells, a repeated cell, or cells on different sides fizzle |

An empty cell does nothing for `Damage`/`FixedDamage`/`Heal`/`Shield`, and the rest of the pattern still applies. Dead characters stay targetable: damage on a dead occupant is wasted, not redirected.

### Template validation (at catalog load)

`validateEffectTargets` is called while building characters from templates:

- `effect` is one of the `EffectLabel` values; `targets` is non-empty; each group's `n` is a non-empty array of integers.
- ABSOLUTE `n` within 0..4; RELATIVE `n` within -4..4.
- Repeated cells are allowed (they stack).
- `Swap`: exactly 2 numbers in total across its groups, all groups on the same `side` (modes may differ, e.g. `[ALLY REL [0], ALLY ABS [0]]` moves the actor to slot 0).
- An invalid template is a startup failure, not a domain flow: a bad catalog stops the app from starting.

## 2. Phase flow and engine

Phases: `SELECTION -> PLACEMENT -> ROLL -> KEEP -> RESOLVE -> RESULT`. There is no ASSIGN phase.

- `confirmKeep`: when both players are ready and either no rolls are left, all dice are locked, or the final reroll just happened, the game moves to RESOLVE.
- `GameCoordinatorService`: the confirm that lands the game in RESOLVE resolves the round immediately and emits `roundResolved`.

Engine (`PriorityQueue.service.ts`; ordering rules are in the pokemon-speed-system spec):

- `QueueEntry = [DieFace, actorId, actorSpeed]`: the queue carries only ordering information.
- `addAllEffectsToPriorityQueue` queues every character's face.
- `unstackPriorityQueueWithLog`, for each entry in order: skip a dead actor; otherwise, for each effect of the face **in JSON order**, look up the actor's **current** position, `resolveTargets(effect.targets, position)`, then `effect.solve(state, positions, actorId)`. An earlier effect that moves the actor shifts the later effects' relative cells.

`ResolveStep` records per-effect resolved targets so the client can animate without guessing post-swap positions:

```ts
type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly effects: readonly { readonly effect: EffectLabel; readonly targets: readonly Position[] }[]; // [] = fizzled
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};
```

## 3. Application / protocol

- `DieFaceDTO`: `{ description, priority, effects: { effect, magnitude, targets: { side, mode, n }[] }[] }`.
- `CharacterDTO` has no `target`.
- The `roundResolved` log maps `ResolveStep.effects` as is (target cells as `{ playerIndex, slot }`).
- The gateway has no assignment event; there is no client -> server event for targeting.

## 4. Templates

Every effect in `tmplt/*.json` carries `targets`. Descriptions name the cell ("Deal 5 damage to the enemy in front.", "Heal the ally on the right for 5 HP."). Template values are placeholders to be tuned, not balanced.

## 5. Tests

Domain, no NestJS:

- `TargetResolution.service.spec.ts`: ALLY/ENEMY side mapping, absolute, relative, multi-number groups flattened, out-of-board dropped, repeated cells kept, empty result, order preserved, mixed sides and modes in one effect; `validateEffectTargets` errors.
- `Effects.spec.ts`: `Damage`/`Heal`/`Shield` over several positions, a repeated position applying twice, dead occupants, empty cells; `Swap` with 2 positions, with a different count (fizzle), moving into an empty cell.
- `Swap.spec.ts`: push, move and swap scenarios expressed as `Swap` plus cells.
- `PriorityQueue.service.spec.ts`: a relative target follows an actor swapped earlier in the round; effect order within a face (move, then hit); a fizzle is logged with `targets: []`.
- `GameLoop.service.spec.ts` / `Phase.service.spec.ts`: KEEP leads directly to RESOLVE.
- `CharacterGeneration.service.spec.ts` / `templates.spec.ts`: template shape and validation errors (bad label, empty targets, empty `n`, out-of-range n, `Swap` with other than 2 numbers or mixed sides); every template loads.

Application: `GameCoordinator.service.spec.ts` (the last `confirmKeep` triggers resolution and `roundResolved`), `GameStateMapper.viewer.spec.ts` (face DTO exposes `effects[].targets`).

## Out of scope

- Conditional targeting.
- Balancing template values.
