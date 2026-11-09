# Death and match end — plan

Each step: rule tests first (red, titles citing the rule ID), minimum code, `npm run test` + `npx tsc --noEmit` + `npm run lint:check` green, one commit. Existing tests that assert the old behavior are rewritten to state the rule (authorized by the user on 2026-11-09).

- [ ] **1 domain, DEAD-1 + GAME-4**: `Player.fallen`; a killed character leaves the board after the cell application that killed it; `hasLost` counts `fallen`. Rewrite the tests that keep a dead character on the board.
- [ ] **2 domain, END-1 + END-2 + DEAD-3 in Resolve**: per-effect death check, author loses on a double second death, resolution stops; an acting character that dies stops its action; `GameState.winner`, `checkWinner` without draw.
- [ ] **3 domain, UPK-1 + END-2 in Upkeep**: one character at a time in the PRIO order without the bracket; a death check after each.
- [ ] **4 application, protocol**: `GameOverDTO.winner` without draw, `PlayerGameStateDTO.fallen`, coordinator reads `winner`; `npm run protocol:schema`.
- [ ] **5 client**: mirror the protocol in Goodlock-app.
- [ ] **6 finish**: quality gates, mutation on the touched files, docs (GLOSSARY, CLAUDE.md lines made false), delete this folder.
