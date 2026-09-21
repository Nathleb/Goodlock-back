# Auto-targeting: remove the ASSIGN phase — design

**Date:** 2026-09-21
**Scope:** backend only (Goodlock-back). Frontend adaptation is a separate project, started after `feat/board-redesign` is merged.

## Goal

Simplify the game: players no longer choose targets. Every die face carries predefined target cells in its template; targets are computed by the server at the moment each effect resolves. The ASSIGN phase disappears.

## Decisions

- Decision: targets are **cells (positions)**, never characters, because characters move (Swap) and the design targets board positions.
- Decision: targets are computed **at resolution time of each effect**, from the actor's **current** position, rather than frozen at the start of RESOLVE, because movement must keep its tactical weight.
- Decision: each **effect** (not face) carries its own targets, because one face can mix targets (e.g. "Sacrifice 3 HP to deal 9": self + enemy).
- Decision: an effect's targets are a **list of groups**; each group has a side, a mode — **absolute** (fixed slots) or **relative** (offsets from the actor's slot) — and an array of numbers. One effect can mix sides and modes (e.g. `[ENEMY ABS 0 1 2, ALLY REL 0]`). Patterns (single, cleave, full team, split, one-of-each-team) are just recognisable cell sets, not types.
- Decision: numbers are a JSON **array** (`[-1, 0, 1]`) rather than a concatenated string (`"-101"`), because relative offsets are negative and concatenation becomes ambiguous; arrays need no parser.
- Decision: a relative cell outside the board (slot < 0 or > 4) is **dropped**; an effect with no remaining cell **fizzles** (no-op).
- Decision: conditional targeting ("weakest enemy") is **out of scope** — it targets characters, not cells.
- Decision: the 15 effect strategies collapse into **4 generic effects: `Damage`, `Heal`, `Shield`, `Swap`**, because the "who" moved into `targets`; only the "what" remains in the effect.
- Decision: `Swap`, `PushLeft/Right`, `MoveToSlot` all already reduce to `swapSlotsOnSameTeam(a, b)` → a single `Swap` effect exchanging the occupants of exactly 2 cells on the same side.
- Decision: `TargetConstraint` (`NONE` / `ALLY_ONLY` / `ENEMY_ONLY`) is **removed** — it only described what the player was allowed to pick during ASSIGN.

## 1. Domain model

```ts
// src/domain/types/TargetGroup.type.ts
type Side = 'ALLY' | 'ENEMY';           // relative to the acting character's team
type TargetMode = 'ABSOLUTE' | 'RELATIVE';

type TargetGroup = {
    readonly side: Side;
    readonly mode: TargetMode;
    readonly n: readonly number[];       // ABSOLUTE: slots 0..4 — RELATIVE: offsets -4..4
};

// src/domain/types/EffectLabels.type.ts
enum EffectLabel { Damage = "Damage", Heal = "Heal", Shield = "Shield", Swap = "Swap" }

// Effect instruction as stored on a DieFace
type EffectInstruction = {
    readonly effect: EffectLabel;
    readonly magnitude: number;          // ignored by Swap
    readonly targets: readonly TargetGroup[];
};

// DieFace
type DieFace = {
    readonly priority: number;
    readonly description: string;
    readonly effects: readonly EffectInstruction[];   // targetConstraint removed
};

// Effect strategy interface
type Effect = {
    solve(gs: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] };
};
```

Board convention: `ENEMY` relative offset `0` = the enemy in the same slot index as the actor ("the one facing me").

Template JSON example — "Sacrifice 3 HP to deal 9 to the first three enemies":

```json
"effects": [
  { "effect": "Damage", "magnitude": 3, "targets": [{ "side": "ALLY",  "mode": "RELATIVE", "n": [0] }] },
  { "effect": "Damage", "magnitude": 9, "targets": [{ "side": "ENEMY", "mode": "ABSOLUTE", "n": [0, 1, 2] }] }
]
```

Mixed example — one effect hitting enemies 0–2 and the actor itself:

