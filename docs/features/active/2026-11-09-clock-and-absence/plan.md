# Clock and absence — plan

Stacked on `fix/roll-4`, `fix/meta-rules`, `fix/game-9-no-ready-indicator` and `fix/death-and-match-end` (the mapper, the DTO and the game loop are shared). Each step: rule tests first (red, titles citing the rule IDs), minimum code, `npx jest --maxWorkers=2` + `npx tsc --noEmit` + `npm run lint:check` green, one commit. Existing tests that assert the claim system are rewritten or removed with it (authorized by the user on 2026-11-09).

- [x] **1 domain, CLOCK-1..3, AWAY-2, AWAY-3, SEL-1** (`check:dead` is red from here to step 5: the clock functions are used by tests only until the coordinators call them): `PlayerClock`, `GameState.clocks` / `clockUpdatedAt`, `Clock.service` (`settleClocks`, `setConnected`, `nextExpiry`, `expireClocks`), `createSelectionState(decks, now)`.
- [ ] **2 domain, KEEP-4 + END-3 + AWAY-1**: increment in `confirmKeep`, `GameState.endReason`, `concede`.
- [ ] **3 domain, remove the claim system**: `Claim.service`, `Claim.type`, `Room.presence`, `phaseStartedAt`, `setPresenceInRoom`, `PlayerPresence`.
- [ ] **4 application, ports and DTOs**: `MatchTimerPort`, `RoomPort` without `setPresence`, `clocks` in the DTO and mapper, `presenceChanged`, `GameOverDTO.reason`.
- [ ] **5 application, coordinators**: settle on every action, reschedule, `expire`, `concede`, presence through the clocks, close the room after `gameOver` (ROOM-6).
- [ ] **6 infrastructure**: gateway (`concede` in, `claimVictory` out, payload validation case), `NodeMatchTimer`, module wiring, remove the claim config and the sweeper; `npm run protocol:schema`.
- [ ] **7 client**: mirror the protocol in Goodlock-app (subagent).
- [ ] **8 finish**: gates, mutation on the touched files, docs, delete this folder.
