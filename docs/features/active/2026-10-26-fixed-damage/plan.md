# FixedDamage — plan

**Status:** approved 2026-10-26, in progress.

Layer: domain only (label, strategy, registration), plus one template and docs. Each step: red test seen failing first, minimum code, tests green, one commit.

- [x] 0. Docs: this spec and plan; initiative marked done in the umbrella section 9.
- [x] 1. Domain, the strategy: `tests/FixedDamage.spec.ts` (HP lowered by the full magnitude, shield untouched), then `EffectLabel.FixedDamage` and `strategies/FixedDamage.class.ts`. Then one test per behavior: empty cell, repeated cell, dead occupant, ALLY cell.
- [x] 2. Domain, registration: a face generated from a `FixedDamage` entry (`CharacterGeneration.service.spec.ts`), then `buildEffectFactory()`; factory test in `EffectFactory.spec.ts`.
- [x] 3. Template: `tests/templates.spec.ts` allowed list extended with `FixedDamage` (extension only), `tmplt/Alicent.json` self-cost becomes `FixedDamage`.
- [ ] 4. Client mirror in Goodlock-app (subagent, after feat/initiative is merged there): colour and hostile flag.
- [x] 5. Docs to current behavior: `docs/GAME-DESIGN.md`.

After the steps: FULL review, implemented/, memory, push and PR.
