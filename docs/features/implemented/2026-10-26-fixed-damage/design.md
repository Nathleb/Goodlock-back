# FixedDamage: sacrificed HP that nothing modifies — design

**Status:** implemented 2026-10-26. Part of `../../active/2026-10-26-dice-authoring-and-statuses/design.md` (section 4.4).

## Why

A face can cost HP ("take 3 damage, deal 9"). Decision: a separate `FixedDamage` effect rather than a `Damage` cost inferred from the ally side, because the author chooses per character between damage that is inflicted (buffs and armour apply) and damage that is sacrificed (fixed).

## Rules

- `FixedDamage` lowers the occupant's HP by exactly `magnitude`, on any side.
- It is not absorbed by shield.
- It ignores POWER and ARMOR (both pinned by tests), and neither triggers nor consumes DIVINE_SHIELD. DIVINE_SHIELD does not exist yet: its feature must keep this rule and add the matching test.
- Cell by cell, like every effect: a repeated cell is hit once per occurrence, an empty cell does nothing while the rest of the pattern applies, a dead occupant stays at 0 HP.
- Template shape is the same as `Damage`: `{ "effect": "FixedDamage", "magnitude": 3, "targets": [...] }`.

## Out of scope

The status DIVINE_SHIELD: a later feature.
