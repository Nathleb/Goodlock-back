# Match entry: deck choice and team preview — design

**Status:** implemented 2026-10-12

Slice **C** of three (A: catalog + collection, B: decks, C: match entry). Matchmaking queue, items and deck-based lobby browsing are out of scope: rooms work as before.

## Purpose

A match is played from the players' decks, with a **team preview**: both 6-character decks are revealed, then each player secretly keeps 4.

## Flow

```
lobby (room)         selectDeck(deckId) by each player, required before start
startGame (owner)    -> SELECTION_PHASE: both 6-character decks revealed to both players
confirmSelection     each player secretly keeps 4 of their 6 (cancelSelection to change)
both confirmed       -> PLACEMENT_PHASE with the 4 picks (pick order = slots 0..3, slot 4 empty)
                        the opponent's team stays hidden
rearrangeTeam ... confirmPlacement
both confirmed       -> ROLL: first room-wide state, both teams revealed
```

## Decisions

1. **Decision:** the deck is chosen **in the room before start** (`selectDeck`), and start is refused until both players have chosen, rather than always using the first deck, because choosing a deck is the point of having several. The client pre-selects the first deck.
2. **Decision:** the chosen deck is **loaded from the database at selection time and snapshotted in the in-memory room** (the 6 catalog ids), rather than loaded at `startGame`, because it keeps `startGame` and the whole game coordinator synchronous; the only `await` on the WebSocket path lives in the lobby handler. Editing the deck afterwards does not affect the snapshot; re-sending `selectDeck` refreshes it.
3. **Decision:** the opponent's 4 picks stay **hidden until combat** (the first ROLL) rather than visible at placement. During SELECTION and PLACEMENT the viewer receives the opponent's team as `[]`; the opponent's revealed deck is the only information.
4. **Decision:** SELECTION behaves like the other confirm phases: confirm, cancel, the first confirm is not announced to the opponent, and the AFK claim applies.
5. **Decision:** selection state lives in `GameState` (`phase: SELECTION`, `selection: { decks, picks }`) rather than in the room, so presence, AFK timers, concede and reconnect snapshots work unchanged.

## Domain

- `GamePhase.SELECTION = "SELECTION_PHASE"`; `TEAM_SIZE = 4` next to `DECK_SIZE = 6` in `Deck.service.ts`.
- `GameState.selection?: { decks: [CharacterTemplate[], CharacterTemplate[]]; picks: [CatalogId[] | null, CatalogId[] | null] }`, present only during SELECTION.
- `createSelectionState(decks)` -> SELECTION, empty teams, `rollsLeft: 2`, round 0.
- `confirmSelection(gs, playerIndex, picks, build)`: phase SELECTION, not already ready, exactly `TEAM_SIZE` distinct ids from the player's own revealed deck. Stores the pick and marks ready; when both are ready, builds both teams with `build(template)` in pick order (`createPlayer` puts them on slots 0..3), goes to PLACEMENT, clears `selection`, resets ready.
- `cancelSelection(gs, playerIndex)`: un-ready and clear the pick.
- Room: `deckSelections` (session id -> catalog ids) set by `selectDeckInRoom` (member only, game not started) and dropped when the player leaves; `selectedDecks(room)` (a `Result`, `DECKS_NOT_CHOSEN` until both players chose) is used at start.
- Claim: SELECTION is one of the AFK confirm phases (see the reconnect-lifecycle spec).

## Application

- `DeckCoordinatorService.getOwnDeckCharacterIds(userId, deckId)` (404 for a missing or someone else's deck).
- `RoomCoordinatorService.selectDeck(socketId, deckId)` (async): loads the deck, then **re-reads the session** (the player may have left the room during the await) before storing the snapshot; emits `roomUpdated`. `RoomDTO.players[].hasDeck` tells both players who is ready without revealing decks. Errors go back as `error`.
- `GameCoordinatorService.startGame`: owner only, room ready, both deck snapshots required (otherwise `Both players must choose a deck`); builds the selection state from the catalog and emits a per-viewer view to each player.
- `confirmSelection(socketId, characterIds)` and `cancelSelection(socketId)`: the input is checked to be an array of strings (the gateway's class-validator payload is not relied on alone); the first confirm only echoes the picker's own view; when SELECTION completes, each player gets a per-viewer PLACEMENT view.
- `GameStateMapper`: during SELECTION the viewer gets `selection: { decks: [CatalogCharacterDTO[], CatalogCharacterDTO[]], myPicks }` (the opponent's picks are never sent); during PLACEMENT the opponent's team is `[]`. This also holds for the reconnect snapshot (`toDTOForViewer`). `CatalogCharacterDTO` (id, name, maxHp, baseSpeed, baseDie) is shared with `CollectionCharacterDTO`.

## WebSocket protocol

| Event (client -> server) | Payload | Phase |
|---|---|---|
| `selectDeck` | `{ deckId }` | lobby |
| `confirmSelection` | `{ characterIds: string[] }` (catalog ids, `TEAM_SIZE` of them) | SELECTION |
| `cancelSelection` | none | SELECTION |

`startGame` fails with an error until both players have selected a deck. `roomUpdated` carries `players[].hasDeck`. `gameStateUpdated` carries `phase: "SELECTION_PHASE"` and `selection` during SELECTION, and in PLACEMENT the opponent's `team` is empty.

## Tests

Domain first (selection rules, room deck snapshot, claim phases), then mapper masking (no pick or opponent team ever leaks before ROLL, including the reconnect snapshot, with a JSON-level check that the opponent's pick ids appear nowhere in the viewer payload), then the coordinators (including the async `selectDeck` race: player left during the await), then gateway wiring.
