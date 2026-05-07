# Domain Specification

Pure game logic extracted from the project description. No networking, no persistence, no framework.

---

## Entities

### Character
- `id: string` — unique instance id
- `name: string`
- `maxHp: number` — fixed stat
- `baseSpeed: number` — fixed stat; offsets all face priorities and is the priority of a swap
- `baseDie: Die` — the character's fixed 6-face die (authored data)
- `hp: number` — current hit points (0 = dead)
- `shield: number` — current shield points (absorbed before hp; **expires at end of round**)
- `face: DieFace` — the face currently showing after roll/keep
- `isFaceLocked: boolean` — true if the player chose to keep this face
- `target: Position | null` — the slot targeted for this round's action (set during assignment)
- `position: Position` — the slot this character currently occupies on the board
- `modifiers: Modifier[]` — active buffs/debuffs (placeholder, not yet specified)

A character reduced to 0 hp is **dead** — its pending queued actions are cancelled and it cannot act.

### Die
Array of exactly 6 `DieFace` entries (indices 0–5).

### DieFace
- `priority: number` — face-level priority modifier (added to `baseSpeed` for final priority)
- `effects: Effect[]` — all effects on this face resolve at the same priority
- `description: string`

### Effect (interface)
- `findTargets: TargetingFunction` — selects target characters from the board
- `solve(gameState, target): GameState` — applies the effect and returns the new state

Concrete effects: `SingleTargetDamage`, `SingleTargetHeal`, `SingleTargetShield`.

### Player
- `playerIndex: 0 | 1`
- `team: Character[]` — exactly 5 characters; a player loses when **3 or more** are dead

### GameState
- `currentRound: number`
- `rollsLeft: number` — counts down from 3 (initial roll + 2 rerolls)
- `players: [Player, Player]`
- `priorityQueue: PriorityQueue`

### Room (game lobby)
- `roomId: string`
- `name: string`
- `ownerId: string`
- `playersId: string[]` — max 2
- `isStarted: boolean`
- `gameState?: GameState`

### Position (slot reference)
- `playerIndex: 0 | 1` — which player's row
- `slot: 0–4` — which slot (0-based)

Attacks target **opponent** slots; heals/shields target **own** slots. The spec says "attacks target slots, not characters" — whoever occupies the slot at resolution time is hit.

---

## Actions (assignment phase)

Each living character submits exactly one action per round:

### FaceAction
Play the current face at its target slot.
- `type: "face"`
- `characterId: string`
- `target: Position` — the slot to apply the effect to
- `priority: face.priority + character.baseSpeed`

### SwapAction
Exchange position with the neighbor in a given direction.
- `type: "swap"`
- `characterId: string`
- `direction: "left" | "right"`
- `priority: character.baseSpeed` (no face modifier)

Rules:
- A character at slot 0 cannot swap left; at slot 4 cannot swap right
- Swapping with a dead character's slot is valid
- Multiple swaps in one round are allowed (each resolves in priority order, modifying the board before the next resolves)

---

## Resolution

All actions from both players are merged into a single `PriorityQueue` and resolved **highest priority first**.

```
finalPriority(face action) = face.priority + character.baseSpeed
finalPriority(swap)        = character.baseSpeed
```

Tie-breaking: random order.

Resolution rules (applied to the current board state at each step):
1. A swap physically exchanges positions before the next action resolves
2. A face effect hits whoever is **currently** on the targeted slot
3. Shield absorbs damage before HP
4. Heals are capped at `maxHp`
5. A character reaching 0 HP is immediately dead — their remaining queued actions are **cancelled**
6. At **end of round** all shields are reset to 0

---

## Win condition

A player loses when **3 or more** of their 5 characters are dead.
Both losing in the same round = draw / sudden death (TBD).

---

## Character Template (is it domain? YES)

The template is authored roster data — it defines which characters exist and what their die looks like. The template structure and the logic that builds a `Character` from it are **domain**. Only the file-loading mechanism (reading JSON from disk) is infrastructure.

### CharacterTemplate
- `name: string`
- `maxHp: number`
- `baseSpeed: number`
- `baseDieInstructions: BaseDieInstructions`

### BaseDieInstructions
`Record<0|1|2|3|4|5, { description: string; priority: number; effects: EffectEntry[] }>`

### EffectEntry
- `effect: EffectLabels` — which effect to create
- `magnitude: number` — the amount (damage/heal/shield value)

---

## Domain Services

| Service | Responsibility |
|---|---|
| `Character.service` | Roll die, deal damage (shield-first), gain/lose HP, gain/lose shield, reset shield, isDead, lock/unlock face, set target |
| `Player.service` | Roll team dice, lock/unlock team dice, check `hasLost` (≥3 dead), create player |
| `PriorityQueue.service` | Build queue from game state, resolve (unstack), reset |
| `CharacterGeneration.service` | Build `Character` and `Die` from a `CharacterTemplate` or raw params |
| `GameInit.service` | Create initial `GameState`, register effects |
| `Position.service` | Resolve slot positions to characters (`findSingleTarget`) |
| `Room.service` | Create room, add/remove player, transfer ownership |

---

## Code gaps vs. this spec

| Gap | Severity | Notes |
|---|---|---|
| `Modifier` shape | Low | Typed as `{ label: string; value: number }` — a starting point; full catalogue TBD (Annexe B) |
