# ARMOR — plan

**Status:** approved 2026-10-26, in progress.

Layers: domain (type, `Damage`, validator), application (DTO mapper). Each step: red test seen failing first (mutation check when the code already satisfies it), minimum code, tests green, one commit.

- [x] 0. Docs: this spec and plan.
- [x] 1. `STAT_NAMES` and ARMOR in `netStat`.
- [x] 2. `Damage` subtracts the target's ARMOR.
- [ ] 3. Floor at 0.
- [ ] 4. ARMOR debuff (Vulnerable).
- [ ] 5. POWER and ARMOR share one floor.
- [ ] 6. ARMOR is read per target cell.
- [ ] 7. Shield absorbs after ARMOR.
- [ ] 8. `FixedDamage`, Heal and Shield ignore the target's ARMOR.
- [ ] 9. Templates can use `ApplyStat` with ARMOR (validator reads `STAT_NAMES`).
- [ ] 10. ARMOR changes apply inside the round, in speed order.
- [ ] 11. ARMOR ticks like POWER.
- [ ] 12. DTO `stats` has ARMOR.
- [ ] 13. Docs to current behavior.

After the steps: FULL review, implemented/, memory, push and PR.
