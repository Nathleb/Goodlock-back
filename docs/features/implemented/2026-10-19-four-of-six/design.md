# Four of six: deck of 6, team of 4, a 5-cell board with one empty cell — design

**Status:** implemented 2026-10-19 (client follow-up pending in Goodlock-app)

## Rules

- A deck holds **6** characters (was 7). At team preview each player secretly keeps **4** (was 5).
- Each side of the board keeps **5 cells**; one of them is **empty**.
- The empty cell is **chosen at placement**: the player lays out 4 characters on 5 cells.
- **Swap** onto the empty cell **moves** the character, so the hole travels during the match. Swap between two empty cells fizzles; between two occupied cells it exchanges them as before.
- Effects resolve **cell by cell**. An empty cell does nothing; the other cells of the pattern still apply (a cleave still hits the neighbours). Each effect decides what an empty cell means for it (a future lifesteal would not proc on it; other effects may resolve partially).
- A player **loses with 2 dead** characters out of 4 (was 3 out of 5). Both sides losing in the same round is still a draw.
- Decks already stored with 7 characters are **truncated to 6** (the slot at position 6 is dropped).

## Model

Decision: `team` stays an array of 4 `Character` whose `position.slot` (0..4) is the only truth, rather than an array of 5 with `null`, because the effects (`applyAtPositions`), the mapper and the client already look characters up by `position.slot`; only Swap and placement still assumed "index = slot".

`resolveTargets` already keeps empty cells (it only drops off-board ones), so a `ResolveStep` lists the empty cell as a target and the client can show the fizzle there.

## Protocol

`rearrangeTeam` payload changes from `{ characterIds: string[] }` (5 ordered ids) to `{ slots: (string | null)[] }`: 5 entries read like the board, exactly one `null`, each team character exactly once. Everything else is unchanged; DTOs already carry `position: { playerIndex, slot }`.

## Out of scope

- Forced landscape for the client (Goodlock-app), a separate feature.
- Client adaptation (bot keeps 4, new placement payload, regenerated fixture) follows the backend.
