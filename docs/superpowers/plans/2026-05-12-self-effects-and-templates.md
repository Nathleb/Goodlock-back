# Self-Effect Strategies + Exhaustive Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SelfDamage, SelfHeal, SelfShield self-targeting effect strategies, then replace all 10 character templates with role-varied, exhaustive configurations covering every available effect, varied HP/speed/priority.

**Architecture:** Three new strategies follow the same pattern as existing ones but use a new `findSelf(players, actorId)` helper in Position.service (different signature from TargetingFunction — takes actorId not Position). Templates are pure JSON data requiring no structural changes beyond the new EffectLabel entries.

**Tech Stack:** TypeScript, NestJS domain layer (framework-free), Jest

---

### Task 1: Add SelfDamage/SelfHeal/SelfShield to EffectLabel enum

**Files:**
- Modify: `src/domain/types/EffectLabels.type.ts`

- [ ] **Step 1: Add three new enum values**

Replace the entire file content:

```ts
enum EffectLabel {
    SingleTargetDamage  = "SingleTargetDamage",
    SingleTargetHeal    = "SingleTargetHeal",
    SingleTargetShield  = "SingleTargetShield",
    CleaveDamage        = "CleaveDamage",
    CleaveHeal          = "CleaveHeal",
    CleaveShield        = "CleaveShield",
    FullTeamDamage      = "FullTeamDamage",
    FullTeamHeal        = "FullTeamHeal",
    FullTeamShield      = "FullTeamShield",
    SwapLeft            = "SwapLeft",
    SwapRight           = "SwapRight",
    SelfDamage          = "SelfDamage",
    SelfHeal            = "SelfHeal",
    SelfShield          = "SelfShield",
}

export default EffectLabel;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

---

### Task 2: Add `findSelf` to Position.service

**Files:**
- Modify: `src/domain/services/Position.service.ts`

- [ ] **Step 1: Append findSelf to the file**

Add at the end of `src/domain/services/Position.service.ts`:

```ts
export function findSelf(players: [Player, Player], actorId: string): Character[] {
    for (const player of players) {
        const char = player.team.find(c => c.id === actorId);
        if (char) return [char];
    }
    return [];
}
```

Note: `findSelf` is NOT typed as `TargetingFunction` — it takes `actorId: string` instead of `Position`.

---

### Task 3: Write failing tests for self-effect strategies

**Files:**
- Create: `tests/SelfEffects.spec.ts`

- [ ] **Step 1: Create test file**

```ts
import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import GameState from "@domain/types/GameState.type";
import Position, { SlotIndex } from "@domain/types/Position.type";
import DieFace from "@domain/types/DieFace.type";

initializeEffects();

// Face index reference:
// [0] SelfDamage:3
// [1] SelfHeal:5
// [2] SelfShield:2
// [3] SingleTargetDamage:4 + SelfShield:2
// [4] SingleTargetDamage:5 + SelfHeal:3
// [5] SelfDamage:2 + SingleTargetDamage:6
const selfDieInstructions: BaseDieInstructions = [
    { description: "SelfDamage:3",           priority: 1, effects: [{ effect: EffectLabel.SelfDamage, magnitude: 3 }] },
    { description: "SelfHeal:5",             priority: 1, effects: [{ effect: EffectLabel.SelfHeal,   magnitude: 5 }] },
    { description: "SelfShield:2",           priority: 1, effects: [{ effect: EffectLabel.SelfShield, magnitude: 2 }] },
    { description: "STDamage:4+SelfShield:2",priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 4 }, { effect: EffectLabel.SelfShield, magnitude: 2 }] },
    { description: "STDamage:5+SelfHeal:3",  priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }, { effect: EffectLabel.SelfHeal,   magnitude: 3 }] },
    { description: "SelfDmg:2+STDamage:6",  priority: 1, effects: [{ effect: EffectLabel.SelfDamage,  magnitude: 2 }, { effect: EffectLabel.SingleTargetDamage, magnitude: 6 }] },
];

const die = generateFullDie(selfDieInstructions);
const makeChar = (name: string, playerIndex: 0 | 1, slot: SlotIndex) =>
    createCharacter(name, 20, 0, die, { playerIndex, slot });

function makeGameState() {
    const team1 = [0, 1, 2, 3, 4].map(i => makeChar(`A${i}`, 0, i as SlotIndex));
    const team2 = [0, 1, 2, 3, 4].map(i => makeChar(`B${i}`, 1, i as SlotIndex));
    return createGameState(createPlayer(team1, 0), createPlayer(team2, 1));
}

