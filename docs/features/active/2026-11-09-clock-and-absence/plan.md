# Clock and absence — plan

Stacked on `fix/roll-4`, `fix/meta-rules`, `fix/game-9-no-ready-indicator` and `fix/death-and-match-end` (the mapper, the DTO and the game loop are shared). Each step: rule tests first (red, titles citing the rule IDs), minimum code, `npx jest --maxWorkers=2` + `npx tsc --noEmit` + `npm run lint:check` green, one commit. Existing tests that assert the claim system are rewritten or removed with it (authorized by the user on 2026-11-09).

- [x] **1 domain, CLOCK-1..3, AWAY-2, AWAY-3, SEL-1** (`check:dead` is red from here to step 5: the clock functions are used by tests only until the coordinators call them): `PlayerClock`, `GameState.clocks` / `clockUpdatedAt`, `Clock.service` (`settleClocks`, `setConnected`, `nextExpiry`, `expireClocks`), `createSelectionState(decks, now)`.
- [x] **2 domain, KEEP-4 + END-3 + AWAY-1**: increment in `confirmKeep`, `GameState.endReason`, `concede`.
- [x] **3 ports and adapters, additive** (the old and the new coexist, so each commit compiles): `MatchTimerPort` and `NodeMatchTimer`; `RoomPort.closeRoom` and `RoomManager.closeRoom`.
- [ ] **4 application, coordinators and DTOs**: `clocks` in the DTO and mapper, `presenceChanged { reconnectionMs }`, `GameOverDTO.reason`; settle on every action, reschedule from `nextExpiry`, `expire`, `concede`, presence through the clocks, the room closed after `gameOver` (ROOM-6); `claimVictory`, `CLAIM_CONFIG` and `RoomPort.setPresence` leave the application layer.
- [ ] **5 infrastructure, wiring and removal**: gateway (`concede` in, `claimVictory` out, payload validation case), module wiring of the timer, `claim.config`, the sweeper, `RoomManager.setPresence` and `phaseStartedAt` removed; `npm run protocol:schema`.
- [ ] **6 domain, removal**: `Claim.service`, `Claim.type`, `Room.presence`, `phaseStartedAt`, `setPresenceInRoom`, `PlayerPresence`, the `CLAIM_NOT_ALLOWED` code.
- [ ] **7 client**: mirror the protocol in Goodlock-app (subagent).
- [ ] **8 finish**: gates, mutation on the touched files, docs, delete this folder.
