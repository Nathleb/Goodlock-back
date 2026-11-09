# Clock and absence — plan

Stacked on `fix/roll-4`, `fix/meta-rules`, `fix/game-9-no-ready-indicator` and `fix/death-and-match-end` (the mapper, the DTO and the game loop are shared). Each step: rule tests first (red, titles citing the rule IDs), minimum code, `npx jest --maxWorkers=2` + `npx tsc --noEmit` + `npm run lint:check` green, one commit. Existing tests that assert the claim system are rewritten or removed with it (authorized by the user on 2026-11-09).

- [x] **1 domain, CLOCK-1..3, AWAY-2, AWAY-3, SEL-1** (`check:dead` is red from here to step 5: the clock functions are used by tests only until the coordinators call them): `PlayerClock`, `GameState.clocks` / `clockUpdatedAt`, `Clock.service` (`settleClocks`, `setConnected`, `nextExpiry`, `expireClocks`), `createSelectionState(decks, now)`.
- [x] **2 domain, KEEP-4 + END-3 + AWAY-1**: increment in `confirmKeep`, `GameState.endReason`, `concede`.
- [x] **3 ports and adapters, additive** (the old and the new coexist, so each commit compiles): `MatchTimerPort` and `NodeMatchTimer`; `RoomPort.closeRoom` and `RoomManager.closeRoom`.
- [x] **4 application and wiring** (one commit: the new `MatchLifecycleService` is injected in the three coordinators, so the Nest module and the gateway change with it, or nothing compiles): `MatchLifecycleService` (settle, schedule, expire, concede, connection changes, finish and close the room); `clocks` in the DTO and mapper, `presenceChanged { reconnectionMs }`, `GameOverDTO.reason`; coordinators settle on every action and reschedule, presence goes through the clocks, `concede` event in the gateway in place of `claimVictory`, the room closes after `gameOver` (ROOM-6); module wiring; `claim.config`, `CLAIM_CONFIG`, `RoomPort.setPresence` and `checkWinner` removed from use; `npm run protocol:schema`.
- [ ] **5 infrastructure, removal**: the sweeper, `RoomManager.setPresence`, `phaseStartedAt` and its stamping.
- [ ] **6 domain, removal**: `Claim.service`, `Claim.type`, `Room.presence`, `phaseStartedAt`, `setPresenceInRoom`, `PlayerPresence`, the `CLAIM_NOT_ALLOWED` code.
- [ ] **7 client**: mirror the protocol in Goodlock-app (subagent).
- [ ] **8 finish**: gates, mutation on the touched files, docs, delete this folder.
