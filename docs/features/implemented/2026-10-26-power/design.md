# POWER: a buff/debuff on the damage a character deals — design

**Status:** implemented 2026-10-26. Part of `../../active/2026-10-26-dice-authoring-and-statuses/design.md` (sections 4.1, 4.3, 4.4, 4.5).

POWER is a stat with a magnitude. A positive value is a buff, a negative value is a debuff (Weak). ARMOR (see its spec) reuses the same machinery.

## Rules

- Each application is an independent **instance** `{ stat, value, roundsLeft, appliedRound }`, stored in `Character.modifiers`. Magnitude and duration are authored separately; the duration is an integer ≥ 1 with no upper cap.
- The **net value** of a stat is the sum of its instances, capped to ±`MAX_STAT_NET` (9). The cap applies when the value is read; instances are stored uncapped, so opposite instances still cancel.
- `Damage` deals `max(0, magnitude + POWER(actor))` per cell, then shield absorbs, then HP. POWER applies on every cell of a `Damage`, ally or enemy. It never applies to `Heal`, `Shield` or `FixedDamage`.
- Changes are **immediate**: a later action of the same round sees them.
- **Ticking**: at the end of each round every instance loses one `roundsLeft` and is removed at 0, except an instance applied during that same round (`appliedRound === currentRound`), which does not tick yet. A duration *d* applied in round *N* is therefore active for the rest of *N* and rounds *N+1 … N+d*.
- `ApplyStat` (template `{ effect, stat, magnitude, duration, targets }`) adds one instance per target-cell occurrence. An empty cell does nothing while the rest of the pattern applies. A dead occupant gets no instance (it is still listed as affected, like `Damage` on a dead target).
- The accepted stats are the `STAT_NAMES` list (POWER, then ARMOR with its own feature); the validator rejects any other stat. Validation: stat in the enum, `magnitude` a non-zero integer, `duration` an integer ≥ 1.
- Decision: `EffectFactory` constructors get an optional second argument `params` (stat, duration) rather than the whole entry, so the existing `(amount) => ...` registrations stay as they are.

## Protocol

`CharacterDTO` gains `modifiers` (`{ stat, value, roundsLeft }` per instance) and `stats` (net value per stat, computed by the server so the client does not duplicate the cap). `FaceEffectDTO` gains `stat` and `duration` when the effect has them, in both `GameStateMapper` and `CatalogMapper` (collection, decks and the revealed deck at team preview).

## Out of scope

States (STUN, HASTE…), the new roster.