```json
"targets": [
  { "side": "ENEMY", "mode": "ABSOLUTE", "n": [0, 1, 2] },
  { "side": "ALLY",  "mode": "RELATIVE", "n": [0] }
]
```

Removed: `Character.target`, `TargetConstraint`, `TargetValidator`, `selectTargetOfCharacter`, and the old strategy classes (`SingleTarget*`, `Cleave*`, `FullTeam*`, `Self*`, `SwapAlly`, `PushLeft/Right`, `MoveToSlot`).

### Target resolution (pure)

```ts
// src/domain/services/TargetResolution.service.ts
resolveTargets(groups: readonly TargetGroup[], actor: Position): Position[]
```

- Groups are flattened into cells, one per number in `n`.
- `playerIndex` = actor's for `ALLY`, the other one for `ENEMY`.
- `slot` = `n` (ABSOLUTE) or `actor.slot + n` (RELATIVE).
- Cells outside 0..4 are dropped. Order (groups, then numbers) is preserved.
- Never fails: an empty result is a legitimate "fizzle".

### Generic effects

| Effect | Behaviour on resolved positions |
|---|---|
| `Damage` | apply damage (shield first, current rules) to each occupant |
| `Heal` | heal each occupant (cap at maxHp, current rules) |
| `Shield` | add shield to each occupant |
| `Swap` | if exactly 2 positions resolved: `swapSlotsOnSameTeam`; otherwise fizzle (never swap with the void) |

Dead characters stay targetable (current rule): a damage on a dead occupant is wasted, not redirected. Existing heal/shield-on-dead behaviour is preserved as-is.

### Template validation (at load, `CharacterGeneration`)

- `effect` is one of the 4 labels; `targets` non-empty; each group's `n` non-empty integers.
- ABSOLUTE `n` in 0..4; RELATIVE `n` in -4..4.
- No duplicate (side, mode, n) across the effect's groups.
- `Swap`: exactly 2 numbers in total across its groups, all groups on the same `side` (modes may differ, e.g. `[ALLY REL [0], ALLY ABS [0]]` = move self to slot 0).
- Invalid template → load error (existing throw-at-load behaviour kept; it is a startup failure, not a domain flow).

## 2. Phase flow and engine

Phases: `PLACEMENT → ROLL → KEEP → RESOLVE → RESULT`.

- `confirmKeep`: when both are ready and (no rolls left or all dice locked, or the final reroll just happened) → `beginResolvePhase` (was `beginAssignPhase`).
- `GameCoordinator`: the resolution trigger that ran after `confirmAssignment` now runs when `confirmKeep` lands in RESOLVE.
- Removed: `GamePhase.ASSIGN`, `beginAssignPhase`, domain `confirmAssignment` / `cancelAssignment`, coordinator `confirmAssignment` / `cancelAssignment`, `ASSIGN` in `Claim.service` `CONFIRM_PHASES`.

Engine (`PriorityQueue.service`):

- `QueueEntry` becomes `readonly [DieFace, actorId, actorSpeed]` — the queue only carries ordering. Ordering rules unchanged (bracket, then speed, random tiebreak).
- `addAllEffectsToPriorityQueue`: every character with a face is queued (no more target-null skip).
- `unstackPriorityQueueWithLog`, for each entry in order:
  1. Skip dead actor (unchanged).
  2. For each effect of the face, **in JSON order**: look up the actor's **current** position, `resolveTargets(effect.targets, position)`, then `effect.solve(state, positions, actorId)`. An earlier effect that moves the actor shifts the later effects' relative cells.

`ResolveStep` gains per-effect resolved targets so the client can animate without guessing post-swap positions:

```ts
type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly effects: readonly { readonly effect: EffectLabel; readonly targets: readonly Position[] }[]; // [] = fizzled
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};
```

## 3. Application / protocol

- `DieFaceDTO`: `targetConstraint` → `effects: { effect: string; magnitude: number; targets: { side; mode; n: number[] }[] }[]`.
- `CharacterDTO`: `target` removed.
- `roundResolved` log: `ResolveStep.effects` mapped through as-is.
- Gateway: `confirmAssignment` and `cancelAssignment` handlers removed. No new client → server event.

