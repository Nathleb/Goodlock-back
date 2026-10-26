# POWER — plan

**Status:** approved 2026-10-26, in progress.

Layers: domain (types, `netStat`, `Damage`, `ApplyStat`, generation and validation, tick), application (DTO + mapper). Each step: red test seen failing first (mutation check when the code already satisfies it), minimum code, tests green, one commit.

- [x] 0. Docs: this spec and plan.
- [x] 1. `Modifier` becomes a stat instance; `netStat` sums, ignores other stats, caps at ±9.
- [x] 2. `Damage` adds the actor's POWER.
- [x] 3. A POWER debuff floors the damage at 0.
- [x] 4. POWER applies on ALLY cells too.
- [x] 5. Shield absorbs after POWER.
- [x] 6. Heal, Shield and `FixedDamage` ignore POWER (tests, mutation checked).
- [x] 7. `ApplyStat` strategy adds an instance.
- [x] 8. `ApplyStat` edge cases: repeated cell, empty cell, dead occupant, stacking.
- [x] 9. Templates can use `ApplyStat` (entry union, factory params, registration).
- [x] 10. Validation of stat parameters.
- [x] 11. Tick at the end of the round.
- [x] 12. An instance applied this round does not tick.
- [x] 13. Immediate effect inside the round (integration).
- [ ] 14. DTO: `modifiers`, `stats`, effect `stat` and `duration`.
- [ ] 15. Client mirror in Goodlock-app (subagent, from main after fast-forwarding feat/fixed-damage).
- [ ] 16. Docs to current behavior: GAME-DESIGN, umbrella, auto-targeting spec, ROADMAP, FixedDamage spec.

After the steps: FULL review, implemented/, memory, push and PR.
