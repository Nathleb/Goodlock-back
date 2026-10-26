# States — plan

**Status:** approved 2026-10-26, in progress. One branch and one PR with the roster; a FULL review after each feature.

Each step: red test seen failing first (mutation check when the code already satisfies it), minimum code, tests green, one commit.

- [x] 0. Setup and this spec.

5a infrastructure and STUN
- [x] 1. Types: `StateName`, `StateAxis`, `STATE_DEFS`, `Character.states`, `stateValue`.
- [x] 2. `ApplyState` strategy.
- [x] 3. Templates: entry union, factory params, registration, validation.
- [x] 4. Tick of the axes.
- [x] 5. STUN skips the action.
- [ ] 6. DTO and catalog mapper.
- [ ] 7. Review 1.

5b ROOT
- [ ] 8. Swap fizzles on a rooted occupant.
- [ ] 9. ROOT edge cases. Review 2.

5c DIVINE_SHIELD
- [ ] 10. Damage nullified and state consumed.
- [ ] 11. DIVINE_SHIELD edge cases. Review 3.

5d POISON and REGEN
- [ ] 12. `upkeep`.
- [ ] 13. Timeline test.
- [ ] 14. Coordinator wiring and game over. Review 4.

5e HASTE and SLOW
- [ ] 15. Sort key with the SPEED sign.
- [ ] 16. Re-sort of the unresolved entries after each step.
- [ ] 17. Guards.
- [ ] 18. Wording of the old "computed once". Review 5.

6 roster
- [ ] 19. Add or replace the placeholders (check-in).
- [ ] 20. Templates and catalog tests. Review 6.

Client and docs
- [ ] 21. Client mirror.
- [ ] 22. Docs to current behavior.
