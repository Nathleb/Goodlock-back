# Plan — Match entry: deck choice + team preview (slice C)

**Status:** implemented 2026-10-12

## Context

Spec: `docs/features/implemented/2026-10-12-match-entry/design.md` (written this session; user decisions: deck chosen in the room before start; opponent's 5 picks hidden until combat). Today `GameCoordinator.startGame` deals 10 random catalog characters straight into PLACEMENT. After this slice: lobby `selectDeck` → start → **SELECTION** (both 7-decks revealed, each secretly keeps 5) → PLACEMENT (opponent hidden) → ROLL (first room-wide state, reveal).

Approved 2026-10-12. Steps are ticked as they land.

**Risk, stated up front:** this changes the WebSocket protocol; the current frontend can no longer start a match until it sends `selectDeck` and handles `SELECTION_PHASE`. Backend only in this plan.

Reuse: confirm/cancel helpers in `src/domain/services/GameLoop.service.ts` (`markPlayerReady`, `resetReady`, …), `createPlayer` (`Player.service.ts`, assigns slots), `createCharacterFromTemplate`, `GameStateMapper.toDTOForViewer` / `toDTOForPlacement` (every PLACEMENT emission already goes through them, incl. the reconnect snapshot in `SessionCoordinator.service.ts`), `CollectionMapper` die mapping, `DeckCoordinatorService.findOwnDeck`, `RoomManager.updateGameState` (stamps `phaseStartedAt` on phase change, so timers work for SELECTION).

## Steps (each = failing test → code → green → one commit)

### Domain
- [x] 1. **Selection rules** — `GamePhase.SELECTION`, `TEAM_SIZE = 5` in `Deck.service.ts`, `GameState.selection?`; in `GameLoop.service.ts`: `createSelectionState(decks)`, `confirmSelection(gs, pi, picks, build)`, `cancelSelection(gs, pi)` (rules per spec). Tests in a new `tests/TeamSelection.spec.ts`: wrong phase, already ready, not 5 / duplicates / id not in own deck, first confirm only marks ready, both → PLACEMENT with teams in pick order and `selection` cleared, cancel clears pick.
- [x] 2. **Room deck snapshot** — `Room.deckSelections`, `selectDeckInRoom`, `assertDecksSelected`, selection dropped in `removePlayerFromRoom` (`Room.service.ts`); `RoomPort.setDeckSelection` + `RoomManager`. Tests in `tests/Room.service.spec.ts` and `tests/RoomManager.lifecycle.spec.ts`.
- [x] 3. **AFK claim covers SELECTION** — add to `CONFIRM_PHASES` in `Claim.service.ts`; tests in `tests/Claim.service.spec.ts`.

### Mapping (no leaks)
- [x] 4. **`CatalogCharacterDTO` + `CatalogMapper`** — extract template → DTO from `CollectionMapper` (which keeps adding `acquiredAt`); existing collection tests stay green.
- [x] 5. **Viewer masking** — `toDTOForViewer` in SELECTION: `selection: { decks, myPicks }`, opponent pick never present; `toDTOForPlacement`: opponent team `[]`. `RoomDTO.players[].hasDeck` in `RoomMapper`. Tests in `tests/GameStateMapper.viewer.spec.ts` (update the placement test that expected a sorted enemy team) + a JSON-level assertion that the opponent's pick ids appear nowhere in the viewer payload.

### Coordinators
- [x] 6. **`selectDeck`** — `DeckCoordinatorService.getOwnDeckCharacterIds`; `RoomCoordinatorService.selectDeck(socketId, deckId)` async: load, re-read room, refuse if player left / game started, store, emit `roomUpdated`; errors → `error` event. RoomCoordinator gets `DeckCoordinatorService` (already exported by `DeckModule`, imported by `AppModule`). Tests in `tests/RoomCoordinator.service.spec.ts`, incl. the two await races.
- [x] 7. **`startGame` → SELECTION** — require both snapshots, templates from `CATALOG_PORT`, per-viewer emit. Rewrite the slice-A startGame tests in `tests/GameCoordinator.service.spec.ts` / `.claim.spec.ts` (decks now come from the room).
- [x] 8. **`confirmSelection` / `cancelSelection`** in `GameCoordinatorService` — first confirm echoes to self only; completion sends a per-viewer PLACEMENT view to each player; input checked as an array of strings. Tests in `tests/GameCoordinator.service.spec.ts`, incl. "opponent never receives my pick".

### Gateway
- [x] 9. **Events** — `selectDeck`, `confirmSelection`, `cancelSelection` in `session.gateway.ts` with payload types next to the existing ones; existing gateway/guard tests patterns.

### Wrap-up
- [x] 10. **Docs + memory** — `CLAUDE.md` (phases now SELECTION → PLACEMENT → ROLL → KEEP → RESOLVE → RESULT, new events), spec → implemented + notes, memory entry (frontend must catch up), Decision lines.

## Verification

- `npm run test`, `npm run lint`, `npm run build` green; throwaway `AppModule` smoke compile (as in slices A/B).
- End-to-end needs Postgres + a client able to send the new events (user-side): two accounts → both `selectDeck` → `startGame` → each sees both 7-decks → `confirmSelection` → PLACEMENT shows own 5, opponent empty → both confirm → ROLL shows both teams.
