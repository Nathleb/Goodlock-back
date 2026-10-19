# Four of six — plan

**Status:** approved 2026-10-19, in progress

Design: `design.md` in this folder. TDD, one commit per step.

- [x] 0. Feature docs (this folder).
- [ ] 1. Sizes: `DECK_SIZE = 6`, `TEAM_SIZE = 4` (`src/domain/services/Deck.service.ts`); DTO validation and starter deck follow the constants.
- [ ] 2. Defeat: `hasLost` at 2 dead (`LOSS_DEATHS`).
- [ ] 3. Board: `BOARD_SIZE = 5` shared by target resolution; `createPlayer` puts the 4 characters on slots 0..3, slot 4 empty.
- [ ] 4. Swap by `position.slot`: occupant + empty moves, two empties fizzle, two occupants exchange.
- [ ] 5. Domain placement `placeTeam(player, slots)` replacing `rearrangeTeam`, with validation.
- [ ] 6. Coordinator + gateway: `rearrangeTeam` takes `{ slots }` and delegates to `placeTeam`.
- [ ] 7. Prisma migration dropping `DeckSlot` rows at position >= 6; schema comment 0..5; applied locally.
- [ ] 8. Docs (`CLAUDE.md`, `README.md`, `docs/ROADMAP.md`), feature folder to `implemented/`, memory.

Client follow-up (Goodlock-app): bot keeps 4 and sends `{ slots }`, regenerate `test/fixtures/round_resolved.json`; then forced landscape as its own feature.
