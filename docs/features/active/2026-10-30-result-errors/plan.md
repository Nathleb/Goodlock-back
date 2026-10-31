# Result-based error handling — plan

**Status:** in progress (started 2026-10-30)

Each slice: write the new tests first and watch them fail, then change the code until `tsc` is green, then run `npm run test`, `npm run lint:check`, `npx tsc --noEmit` and `npm run build`, and make one commit that also ticks its checkbox. Existing tests are changed only as listed in the approved plan (`toThrow` assertions on migrated functions, the emitted `error` payload gaining `code`, happy-path calls going through `unwrap`); each file's before/after is shown to the user first.

- [x] **J0a foundation, shared**: `neverthrow` dependency, `shared/result.type.ts` re-export, `tests/helpers/result.ts` (`unwrap`, `unwrapErr`). Test first: `tests/Result.spec.ts` (the re-export builds and unwraps an ok and an err).
- [x] **J0b foundation, domain**: `domain/errors/DomainError.ts` (type, code union, `domainError` builder). Test first: `tests/DomainError.spec.ts`.
- [x] **J0c foundation, application**: `application/dtos/Error.dto.ts` and `application/errors/toErrorPayload.ts`. Test first: a `DomainError` becomes `{ code, message }`; a thrown `TypeError` is logged and becomes `INTERNAL` with the message "Internal error".
- [x] **J1 placement path**: `placeTeam`, `assertPhase`/`assertNotReady`, `confirmPlacement`, `cancelPlacement` and their `GameCoordinatorService` methods (`rearrangeTeam`, `confirmPlacement`, `cancelPlacement`).
- [x] **J2 selection path**: `confirmSelection`, `cancelSelection` and their coordinator methods.
- [x] **J3 keep, roll, resolve path**: `performRoll`, `confirmKeep`, `cancelKeep`, `performResolve` and their coordinator methods (the M8 `Array.isArray` guard stays as defence for a direct call, now reporting `INVALID_LOCK`; the gateway pipe already refuses a non-array as `INVALID_REQUEST`).
- [x] **J4 rooms**: `addPlayerToRoom`, `startRoom`, `selectDeckInRoom`, `assertDecksSelected` (renamed `selectedDecks`), `room.manager` (`ROOM_NOT_FOUND`), the `RoomPort` methods, `RoomCoordinatorService`, `GameCoordinatorService.startGame`.
- [x] **J5 claim and context**: `evaluateClaim` returns a Result; `getContext` returns a Result (`ACTION_NOT_AVAILABLE`), replacing the eight copies of the `if (!ctx)` emit.
- [x] **J6 boundaries**: coordinators keep a `try/catch` only for unexpected errors; `WsErrorFilter` maps `WsException` to `INVALID_REQUEST` and anything else to `INTERNAL`; `SessionGuard` is `NOT_CONNECTED`. Test first: gateway spec on a real socket, one case per kind.
- [ ] **J7 protocol and client**: `code` in `ErrorPayload` and in `ServerEvents` + `npm run protocol:schema` (they exist on `feat/protocol-schema`, not on `main`: settle the merge order with the user), mirror in Goodlock-app by a `sonnet` subagent in its own worktree.
- [x] **J8 docs**: CLAUDE.md "Errors" and "Result over exceptions" rewritten to what is true; implemented specs that quote error messages are checked; memory updated.
- [ ] **Review and PR**: FULL `reviewer` (this spec, `main...HEAD`, Stryker survivors of the touched files), fixes, blockers report, push, PR. At the end, `git mv` this folder to `implemented/` and set the status line.
