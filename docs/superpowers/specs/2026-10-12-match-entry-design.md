# Match entry: deck choice and team preview — design

Date: 2026-10-12
Status: validated, ready for planning
Slice: **C** of three (A: catalog + collection — done, B: decks — done, C: match entry). Matchmaking queue,
items and deck-based lobby browsing are out of scope: rooms stay as they are.

## Problem

Matches still deal 10 random catalog characters. Players now own decks of 7 (slice B); a match should be
played from them, with a **team preview**: both decks are revealed, each player secretly keeps 5.

## Flow

```
lobby (room)         selectDeck(deckId) by each player — required before start
startGame (owner)    -> SELECTION_PHASE: both 7-character decks revealed to both players
confirmSelection     each player secretly picks 5 of their 7 (cancelSelection to change)
both confirmed       -> PLACEMENT_PHASE with the 5 picks (pick order = initial slots)
                        the opponent's team stays hidden
both confirm placement -> ROLL: first room-wide state, both teams revealed (unchanged from today)
```

## Decisions

1. **Decision:** the deck is chosen **in the room before start** (`selectDeck`), and start is refused until
   both players have chosen, rather than always using the first deck, because choosing a deck is the point
   of having several. The frontend pre-selects the first deck.
2. **Decision:** the chosen deck is **loaded from the database at selection time and snapshotted in the
   in-memory room** (the 7 catalog ids), rather than loaded at `startGame`, because it keeps `startGame` and
   the whole game coordinator synchronous; the only `await` lives in the lobby handler. Editing the deck
   afterwards does not affect the snapshot; re-sending `selectDeck` refreshes it.
3. **Decision:** the opponent's 5 picks stay **hidden until combat** (the first ROLL), per the user, rather
   than visible at placement. During SELECTION and PLACEMENT the viewer receives the opponent's team as
   `[]`; the opponent's revealed 7-deck is the only information.
4. **Decision:** SELECTION behaves like the other confirm phases: confirm, cancel, the first confirm is not
   announced to the opponent, and the AFK claim applies.
5. **Decision:** selection state lives in `GameState` (`phase: SELECTION`, `selection: { decks, picks }`),
   rather than in the room, so presence, AFK timers, concede and reconnect snapshots work unchanged.

## Domain

- `GamePhase.SELECTION = "SELECTION_PHASE"`; `TEAM_SIZE = 5` next to `DECK_SIZE` in `Deck.service.ts`.
- `GameState.selection?: { decks: [CharacterTemplate[7], CharacterTemplate[7]]; picks: [CatalogId[] | null, CatalogId[] | null] }`,
  present only during SELECTION.
- `createSelectionState(decks)` → SELECTION, empty teams, `rollsLeft: 2`, round 0.
- `confirmSelection(gs, playerIndex, picks, build)`: phase SELECTION, not already ready, exactly 5 distinct
  ids from the player's own revealed deck. Stores the pick and marks ready; when both are ready, builds both
  teams with `build(template)` in pick order, goes to PLACEMENT, clears `selection`, resets ready.
- `cancelSelection(gs, playerIndex)`: un-ready, clears the pick.
- Room: `deckSelections` (session id → 7 catalog ids), set by `selectDeckInRoom` (member only, not
  started), dropped when the player leaves; `assertDecksSelected(room)` used at start.
- Claim: SELECTION joins the AFK confirm phases.

## Application

- `DeckCoordinatorService.getOwnDeckCharacterIds(userId, deckId)` (404 for missing / someone else's).
- `RoomCoordinatorService.selectDeck(socketId, deckId)` (async): loads the deck, then **re-reads the room**
  (the player may have left or the game started during the await) before storing the snapshot; emits
  `roomUpdated`. `RoomDTO.players[].hasDeck` tells both players who is ready, without revealing decks.
- `GameCoordinatorService.startGame`: requires both deck snapshots, builds the selection state from the
  catalog, emits a per-viewer view to each player. New `confirmSelection(socketId, characterIds)` and
  `cancelSelection(socketId)`; when SELECTION completes, each player gets a per-viewer PLACEMENT view.
- `GameStateMapper`: during SELECTION the viewer gets `selection: { decks: [CatalogCharacterDTO[], CatalogCharacterDTO[]], myPicks }`
  (opponent's picks never sent); during PLACEMENT the opponent's team is `[]`.
  `CatalogCharacterDTO` (id, name, maxHp, baseSpeed, baseDie) is shared with `CollectionCharacterDTO`.

## WebSocket protocol changes

| Event (client → server) | Payload | Phase |
|---|---|---|
| `selectDeck` | `{ deckId }` | lobby |
| `confirmSelection` | `{ characterIds: string[5] }` (catalog ids) | SELECTION |
| `cancelSelection` | — | SELECTION |

`startGame` now fails with an error until both players have selected a deck; `roomUpdated` gains
`players[].hasDeck`; `gameStateUpdated` gains `phase: "SELECTION_PHASE"` and `selection`; in PLACEMENT the
opponent's `team` is empty. **The current frontend cannot start a match until it handles these.**

## Testing strategy

Domain first (selection rules, room deck snapshot, claim phases), then mapper masking (no pick or opponent
team ever leaks before ROLL, including the reconnect snapshot), then coordinators (async `selectDeck` race:
player left / game started during the await), then gateway wiring.
