# Death and match end — plan

Each step: rule tests first (red, titles citing the rule ID), minimum code, `npm run test` + `npx tsc --noEmit` + `npm run lint:check` green, one commit. Existing tests that assert the old behavior are rewritten to state the rule (authorized by the user on 2026-11-09).

- [x] **1 domain, DEAD-1 + DEAD-3 + GAME-4**: `Player.fallen`; a killed character leaves the board after the cell application that killed it (also from Upkeep poison); `hasLost` counts `fallen`; an actor that dies during its own action stops it (the loop would otherwise crash on a missing actor). Tests that kept a dead character on the board are rewritten.
- [x] **2 domain, END-1 + END-2 + UPK-1** (steps 2 and 3 in one commit: the start-of-round effects decide the match like the resolution does, so the coordinator tests need both): `GameState.winner`, `checkMatchEnd` (the author loses when both players reach 2 deaths), `checkWinner` without draw; the resolution stops at the effect that ends the match; Upkeep applies Poison and Regen one character at a time in the resolution order without the bracket (`startOfRoundOrder`), with a death check after each.
- [x] **3 application, protocol**: `GameOverDTO.winner` without draw, `PlayerGameStateDTO.fallen`, coordinator reads `winner`; `npm run protocol:schema`.
- [ ] **4 client**: mirror the protocol in Goodlock-app.
- [ ] **5 finish**: quality gates, mutation on the touched files, docs (GLOSSARY, CLAUDE.md lines made false), delete this folder.
