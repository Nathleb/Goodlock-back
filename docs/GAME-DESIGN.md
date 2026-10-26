# Game design

The game rules and the design principles behind them. Feature specs (`docs/features/`) describe how a mechanic is built; this document describes what the game is and how content is authored for it. Code architecture lives in `CLAUDE.md`.

## 1. The game

A tactical PvP dice game. Each player brings a deck of 6 characters, keeps 4 of them for the match after seeing the opponent's deck (team preview), and lays that team of 4 out on a 5-cell board, leaving one cell empty. Each character is a 6-faced die. A player loses with 2 dead characters.

Each round, players secretly roll and lock die faces, then all actions resolve in priority order. Each face carries its own target cells (see 3).

The opponent's picks and team stay hidden through SELECTION and PLACEMENT; the first state both players see is the ROLL.

Phases: SELECTION -> PLACEMENT -> ROLL -> KEEP -> RESOLVE -> RESULT. There is no ASSIGN phase.

## 2. Pillars

- **The strategy is the keep/reroll decision.** Auto-targeting removed the ASSIGN phase, so keep/reroll is the only per-round decision (team preview and placement happen once). The keep must be a real choice: the faces of one die are ranked by context, not by value.
- **Determinism.** The resolution is fully determined by the faces and the state, with no random effect, so the client can show an exact preview. A resolution timeline and preview are computed from the locked dice (a player's preview only contains the opponent's locked dice; an unlocked die is a hole in the opponent's timeline).
- **Server-authoritative.** Dice rolls, action resolution and priority ordering are server-side; the client only displays.
- **Mobile first.** The game is designed for a phone (see `ROADMAP.md`).

## 3. Resolution rules

**Priority** (Pokemon-style): two independent keys. Actions sort by `face.priority` (a small bracket modifier) descending, then by `character.baseSpeed` descending within the same bracket. Exact ties go to the player holding the initiative token (`GameState.initiativePlayerIndex`: drawn at init, flipped at the end of each round, public in the DTO), then by slot ascending (0 to 4). The order is a pure sort with no random call, so the client can preview it exactly. Speed never crosses brackets.

**Auto-targeting**: players never choose targets. Each effect carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies.
- Off-board cells are dropped; no cell = fizzle.
- The empty cell is kept, and each effect decides what it does there: Damage, FixedDamage, Heal and Shield do nothing on that cell and the rest of the pattern still applies; Swap moves the character into it, so the hole travels.

**Damage types**: `Damage` is inflicted damage: the actor's POWER is added, then shield absorbs, then HP (future ARMOR and DIVINE_SHIELD apply to it too). `FixedDamage` is sacrificed HP: it lowers HP by exactly its magnitude, ignores shield, and nothing modifies it. The author picks per face, including for costs on the actor or an ally.

**Stats (buffs and debuffs)**: `POWER` changes the damage a character deals; a negative value is a debuff. `ApplyStat` adds an independent instance `{ stat, value, roundsLeft }` with its own magnitude and duration (integer ≥ 1, no cap). The net value of a stat is the sum of its instances, capped at ±9.
- `Damage` deals `max(0, magnitude + POWER)` per cell, on any side. Heal, Shield and `FixedDamage` ignore POWER.
- Changes are immediate: a later action of the same round sees them.
- At the end of each round every instance loses one round and is removed at 0, except an instance applied during that round, which starts ticking next round. A duration *d* applied in round *N* is therefore active through round *N + d*.
- `ApplyStat` gives nothing to a dead character.

**Dead characters**: a character at 0 HP stays on the board and is displayed, cannot act, but can still be targeted.

## 4. Dice authoring

### 4.1 Three roles per die

| Role | Faces | Purpose |
|---|---|---|
| Floor | ~3 | The reliable plan, modest value |
| Payoff | 1–2 | A **moderate critical success** (~1.5× the floor), sometimes with a drawback |
| Response | 1–2 | Acts on the opponent's faces: movement, protection, control |

- The split may vary per character, and values may vary within a role.
- **Blank faces** exist. A blank or weak face is what makes rerolling a decent result a real question.
- **Heal is rare.**

Reliability is set by the number of faces in a group. Probability of getting at least one face of a group over 3 rolls (1 roll + 2 rerolls):

| Faces in group | P |
|---|---|
| 1 | 42 % |
| 2 | 70 % |
| 3 | 88 % |
| 4 | 96 % |

### 4.2 Guidelines

- The best face to keep should change with the **position** (what is in front, the empty cell), the **timing** (bracket and speed versus the opponent's kept faces) and the **opponent's revealed keeps**.
- **Reveal tension:** kept dice are shown to the opponent, rerolled ones are not. Response faces are worth most when found late (last reroll), so hiding has value.
- **No indefinite-duration statuses**, because there is no switching to reset them.
- **No random effects** (see 2).

### 4.3 Face value estimate

A rough value per face to compare dice at a glance (not a rule, there is no budget constraint system): 1 damage = 1 point, shield slightly less (lost at end of round), status ≈ magnitude × rounds × number of affected actions.

## 5. Values

### 5.1 Method

Values are not picked one by one. One **reference unit** is fixed, everything else is a **ratio** to it, ratios come from the target experience, and simulations correct the ratios (not isolated numbers).

Scale: Slay the Spire's order of magnitude (HP around 100, two-digit values), not its ratios: Slay plays several cards per turn, here each character acts once per round.

### 5.2 Target match length

About **15 rounds**. Estimate (assumptions to correct by simulation): ~2.5 offensive faces per side per round, ~25 % of damage absorbed, ~50 % of damage landing on the two characters that eventually die.

```
useful damage per round ≈ 2.5 × D × 0.75 × 0.5 ≈ 0.94 D
rounds ≈ 2 × HP / 0.94 D ≈ 2.1 × HP / D
HP = 100, D = 15  →  ≈ 14 rounds
```

### 5.3 Starting values

| Element | Value |
|---|---|
| HP | 100 reference (80–120 by role) |
| Floor damage (D) | 15 |
| Critical (×1.5) | 22 |
| Response shield (one hit) | 15 |
| AoE damage, per cell | 6–8 |
| POWER / ARMOR step | ±3 (~20 % of D) |
| POISON per round | 5 |
| Status durations | 1–3 rounds |
| `baseSpeed` | 1–10 |
| Face priority brackets | 0, 1, 2 |

If matches run long: raise D or lower HP; everything else follows the ratios.

## 6. Validation plan

1. **Paper prototype** with real d6: judge structure and readability (no bot measures that).
2. **Simulations** with the engine and simple bots, four metrics:
   - average match length (rounds);
   - snowball: win rate of the player ahead after round 2;
   - how often the best keep differs from the greedy keep (highest value);
   - keep frequency per face (dead or dominant faces).
