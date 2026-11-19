# Effect parts: plan

One commit per step, tests green at each. A test that states a rule is proposed to the user and
written once validated. A change to an existing test is shown to the user first.

- [x] 1. **Domain: faces carry parts.** Types, generation, `tmplt/*.json` rewritten as single-part
  effects, resolution looping over `parts`. Red test: a template effect with two parts yields a
  face effect with those two parts in order. Existing tests adapted in shape only. The two mappers
  are touched just enough to compile and still emit the current wire shape (accepted exception to
  "one layer per step").
- [x] 2. **Domain: SWAP-1.** Catalog load refuses a Swap that shares its effect.
- [x] 3. **Domain: SEQ-1, TGT-2.** The effect applier: parts in order on each cell; a cell named
  twice receives the whole effect twice.
- [x] 4. **Domain: DEAD-1, DEAD-3.** Deaths settle once the effect has applied. Upkeep unchanged.
  The tests and comments that state the old "at once" text are fixed here.
- [x] 5. **Domain: STATE-6, DMG-1.** Divine Shield nullifies the whole effect on the character.
- [x] 6. **Domain: RES-2.** The log lists the parts of each effect.
- [ ] 7. **Application: protocol.** DTOs, mappers, regenerated `protocol/protocol.schema.json`,
  `docs/GLOSSARY.md`, the "Add an effect" task and design rule 6 of `CLAUDE.md`.
- [ ] 8. **Client mirror** in `../Goodlock-app` on its own branch: models, glyph and tile, playback,
  fixtures, synced schema. Display stays one glyph per part.

Verify before done: `npm run test`, `npm run lint:check`, `npx tsc --noEmit`, `npm run build`,
`npm run quality`, `npm run test:mutation` on the feature code.
