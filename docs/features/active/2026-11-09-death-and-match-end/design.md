# Death and match end — design

Rules implemented (rules reference `../Goodlock-specs/GAME-DESIGN.md`): DEAD-1, DEAD-3, GAME-4, END-1, END-2, UPK-1.

## Gaps closed

- A dead character stays in its cell (hp 0): DEAD-1 says it leaves the board at once and its cell becomes empty.
- Deaths are checked once, after the whole Resolve (and after the whole Upkeep), and both players losing together is a draw. END-2 checks after each effect, the first player to a second death loses, and when one effect gives both players their second death, its author loses. There is no draw (END-1).
- The round goes on after a player has lost: END-1 ends the match at once.
- An acting character killed by its own face goes on applying the face: DEAD-3 stops the action.
- Upkeep applies Poison and Regen to every character at once: UPK-1 applies them one character at a time, in the resolution order without the bracket (Speed state, base speed, initiative token, cell).

## Model

- `Player.fallen?: readonly Character[]`: the characters of the player who died, in order of death. Absent means nobody died (optional so that the many test fixtures building a `Player` stay valid). A character whose HP reaches 0 is moved from `team` to `fallen` right after the cell application that killed it (`applyAtPositions`), and after the Poison that killed it in Upkeep. `hasLost` counts `fallen`.
- `GameState.winner?: PlayerIndex`: set by Resolve or Upkeep when a player loses; the resolution stops there. `checkWinner` reads it and returns `0 | 1 | null` (no draw).
- Resolution: after each effect, losers are checked. One loser: the other player wins. Both: the author of the effect loses. Then the loop stops; the log ends with the action that ended the match (its effects up to the deciding one). If the acting character is no longer on the board after an effect, its action stops (DEAD-3).
- Upkeep: order of characters by the PRIO keys without the bracket (shared with the resolution sort), one character at a time; a death check after each.

## Protocol

- `GameOverDTO.winner` becomes `0 | 1` (no `'draw'`).
- `PlayerGameStateDTO` gains `fallen: CharacterDTO[]` so the client can show who died.
- Mirrored in Goodlock-app (`lib/net/models.dart`).
