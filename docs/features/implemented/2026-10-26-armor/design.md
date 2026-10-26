# ARMOR: a buff/debuff on the damage a character takes — design

**Status:** implemented 2026-10-26. Part of `../../active/2026-10-26-dice-authoring-and-statuses/design.md` (sections 4.1, 4.4). Reuses the stat machinery of the POWER spec (`../2026-10-26-power/design.md`).

A positive ARMOR is a buff (less damage taken), a negative ARMOR is a debuff (Vulnerable).

## Rules

- `Damage` deals `max(0, magnitude + POWER(actor) - ARMOR(target))` per cell, then shield absorbs, then HP. Additive, with one floor at 0 for the whole expression.
- ARMOR is read on each target cell at hit time, so an area pattern is reduced cell by cell, and a character with ARMOR next to one without takes different damage from the same hit.
- `FixedDamage`, `Heal` and `Shield` ignore ARMOR.
- Same instances, cap (±9 on the sum), tick and `ApplyStat` as POWER; ARMOR is applied with `{ effect: "ApplyStat", stat: "ARMOR", magnitude, duration, targets }`.
- Decision: a single `STAT_NAMES` constant in the domain feeds the `StatName` type, the template validator and the DTO `stats`, rather than three hand-kept lists, so the next stat cannot miss one of them.

## Protocol

`CharacterDTO.stats` now has an `ARMOR` key next to `POWER`; ARMOR instances appear in `modifiers`. The client models are generic over the stat name, so no client change is needed.

## Out of scope

States (STUN, ROOT, DIVINE_SHIELD, POISON/REGEN, HASTE/SLOW), the new roster.
