# Four of six: deck of 6, team of 4, a 5-cell board with one empty cell — design

**Status:** implemented 2026-10-19

## Rules

- A deck holds **6** characters (`DECK_SIZE`). At team preview each player secretly keeps **4** (`TEAM_SIZE`).
- Each side of the board has **5 cells** (`BOARD_SIZE`); one of them is **empty**.
- The empty cell is **chosen at placement**: the player lays out 4 characters on 5 cells. `createPlayer` initially puts the team on slots 0..3 (pick order) with slot 4 empty, and `rearrangeTeam` moves them.
- **Swap** onto the empty cell **moves** the character, so the hole travels during the match. Swap between two empty cells fizzles; between two occupied cells it exchanges them.
- Effects resolve **cell by cell**. An empty cell does nothing; the other cells of the pattern still apply (a cleave still hits the neighbours). Each effect decides what an empty cell means for it (a future lifesteal would not proc on it; other effects may resolve partially).
- A player **loses with 2 dead** characters out of 4 (`LOSS_DEATHS`). Both sides losing in the same round is a draw.
- Decks stored with more than 6 characters were truncated to 6 by a migration (the slot at position 6 was dropped); `DeckSlot.position` is 0..5.

## Model

Decision: `team` is an array of 4 `Character` whose `position.slot` (0..4) is the only truth, rather than an array of 5 with `null`, because the effects (`applyAtPositions`), the mapper and the client look characters up by `position.slot`; nothing may assume "array index = slot". Swap and placement look characters up by slot too.

`resolveTargets` keeps empty cells (it only drops off-board ones), so a `ResolveStep` lists the empty cell as a target and the client can show the fizzle there.

## Placement

Domain `placeTeam(player, slots)` (`Player.service.ts`) validates the layout and returns the team ordered by slot: `slots` must have exactly `BOARD_SIZE` entries, each team character exactly once, and `null` for the empty cells; unknown or duplicate ids are rejected.

## Protocol

`rearrangeTeam` takes `{ slots: (string | null)[] }`: 5 entries read like the board, exactly one `null`, each team character exactly once. The coordinator checks the phase and that the player has not confirmed, then delegates to `placeTeam`. DTOs carry `position: { playerIndex, slot }` for every character.

## Out of scope

Forced landscape and the other client adaptations belong to the client (Goodlock-app).