function withEffect(gs: GameState, face: DieFace, target: Position, actorId: string, baseSpeed: number): GameState {
    return { ...gs, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(10), face, target, actorId, baseSpeed) };
}

describe('SelfDamage', () => {
    it('damages the actor, not the target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0, slot 0
        const target: Position = { playerIndex: 1, slot: 2 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[0], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[0].hp).toBe(17); // 20 - 3
        expect(updated.players[1].team[2].hp).toBe(20); // target unchanged
    });
});

describe('SelfHeal', () => {
    it('heals the actor, not the target', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 10 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[1]; // A1, slot 1
        const target: Position = { playerIndex: 1, slot: 2 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(base, actor.baseDie[1], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[1].hp).toBe(15); // 10 + 5
        expect(updated.players[1].team[2].hp).toBe(20); // target unchanged
    });

    it('does not overheal beyond maxHp', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[1]; // already at maxHp (20)
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[1], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[1].hp).toBe(20); // capped at maxHp
    });
});

describe('SelfShield', () => {
    it('grants shield to the actor, not the target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[2]; // A2, slot 2
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[2], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[2].shield).toBe(2);
        expect(updated.players[1].team[0].shield).toBe(0); // target unchanged
    });
});

describe('Combo faces', () => {
    it('SingleTargetDamage + SelfShield: damages target and shields actor', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 1 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[3], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[1].team[1].hp).toBe(16);    // 20 - 4
        expect(updated.players[0].team[0].shield).toBe(2); // actor gains shield
    });

    it('SingleTargetDamage + SelfHeal: damages target and heals actor', () => {
        const gs = makeGameState();
        const damagedTeam = gs.players[0].team.map(c => ({ ...c, hp: 10 }));
        const base: GameState = { ...gs, players: [{ ...gs.players[0], team: damagedTeam }, gs.players[1]] };
        const actor = base.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 0 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(base, actor.baseDie[4], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[1].team[0].hp).toBe(15); // 20 - 5
        expect(updated.players[0].team[0].hp).toBe(13); // 10 + 3
    });

    it('SelfDamage + SingleTargetDamage: actor takes damage and deals damage to target', () => {
        const gs = makeGameState();
        const actor = gs.players[0].team[0]; // A0
        const target: Position = { playerIndex: 1, slot: 3 };

        const { state: updated } = unstackPriorityQueueWithLog(
            withEffect(gs, actor.baseDie[5], target, actor.id, actor.baseSpeed)
        );

        expect(updated.players[0].team[0].hp).toBe(18); // 20 - 2 (self)
        expect(updated.players[1].team[3].hp).toBe(14); // 20 - 6 (target)
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest tests/SelfEffects.spec.ts --no-coverage`
Expected: FAIL — `No implementation registered for effect: SelfDamage`

---

### Task 4: Implement SelfDamage, SelfHeal, SelfShield strategies

**Files:**
- Create: `src/domain/strategies/SelfDamage.class.ts`
- Create: `src/domain/strategies/SelfHeal.class.ts`
- Create: `src/domain/strategies/SelfShield.class.ts`

- [ ] **Step 1: Create SelfDamage.class.ts**

```ts
import { dealDamage } from "../services/Character.service";
import { findSelf } from "../services/Position.service";
import Effect from "../types/Effect.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class SelfDamage implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        const targets = findSelf(gameState.players, actorId);
        const players = applyEffectToTargets(gameState.players, targets, c => dealDamage(c, this.amount));
        return { state: { ...gameState, players }, affected: targets.map(c => c.id) };
    }
}
```

- [ ] **Step 2: Create SelfHeal.class.ts**

```ts
import { gainHp } from "../services/Character.service";
import { findSelf } from "../services/Position.service";
import Effect from "../types/Effect.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class SelfHeal implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        const targets = findSelf(gameState.players, actorId);
        const players = applyEffectToTargets(gameState.players, targets, c => gainHp(c, this.amount));
        return { state: { ...gameState, players }, affected: targets.map(c => c.id) };
    }
}
```

- [ ] **Step 3: Create SelfShield.class.ts**

```ts
import { gainShield } from "../services/Character.service";
import { findSelf } from "../services/Position.service";
import Effect from "../types/Effect.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class SelfShield implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        const targets = findSelf(gameState.players, actorId);
        const players = applyEffectToTargets(gameState.players, targets, c => gainShield(c, this.amount));
        return { state: { ...gameState, players }, affected: targets.map(c => c.id) };
    }
}
```

---

### Task 5: Register self effects in GameInit + verify

**Files:**
- Modify: `src/domain/services/GameInit.service.ts`

- [ ] **Step 1: Add imports to GameInit.service.ts**

Add after the existing strategy imports:

```ts
import SelfDamage from "../strategies/SelfDamage.class";
import SelfHeal from "../strategies/SelfHeal.class";
import SelfShield from "../strategies/SelfShield.class";
```

- [ ] **Step 2: Register in initializeEffects()**

Add three lines at the end of the `initializeEffects()` function body:

```ts
EffectFactory.registerEffect(EffectLabel.SelfDamage,  (amount) => new SelfDamage(amount));
EffectFactory.registerEffect(EffectLabel.SelfHeal,    (amount) => new SelfHeal(amount));
EffectFactory.registerEffect(EffectLabel.SelfShield,  (amount) => new SelfShield(amount));
```

- [ ] **Step 3: Run SelfEffects tests**

Run: `npx jest tests/SelfEffects.spec.ts --no-coverage`
Expected: all 6 tests PASS

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: all suites pass (no regressions)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors

---

### Task 6: Replace all 10 character templates

**Files:**
- Modify: `tmplt/Alicent.json` — Striker 1 · hp=10, speed=4
- Modify: `tmplt/Charlie.json` — Striker 2 · hp=10, speed=3
- Modify: `tmplt/Diana.json` — Bruiser 1 · hp=20, speed=1
- Modify: `tmplt/Edward.json` — Bruiser 2 · hp=18, speed=2
- Modify: `tmplt/Eve.json` — Bruiser 3 · hp=20, speed=1
- Modify: `tmplt/Fiona.json` — Support 1 · hp=15, speed=2
- Modify: `tmplt/George.json` — Support 2 · hp=15, speed=1
- Modify: `tmplt/Hannah.json` — Support 3 · hp=12, speed=3
- Modify: `tmplt/Jason.json` — Hybrid 1 · hp=15, speed=2
- Modify: `tmplt/Robbert.json` — Hybrid 2 · hp=14, speed=3

Effect coverage across the roster:
| Effect | Characters |
|---|---|
| SingleTargetDamage | Alicent, Charlie, Diana, Edward, Fiona (combo), Jason, Robbert |
| CleaveDamage | Alicent, Charlie, Diana, Edward, Jason, Robbert |
| FullTeamDamage | Charlie, Eve, Robbert |
| SelfDamage | Alicent, Charlie |
| SingleTargetHeal | Fiona, Jason, Robbert |
| CleaveHeal | Fiona, George, Hannah, Jason |
| FullTeamHeal | George |
| SelfHeal | Fiona, George, Jason |
| SingleTargetShield | Fiona |
| CleaveShield | Hannah, Robbert |
| FullTeamShield | Eve, George, Hannah |
| SelfShield | Alicent (combo), Diana, Edward, Eve, Robbert |
| SwapLeft | Diana |
| SwapRight | Diana |

- [ ] **Step 1: Replace Alicent.json — Striker 1 (burst, SelfDamage sacrifice)**

```json
{
    "name": "Alicent",
    "maxHp": 10,
    "baseSpeed": 4,
    "baseDieInstructions": [
        { "description": "Deal 5 damage to a single target.", "priority": 2, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }] },
        { "description": "Deal 7 damage to a single target.", "priority": 4, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 7 }] },
        { "description": "Deal 3 damage to a single target.", "priority": 1, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 3 }] },
        { "description": "Deal 4 cleave damage.", "priority": 3, "effects": [{ "effect": "CleaveDamage", "magnitude": 4 }] },
        { "description": "Sacrifice 3 HP to deal 9 damage.", "priority": 5, "effects": [{ "effect": "SelfDamage", "magnitude": 3 }, { "effect": "SingleTargetDamage", "magnitude": 9 }] },
        { "description": "Deal 6 damage and gain 2 shield.", "priority": 2, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 6 }, { "effect": "SelfShield", "magnitude": 2 }] }
    ]
}
```

- [ ] **Step 2: Replace Charlie.json — Striker 2 (cleave + FullTeamDamage)**

```json
{
    "name": "Charlie",
    "maxHp": 10,
    "baseSpeed": 3,
    "baseDieInstructions": [
        { "description": "Deal 4 cleave damage.", "priority": 3, "effects": [{ "effect": "CleaveDamage", "magnitude": 4 }] },
        { "description": "Deal 3 cleave damage.", "priority": 2, "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Deal 2 damage to all enemies.", "priority": 4, "effects": [{ "effect": "FullTeamDamage", "magnitude": 2 }] },
        { "description": "Deal 5 damage to a single target.", "priority": 1, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }] },
        { "description": "Deal 3 cleave damage and take 2 self damage.", "priority": 3, "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }, { "effect": "SelfDamage", "magnitude": 2 }] },
        { "description": "Deal 3 damage to all enemies.", "priority": 5, "effects": [{ "effect": "FullTeamDamage", "magnitude": 3 }] }
    ]
}
```

- [ ] **Step 3: Replace Diana.json — Bruiser 1 (swap + damage)**

```json
{
    "name": "Diana",
    "maxHp": 20,
    "baseSpeed": 1,
    "baseDieInstructions": [
        { "description": "Deal 4 damage to a single target.", "priority": 3, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }] },
        { "description": "Swap left.", "priority": 1, "effects": [{ "effect": "SwapLeft", "magnitude": 0 }] },
        { "description": "Deal 5 damage to a single target.", "priority": 4, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }] },
        { "description": "Swap right.", "priority": 2, "effects": [{ "effect": "SwapRight", "magnitude": 0 }] },
        { "description": "Deal 3 cleave damage.", "priority": 2, "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Deal 6 damage and gain 2 shield.", "priority": 5, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 6 }, { "effect": "SelfShield", "magnitude": 2 }] }
    ]
}
```

- [ ] **Step 4: Replace Edward.json — Bruiser 2 (damage + SelfShield)**

```json
{
    "name": "Edward",
    "maxHp": 18,
    "baseSpeed": 2,
    "baseDieInstructions": [
        { "description": "Deal 4 damage and gain 2 shield.", "priority": 2, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }, { "effect": "SelfShield", "magnitude": 2 }] },
        { "description": "Deal 5 damage and gain 3 shield.", "priority": 4, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }, { "effect": "SelfShield", "magnitude": 3 }] },
        { "description": "Deal 3 cleave damage.", "priority": 1, "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Deal 3 damage and gain 1 shield.", "priority": 3, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 3 }, { "effect": "SelfShield", "magnitude": 1 }] },
        { "description": "Deal 4 cleave damage.", "priority": 5, "effects": [{ "effect": "CleaveDamage", "magnitude": 4 }] },
        { "description": "Gain 4 shield.", "priority": 1, "effects": [{ "effect": "SelfShield", "magnitude": 4 }] }
    ]
}
```

- [ ] **Step 5: Replace Eve.json — Bruiser 3 (FullTeamDamage + FullTeamShield)**

```json
{
    "name": "Eve",
    "maxHp": 20,
    "baseSpeed": 1,
    "baseDieInstructions": [
        { "description": "Deal 2 damage to all enemies.", "priority": 2, "effects": [{ "effect": "FullTeamDamage", "magnitude": 2 }] },
        { "description": "Deal 1 damage to all enemies.", "priority": 1, "effects": [{ "effect": "FullTeamDamage", "magnitude": 1 }] },
        { "description": "Deal 6 damage to a single target.", "priority": 4, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 6 }] },
        { "description": "Grant 2 shield to all allies.", "priority": 3, "effects": [{ "effect": "FullTeamShield", "magnitude": 2 }] },
        { "description": "Gain 5 shield.", "priority": 1, "effects": [{ "effect": "SelfShield", "magnitude": 5 }] },
        { "description": "Deal 3 damage to all enemies.", "priority": 5, "effects": [{ "effect": "FullTeamDamage", "magnitude": 3 }] }
    ]
}
```

- [ ] **Step 6: Replace Fiona.json — Support 1 (single-target heal/shield + SelfHeal)**

```json
{
    "name": "Fiona",
    "maxHp": 15,
    "baseSpeed": 2,
    "baseDieInstructions": [
        { "description": "Heal a single target for 5 HP.", "priority": 1, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 5 }] },
        { "description": "Heal a single target for 4 HP and grant 2 shield.", "priority": 2, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 4 }, { "effect": "SingleTargetShield", "magnitude": 2 }] },
        { "description": "Heal a single target for 6 HP.", "priority": 3, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 6 }] },
        { "description": "Heal self for 4 HP.", "priority": 1, "effects": [{ "effect": "SelfHeal", "magnitude": 4 }] },
        { "description": "Grant 4 shield to a single target.", "priority": 4, "effects": [{ "effect": "SingleTargetShield", "magnitude": 4 }] },
        { "description": "Cleave heal for 3 HP.", "priority": 2, "effects": [{ "effect": "CleaveHeal", "magnitude": 3 }] }
    ]
}
```

- [ ] **Step 7: Replace George.json — Support 2 (FullTeamHeal + FullTeamShield)**

```json
{
    "name": "George",
    "maxHp": 15,
    "baseSpeed": 1,
    "baseDieInstructions": [
        { "description": "Heal all allies for 3 HP.", "priority": 1, "effects": [{ "effect": "FullTeamHeal", "magnitude": 3 }] },
        { "description": "Grant 2 shield to all allies.", "priority": 2, "effects": [{ "effect": "FullTeamShield", "magnitude": 2 }] },
        { "description": "Heal all allies for 4 HP.", "priority": 3, "effects": [{ "effect": "FullTeamHeal", "magnitude": 4 }] },
        { "description": "Cleave heal for 4 HP.", "priority": 1, "effects": [{ "effect": "CleaveHeal", "magnitude": 4 }] },
        { "description": "Grant 3 shield to all allies.", "priority": 4, "effects": [{ "effect": "FullTeamShield", "magnitude": 3 }] },
        { "description": "Heal self for 5 HP.", "priority": 2, "effects": [{ "effect": "SelfHeal", "magnitude": 5 }] }
    ]
}
```

- [ ] **Step 8: Replace Hannah.json — Support 3 (CleaveShield + FullTeamShield, fast)**

```json
{
    "name": "Hannah",
    "maxHp": 12,
    "baseSpeed": 3,
    "baseDieInstructions": [
        { "description": "Cleave shield for 2.", "priority": 4, "effects": [{ "effect": "CleaveShield", "magnitude": 2 }] },
        { "description": "Grant 3 shield to a single target.", "priority": 2, "effects": [{ "effect": "SingleTargetShield", "magnitude": 3 }] },
        { "description": "Grant 2 shield to all allies.", "priority": 5, "effects": [{ "effect": "FullTeamShield", "magnitude": 2 }] },
        { "description": "Cleave heal for 3 HP.", "priority": 1, "effects": [{ "effect": "CleaveHeal", "magnitude": 3 }] },
        { "description": "Cleave shield for 3.", "priority": 3, "effects": [{ "effect": "CleaveShield", "magnitude": 3 }] },
        { "description": "Heal a single target for 4 HP.", "priority": 2, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 4 }] }
    ]
}
```

- [ ] **Step 9: Replace Jason.json — Hybrid 1 (damage + SelfHeal)**

```json
{
    "name": "Jason",
    "maxHp": 15,
    "baseSpeed": 2,
    "baseDieInstructions": [
        { "description": "Deal 4 damage to a single target.", "priority": 3, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }] },
        { "description": "Deal 3 damage and heal self for 2 HP.", "priority": 2, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 3 }, { "effect": "SelfHeal", "magnitude": 2 }] },
        { "description": "Deal 3 cleave damage.", "priority": 4, "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Heal a single target for 3 HP.", "priority": 1, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 3 }] },
        { "description": "Deal 5 damage and heal self for 3 HP.", "priority": 3, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }, { "effect": "SelfHeal", "magnitude": 3 }] },
        { "description": "Cleave heal for 2 HP.", "priority": 2, "effects": [{ "effect": "CleaveHeal", "magnitude": 2 }] }
    ]
}
```

- [ ] **Step 10: Replace Robbert.json — Hybrid 2 (all-rounder, every targeting pattern)**

```json
{
    "name": "Robbert",
    "maxHp": 14,
    "baseSpeed": 3,
    "baseDieInstructions": [
        { "description": "Deal 3 damage to a single target.", "priority": 2, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 3 }] },
        { "description": "Deal 2 cleave damage.", "priority": 3, "effects": [{ "effect": "CleaveDamage", "magnitude": 2 }] },
        { "description": "Heal a single target for 4 HP.", "priority": 1, "effects": [{ "effect": "SingleTargetHeal", "magnitude": 4 }] },
        { "description": "Deal 2 damage to all enemies.", "priority": 4, "effects": [{ "effect": "FullTeamDamage", "magnitude": 2 }] },
        { "description": "Cleave shield for 2.", "priority": 2, "effects": [{ "effect": "CleaveShield", "magnitude": 2 }] },
        { "description": "Deal 4 damage and gain 2 shield.", "priority": 1, "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }, { "effect": "SelfShield", "magnitude": 2 }] }
    ]
}
```

- [ ] **Step 11: Run full test suite**

Run: `npm run test`
Expected: all suites pass (templates are JSON data, no test changes needed)

- [ ] **Step 12: Lint**

Run: `npm run lint`
Expected: no errors