**Breaking change for the frontend** (AssignPanel, `targetConstraint`, `ASSIGN_PHASE`). The frontend is adapted in a separate project; until then the current frontend cannot play past KEEP.

## 4. Template migration (placeholder values, to tune later)

Mechanical translation rule, applied to all 10 templates in `tmplt/`:

| Old effect | New effect | targets |
|---|---|---|
| `SingleTargetDamage` | `Damage` | `[{ ENEMY, RELATIVE, [0] }]` |
| `CleaveDamage` | `Damage` | `[{ ENEMY, RELATIVE, [-1, 0, 1] }]` |
| `FullTeamDamage` | `Damage` | `[{ ENEMY, ABSOLUTE, [0, 1, 2, 3, 4] }]` |
| `SelfDamage` / `SelfHeal` / `SelfShield` | `Damage` / `Heal` / `Shield` | `[{ ALLY, RELATIVE, [0] }]` |
| `SingleTargetHeal` / `SingleTargetShield` | `Heal` / `Shield` | `[{ ALLY, RELATIVE, [1] }]` |
| `CleaveHeal` / `CleaveShield` | `Heal` / `Shield` | `[{ ALLY, RELATIVE, [-1, 0, 1] }]` |
| `FullTeamHeal` / `FullTeamShield` | `Heal` / `Shield` | `[{ ALLY, ABSOLUTE, [0, 1, 2, 3, 4] }]` |
| `PushLeft` (Diana) | `Swap` | `[{ ENEMY, RELATIVE, [0, -1] }]` |
| `PushRight` (Diana) | `Swap` | `[{ ENEMY, RELATIVE, [0, 1] }]` |

`"targetConstraint"` keys are removed (this also removes the invalid `"ANY"` value on Diana's push faces). Descriptions are reworded to name the cell ("Deal 5 damage to the enemy in front.", "Heal the ally on the right for 5 HP.").

## 5. Tests (TDD, bottom-up — tests updated/written before each layer)

Domain:
- **New** `TargetResolution.service.spec.ts`: ALLY/ENEMY side mapping, absolute, relative, multi-number groups flattened, out-of-bounds dropped, empty → `[]`, order preserved, mixed sides and modes across groups in one effect.
- **New** `Effects.spec.ts` (replaces `SingleTargetHeal.spec`, `SelfEffects.spec`, `CleaveAndFullTeam.spec`): `Damage`/`Heal`/`Shield` over 1, 3, 5, 10 positions; dead occupant; `Swap` with 2 positions, with ≠2 → fizzle.
- **Update** `Swap.spec.ts`: push/move/swap scenarios expressed as `Swap` + cells.
- **Delete** `TargetValidator.spec.ts`.
- **Update** `PriorityQueue.service.spec.ts`: new `QueueEntry` shape; relative target follows an actor swapped earlier in the round; effect order within a face (move then hit); fizzle logged with `targets: []`; `ResolveStep.effects`.
- **Update** `GameLoop.service.spec.ts` / `Phase.service.spec.ts`: KEEP → RESOLVE directly; no ASSIGN.
- **Update** `CharacterGeneration.service.spec.ts` / `templates.spec.ts`: new JSON shape, validation errors (bad label, empty targets, empty `n`, out-of-range n, duplicate cell, Swap ≠2 numbers or mixed sides), all 10 templates load.
- **Update** `DomainIntegration.spec.ts`, `Claim.service.spec.ts`, `Round.service.spec.ts`, `Player.service.spec.ts`, `EffectFactory.spec.ts` as needed.

Application:
- **Update** `GameCoordinator.service.spec.ts`: last `confirmKeep` triggers resolution + `roundResolved`; no `confirmAssignment`.
- **Update** `GameStateMapper.viewer.spec.ts`: face DTO exposes `effects[].targets`; no `target` / `targetConstraint`.

Verification: `npm run test`, `npm run lint`, `npm run build`.

## Out of scope

- Frontend (separate project).
- Conditional targeting.
- Re-balancing template values beyond the mechanical mapping.
