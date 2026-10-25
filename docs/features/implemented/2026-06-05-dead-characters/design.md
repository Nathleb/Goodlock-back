# Dead Characters — Design

**Status:** implemented 2026-06-05

## Rule

- **Dead** = `hp` at 0 (`isDead` in `Character.service.ts`; `loseHp` clamps at 0).
- A dead character stays on the board and keeps its die visible. It **never acts**, but it **remains a valid target**: a hit on it is wasted rather than redirected (and leaves room for a future revive mechanic).
- Healing does nothing to a dead character (`gainHp` returns it unchanged).
- A player with 2 dead characters (`LOSS_DEATHS`) loses; both losing in the same round is a draw.

## Enforcement is server-side

The backend is the authority on "dead characters do not act"; the client cannot make a dead character act. The guarantee lives in the resolution engine: `unstackPriorityQueueWithLog` (`src/domain/services/PriorityQueue.service.ts`) skips any queued actor whose `hp` is 0 (`isAlive`), and logs it as a `ResolveStep` with `skipped: true` and no effects. This is checked when each entry is reached, so a character killed earlier in the same round does not act later in it.

Players choose no targets (targets come from the templates and are resolved to cells at resolution time), so there is no payload in which a dead character could carry an action. Target resolution works on cells and does not care whether the occupant is alive: dead occupants stay targetable by construction.

## Protocol and DTO

No dead flag: `CharacterDTO.hp` is already exposed and the client derives `dead = hp <= 0`. A skipped actor appears in the `roundResolved` log with `skipped: true`.

## Tests

- Domain: a dead actor (`hp = 0`) in the queue is skipped, changes nothing and yields a `skipped` log step; an actor killed earlier in the round is skipped when its turn comes.
- Domain: `hasLost` / `checkWinner` at 2 dead.

## Out of scope

- Revive mechanics.
- Any change to target validation for dead targets: none is needed.
