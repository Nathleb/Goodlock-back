# Initiative: a deterministic tiebreak for the resolution order — design

**Status:** implemented 2026-10-26. Part of `../../active/2026-10-26-dice-authoring-and-statuses/design.md` (section 3.1).

## Why

Equal `(bracket, speed)` pairs used to resolve in a random order (shuffle, then stable sort). The client cannot show an exact resolution preview with a random tiebreak. The resolution must be fully determined by the faces and the state.

## Rules

- `GameState.initiativePlayerIndex: PlayerIndex` is drawn **once at game init** (`createSelectionState`), **flipped at the end of each round** (`endOfRound`) and exposed in the **public DTO** in every phase.
- Decision: a stored field rather than `currentRound % 2`, because the client reads it instead of re-deriving it, and logs and replays show it directly.
- Resolution order is a pure sort: bracket (`face.priority`) desc, `baseSpeed` desc, actor of the initiative holder first, slot asc (0 → 4).
- Speed never crosses brackets and initiative never beats speed (unchanged: initiative only breaks exact ties).
- The slot is read from the state when the order is computed, at the start of RESOLVE. `QueueEntry` stays `[face, actorId, speed]`.
- The DTO field is typed `PlayerIndex`; the client (`GameStateView.initiativePlayerIndex`) defaults to 0 when the field is absent so recorded fixtures still parse.
- No random call remains in the resolution path.

## Out of scope

Player-set tie preset within a team (later). SPEED statuses re-sorting the queue mid-round (HASTE/SLOW feature).
