# States: STUN, ROOT, DIVINE_SHIELD, POISON/REGEN, HASTE/SLOW — design

**Status:** approved 2026-10-26, in progress. Part of `../2026-10-26-dice-authoring-and-statuses/design.md` (sections 4.2, 4.3, 4.4, 4.5). Stats (POWER, ARMOR) are in `../../implemented/2026-10-26-power/design.md`.

A state has a fixed effect; a signed **counter per axis** holds its duration.

| Axis | + | - | Effect |
|---|---|---|---|
| SPEED | HASTE | SLOW | hasted resolves before the neutral of its bracket, slowed after |
| VITALITY | REGEN | POISON | at the start of each round, ±5 HP |
| STUN | STUN | | the character's action is skipped |
| ROOT | ROOT | | a Swap involving its cell fizzles |
| DIVINE_SHIELD | DIVINE_SHIELD | | the next `Damage` on it is nullified, then the state is consumed |

## Counters

- `Character.states`: per axis `{ value, touchedRound }`. `ApplyState` adds `+duration` (HASTE, REGEN, STUN, ROOT, DIVINE_SHIELD) or `-duration` (SLOW, POISON), so opposites fight (Haste 3 then Slow 2 = Haste 1); the same direction adds up; no cap. A value of 0 removes the axis.
- At the end of each round every axis moves one step toward 0, except an axis touched during that round. A duration *d* applied in round *N* is active through round *N + d*.
- Template: `{ effect: "ApplyState", state, duration, targets }`, no magnitude (0 on the face effect). `duration` is an integer ≥ 1. Like `ApplyStat`, it skips dead occupants and does nothing on an empty cell.

## Rules per state

- **STUN**: read when the character's turn comes, so a stun landing before its action cancels it, like death. The step is logged `skipped: true`. STUN 1 applied in round *N* also cancels the action of round *N + 1*.
- **ROOT**: a Swap fizzles when either occupant of its two cells is rooted, including the actor swapping itself. A rooted character still acts and still takes damage.
- **DIVINE_SHIELD**: a `Damage` hit that would deal more than 0 (after POWER and ARMOR) is nullified and consumes the whole state. A hit floored to 0 does not consume it. A repeated cell consumes it once, the second occurrence lands. `FixedDamage` ignores it and does not consume it; Heal and Shield are unaffected.
- **POISON / REGEN**: an upkeep runs after the end of each round and before the next ROLL. POISON removes `POISON_DAMAGE` (5) HP ignoring ARMOR and shield; REGEN heals `REGEN_HEAL` (5), capped at max HP, never reviving; the dead are skipped. If upkeep ends the match, `gameOver` is emitted instead of rolling. A duration *d* hurts at the start of rounds *N + 1 … N + d*.
- **HASTE / SLOW**: the resolution loop picks the next entry among the unresolved ones after every step, so a SPEED change re-sorts only what has not played. Sort key: bracket desc, SPEED sign (hasted, neutral, slowed), `baseSpeed` desc, initiative holder, slot asc. The initiative and slot keys are captured when RESOLVE starts; only the SPEED sign is read live. Guards: one entry per character per round, consumed once; resolved entries never return; SPEED reorders only inside a bracket.

## Protocol

`CharacterDTO.states` has every axis (signed value, 0 when none); `FaceEffectDTO.state` when the effect has one; same in the catalog mapper. An animated upkeep log is not part of this feature.

## Out of scope

`DIE_LOCK`, the client resolution preview, badges, a player-set tie preset.
