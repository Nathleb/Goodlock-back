# Dice authoring, statuses and initiative: design

**Status:** approved 2026-10-26, implemented feature by feature (see section 9). Each feature has its own folder under `docs/features/active/`; this document is the umbrella they refer to.

Summary of the 2026-10-26 design session. Sections are tagged **[decided]** or **[proposed]** (suggested, to confirm when its feature is planned). Every question that was open is answered (section 7).

---

## 1. Context

Auto-targeting removed the ASSIGN phase. The only per-round decision left is **keep/reroll** (team preview and placement happen once). Strategy must therefore come from making the keep a real choice: faces of one die must be ranked by context, not by value.

The current `tmplt/*.json` roster is placeholder test data and does not follow this document.

---

## 2. Dice authoring

### 2.1 Three roles per die [decided]

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

### 2.2 Authoring guidelines [decided]

- The best face to keep should change with the **position** (what is in front, the empty cell), the **timing** (bracket and speed versus the opponent's kept faces) and the **opponent's revealed keeps**.
- **Reveal tension:** kept dice are shown to the opponent, rerolled ones are not. Response faces are worth most when found late (last reroll), so hiding has value.

---

## 3. Determinism [decided]

- **No random effects.** The resolution must be fully determined by the faces, so the client can show an exact preview.
- **UI target:** a resolution timeline and a resolution preview computed from the locked dice (each player's preview only contains the opponent's locked dice; an unlocked die is a hole in the opponent's timeline).

### 3.1 Initiative instead of a random tiebreak [decided]

Decision: ties are broken by an initiative token stored in the state rather than by a random shuffle at resolution, because the preview must be exact and the token is fair (it alternates).

- `GameState.initiativePlayerIndex: PlayerIndex`, drawn **once at game init**, flipped at **end of each round**, exposed in the **public DTO**.
- Decision: a stored field rather than `currentRound % 2`, because the client reads it instead of re-deriving it, and logs/replays show it directly.
- Ties inside one team: by **slot**, read when the queue is frozen at the start of RESOLVE. Direction **[decided]**: slot 0 → 4 (a per-player preset may come later).
- Code: `orderedForResolution` in `PriorityQueue.service.ts` drops `shuffled` / `Math.random` and becomes a pure sort (see 4.4 for the full key).

---

## 4. Statuses

Two families, as in Slay the Spire. **No indefinite duration.** Cumulative, with a cap.

### 4.1 Stats with magnitude [decided]

`POWER` (damage dealt) and `ARMOR` (damage taken). Negative values are the inverse debuffs (Weak, Vulnerable).

- Each application is an **independent instance** `{ stat, value, roundsLeft }`. Magnitude and duration are authored independently.
- The **net value** of a stat is the **sum** of active instances, capped. Opposites cancel through the sum (+3 for 3 rounds and −3 for 1 round = 0 this round, then +3 for two rounds).
- Storage: `Character.modifiers` (currently `{ label, value }`, unused) becomes this instance list.
- Net cap **[decided]**: ±9 (3 steps). To revisit after the balancing simulations; keep it a single constant.
- Mobile display: one badge per stat with the net value, instance details on long press.

### 4.2 States with fixed effect [decided]

The effect is fixed per state; a **signed counter per axis** holds the **duration**. A buff and its inverse fight over the duration (Haste 3 then Slow 2 = Haste 1).

| Axis | + | − | Effect |
|---|---|---|---|
| SPEED | HASTE | SLOW | Hasted resolves before the non-hasted of its bracket; slowed after |
| VITALITY | REGEN | POISON | At upkeep: ±`POISON_DAMAGE` (5) HP |
| STUN | STUN | – | The character's action is skipped (a stun landing before its action cancels it, like death) |
| ROOT | ROOT | – | Any Swap involving the character's cell fizzles |
| DIVINE_SHIELD | DIVINE_SHIELD | – | The next Damage instance on the character is nullified, then the state is consumed |

- Duration cap **[decided]**: none. The validator only checks that `duration` is an integer ≥ 1. Still no indefinite duration.
- `DIE_LOCK` **[decided: separate later feature]**: the target's die is rolled once and auto-locked at the next ROLL. Only effect family that acts on the keep decision directly; not part of the v1 vocabulary below.

### 4.3 Ticking [proposed]

- End of each round: every stat instance loses one round (removed at 0); every state counter moves one step toward 0.
- **A status touched during a round does not tick at the end of that round.** Implementation: stat instances carry `appliedRound`; state axes store `{ value, touchedRound }` and skip the tick when `touchedRound === currentRound`.
- Consequence: a status of duration *d* applied in round *N* is active for the rest of *N* and for rounds *N+1 … N+d*. A STUN of 1 therefore cancels the rest of this round **and** the next action: keep stuns at duration 1.

### 4.4 Engine rules

- **Damage per cell** [decided]: `max(0, magnitude + POWER(actor) − ARMOR(target))`, then shield absorbs, then HP. Decision: additive rather than multiplicative, because values stay integers, the client shows "+3" without a rounding rule, and no extra maths is needed. Armour is strong against multi-hit/AoE; that is balanced by values, not by the formula.
- POWER applies to every `Damage`, on any side (damage dealt to an ally goes through armour too). Heal and Shield are not affected [decided].
- **`FixedDamage`** [decided]: a separate effect for "sacrifice HP" costs. It ignores POWER and ARMOR, is absorbed neither by shield nor by DIVINE_SHIELD, and does not consume DIVINE_SHIELD. Decision: a separate effect type rather than inferring a cost from the target side, because the author decides per character whether damage to an ally is inflicted (buffs apply) or sacrificed (fixed).
- POWER/ARMOR changes apply **immediately** to later actions of the same round (CDC rule).
- **SPEED changes apply in the same round** [decided]. Decision: the unresolved part of the queue is re-sorted after a SPEED change rather than frozen until next round, because a buff or debuff landing mid-round has an immediate, computable impact like POWER and ARMOR. Guards, each locked by tests:
  - one entry per character per round, consumed once: nobody plays twice;
  - only unresolved entries are re-sorted; resolved ones never come back;
  - HASTE/SLOW reorder only inside a bracket, so they cannot move a character ahead of one that already played;
  - a hasted character may therefore play right after the current actor; a slowed one may drop behind the others of its bracket.
  The client preview becomes a simulation of the resolution (still deterministic) instead of a plain sort.
- Sort key: bracket desc → SPEED sign desc (hasted, neutral, slowed) → `baseSpeed` desc → initiative holder first → slot asc.
- **Upkeep at the start of the round, before ROLL** [proposed]: POISON/REGEN resolve. POISON ignores ARMOR and shield. A character killed at upkeep does not roll.

### 4.5 Template schema [proposed]

The stat enum grows feature by feature: `POWER` first, `ARMOR` with its own feature. The validator rejects a stat whose feature is not implemented yet.

`EffectEntry` becomes a discriminated union:

```jsonc
{ "effect": "Damage" | "Heal" | "Shield", "magnitude": 15, "targets": [...] }
{ "effect": "Swap", "magnitude": 0, "targets": [...] }                         // unchanged
{ "effect": "ApplyStat",  "stat": "POWER" | "ARMOR", "magnitude": -3, "duration": 2, "targets": [...] }
{ "effect": "ApplyState", "state": "HASTE" | "SLOW" | "REGEN" | "POISON" | "STUN" | "ROOT" | "DIVINE_SHIELD", "duration": 2, "targets": [...] }
```

- `FixedDamage` uses the same shape as `Damage` (`magnitude`, `targets`).
- A blank face is `"effects": []` (already accepted by `CharacterGeneration`).
- `validateEffectTargets` gains checks: `duration` integer ≥ 1; `stat`/`state` in their enums; `magnitude` ≠ 0 for ApplyStat.

---

## 5. Values

### 5.1 Method [decided]

Values are not picked one by one. One **reference unit** is fixed, everything else is a **ratio** to it, ratios come from the target experience, and simulations correct the ratios (not isolated numbers).

Scale: Slay the Spire's order of magnitude (HP around 100, two-digit values), not its ratios: Slay plays several cards per turn, here each character acts once per round.

### 5.2 Target match length [decided]

About **15 rounds**.

Estimate (assumptions to correct by simulation): ~2.5 offensive faces per side per round, ~25 % of damage absorbed, ~50 % of damage landing on the two characters that eventually die.

```
useful damage per round ≈ 2.5 × D × 0.75 × 0.5 ≈ 0.94 D
rounds ≈ 2 × HP / 0.94 D ≈ 2.1 × HP / D
HP = 100, D = 15  →  ≈ 14 rounds
```

### 5.3 Starting values [decided as a starting point]

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

### 5.4 Authoring estimate (not a game rule)

A rough value per face to compare dice at a glance (the budget *constraint* system stays cut): 1 damage = 1 point, shield slightly less (lost at end of round), status ≈ magnitude × rounds × number of affected actions. Usable in the design tooling's metric estimators.

---

## 6. Validation plan

1. **Paper prototype** with real d6: judge structure and readability (no bot measures that).
2. **Simulations** with the engine and simple bots, four metrics:
   - average match length (rounds);
   - snowball: win rate of the player ahead after round 2;
   - how often the best keep differs from the greedy keep (highest value);
   - keep frequency per face (dead or dominant faces).

---

## 7. Answered questions and what is out

1. Additive vs multiplicative: additive.
2. Net stat cap: ±9, to revisit after balancing. State duration cap: none.
3. Intra-team tie direction: slot 0 → 4.
4. POWER affects Damage only (any side), not Heal. Sacrifice is the separate `FixedDamage` effect.
5. Effect vocabulary v1: Damage, FixedDamage, Shield, Swap, rare Heal, POWER/ARMOR, POISON/REGEN, STUN, ROOT, DIVINE_SHIELD, HASTE/SLOW. `DIE_LOCK` is a later feature.
6. Triggers ("flee when hit", riposte): in the ROADMAP, needing their own system. Value combos (shared symbols) and max-HP changes: dropped.

## 8. Decision log

- Decision: strategy is carried by the keep/reroll decision rather than by targeting, because auto-targeting removed the ASSIGN phase.
- Decision: dice are authored in three roles (floor, moderate-critical payoff, response) with blank faces allowed rather than as a value curve, because an ordered die makes the keep trivial.
- Decision: no random effect rather than random targeting or random effects, because the resolution preview must be exact.
- Decision: an initiative token (`initiativePlayerIndex` in the state, drawn at init, flipped each round) rather than a random tiebreak or `round % 2`, because it is fair, exact for the preview and readable in logs.
- Decision: two status families (stat instances with independent magnitude and duration; fixed-effect states with disputed duration) rather than a single model, because tying magnitude to duration was too limiting and stats need independent tuning.
- Decision: no indefinite-duration buffs, because there is no switching to reset them.
- Decision: values start from HP 100 and floor 15, derived from a ~15-round target, rather than from absolute intuitions.

---

## Appendix: example templates

`templates/*.json` (next to this file): six characters at the new scale illustrating the roles (placeholders, untuned). `garran` and `kesh` use only current effects and load today; the other four need `ApplyStat` / `ApplyState`.

| Character | Role | HP | Speed | Split (floor / payoff / response / other) |
|---|---|---|---|---|
| Garran | Bruiser | 110 | 5 | 3 / 1 / 1 / 1 blank |
| Kesh | Assassin | 80 | 9 | 2 / 2 / 1 / 1 blank |
| Ysolde | Protector | 120 | 3 | 3 / 1 / 1 / 1 weak hit |
| Morrow | Controller | 100 | 6 | 3 / 1 / 2 |
| Vespera | Poisoner | 90 | 7 | 3 / 1 / 1 / 1 blank |
| Tobin | Support | 90 | 8 | 2 / 1 / 2 buffs / 1 heal |
- Decision: SPEED changes re-sort the unresolved queue in the same round rather than apply next round, because buffs and debuffs have an immediate impact; the guards of 4.4 prevent double play.
- Decision: `FixedDamage` as its own effect rather than a cost inferred from the ally side, because the author chooses per character between inflicted and sacrificed damage.
- Decision: additive POWER/ARMOR rather than multiplicative, because values stay integers and the client displays them as-is.
- Decision: no state duration cap and a ±9 net stat cap, to be tuned after the simulations.

---

## 9. Feature order

Each item is its own feature (branch, spec, plan, review, PR). A feature that changes a behavior documented here updates this document in the same change.

1. Deterministic initiative (`implemented/2026-10-26-initiative`), done
2. `FixedDamage` (`implemented/2026-10-26-fixed-damage`), done
3. POWER: stat instances, tick, `ApplyStat` schema
4. ARMOR
5. States, one per feature: STUN, ROOT, DIVINE_SHIELD, POISON/REGEN, then HASTE/SLOW (the first one adds the counters, the `ApplyState` schema and the tick)
6. New roster (`templates/` below, once the effects exist)
7. Later: `DIE_LOCK`, player-set tie preset, triggers
