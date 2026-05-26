# Targeting Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `targetConstraint` to `DieFace` so the system enforces ally/enemy/any targeting rules at assignment time and resolution time, replacing the ad-hoc guard in `SwapAlly`.

**Architecture:** A new `TargetConstraint` enum lives in domain types. `DieFace` carries the field (always present at runtime). `FaceTemplate` has it as optional (defaults to `ANY` so existing test fixtures need no changes). A pure `validateTarget` utility throws on violation. Two enforcement points: `selectTargetOfCharacter` (ASSIGN phase, primary) and `unstackPriorityQueueWithLog` (RESOLVE phase, defense-in-depth). `SwapAlly` drops its manual team guard.

**Tech Stack:** TypeScript, NestJS, Jest

---

### Task 1: TargetConstraint enum

**Files:**
- Create: `src/domain/types/TargetConstraint.type.ts`

- [ ] **Step 1: Create the enum**

```ts
// src/domain/types/TargetConstraint.type.ts
enum TargetConstraint {
    NONE       = "NONE",
    ALLY_ONLY  = "ALLY_ONLY",
    ENEMY_ONLY = "ENEMY_ONLY",
    ANY        = "ANY",
}

export default TargetConstraint;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/domain/types/TargetConstraint.type.ts
git commit -m "feat: add TargetConstraint enum"
```

---

### Task 2: Add targetConstraint to DieFace, FaceTemplate, and CharacterGeneration

**Files:**
- Modify: `src/domain/types/DieFace.type.ts`
- Modify: `src/domain/types/BaseDieInstructions.type.ts`
- Modify: `src/domain/services/CharacterGeneration.service.ts`
- Test: `tests/CharacterGeneration.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Open `tests/CharacterGeneration.service.spec.ts`. Add these two tests inside the existing describe block (add import at the top of the file):

```ts
import TargetConstraint from "@domain/types/TargetConstraint.type";
```

Then add:

```ts
it('defaults targetConstraint to ANY when not specified in template', () => {
    const instructions: BaseDieInstructions = [
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
    ];
    const die = generateFullDie(instructions);
    expect(die[0].targetConstraint).toBe(TargetConstraint.ANY);
});

it('preserves explicit targetConstraint from template', () => {
    const instructions: BaseDieInstructions = [
        { description: 'f', priority: 1, effects: [], targetConstraint: TargetConstraint.ALLY_ONLY },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
        { description: 'f', priority: 1, effects: [] },
    ];
    const die = generateFullDie(instructions);
    expect(die[0].targetConstraint).toBe(TargetConstraint.ALLY_ONLY);
    expect(die[1].targetConstraint).toBe(TargetConstraint.ANY);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/CharacterGeneration.service.spec.ts`
Expected: FAIL — `targetConstraint` does not exist on DieFace

- [ ] **Step 3: Update DieFace type**

Replace the content of `src/domain/types/DieFace.type.ts` with:

```ts
import Effect from "./Effect.type";
import TargetConstraint from "./TargetConstraint.type";

type DieFace = {
    priority: number;
    effects: Effect[];
    description: string;
    targetConstraint: TargetConstraint;
};

export default DieFace;
```

- [ ] **Step 4: Update FaceTemplate (optional field with default)**

In `src/domain/types/BaseDieInstructions.type.ts`, add the optional field to `FaceTemplate`:

```ts
import EffectLabel from "./EffectLabels.type";
import TargetConstraint from "./TargetConstraint.type";

export type EffectEntry = {
    effect: EffectLabel;
    magnitude: number;
};

export type FaceTemplate = {
    description: string;
    priority: number;
    effects: EffectEntry[];
    targetConstraint?: TargetConstraint;
};

export type BaseDieInstructions = [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
```

- [ ] **Step 5: Update CharacterGeneration to carry the field through**

In `src/domain/services/CharacterGeneration.service.ts`, update `generateFullDie` to pass `targetConstraint` (defaulting to `ANY`):

Add this import at the top:
```ts
import TargetConstraint from "../types/TargetConstraint.type";
```

Replace `generateFullDie`:
```ts
export function generateFullDie(baseDieInstructions: BaseDieInstructions): Die {
    return baseDieInstructions.map(faceData =>
        generateFaceFromEffectEntries(
            {
                description: faceData.description,
                priority: faceData.priority,
                effects: [],
                targetConstraint: faceData.targetConstraint ?? TargetConstraint.ANY,
            },
            faceData.effects
        )
    ) as Die;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/CharacterGeneration.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite to catch any type regressions**

Run: `npm run test`
Expected: PASS — no test file passes `DieFace` objects directly to something that now requires `targetConstraint`, since `generateFullDie` always sets it.

- [ ] **Step 8: Commit**

```bash
git add src/domain/types/DieFace.type.ts src/domain/types/BaseDieInstructions.type.ts src/domain/services/CharacterGeneration.service.ts tests/CharacterGeneration.service.spec.ts
git commit -m "feat: add targetConstraint field to DieFace and FaceTemplate"
```

---

### Task 3: TargetValidator utility (TDD)

**Files:**
- Create: `src/domain/services/TargetValidator.ts`
- Create: `tests/TargetValidator.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/TargetValidator.spec.ts`:

```ts
import { validateTarget } from "@domain/services/TargetValidator";
import TargetConstraint from "@domain/types/TargetConstraint.type";
import Position from "@domain/types/Position.type";
import { PlayerIndex } from "@domain/types/Position.type";

const actor: PlayerIndex = 0;
const allyPos: Position = { playerIndex: 0, slot: 2 };
const enemyPos: Position = { playerIndex: 1, slot: 2 };

describe('validateTarget', () => {
    describe('NONE', () => {
        it('accepts null target', () => {
            expect(() => validateTarget(TargetConstraint.NONE, actor, null)).not.toThrow();
        });
        it('throws when a target position is provided', () => {
            expect(() => validateTarget(TargetConstraint.NONE, actor, allyPos))
                .toThrow('NONE');
        });
    });

    describe('ALLY_ONLY', () => {
        it('accepts an ally position', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, allyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, null)).toThrow();
        });
        it('throws on enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, enemyPos))
                .toThrow('ALLY_ONLY');
        });
    });

    describe('ENEMY_ONLY', () => {
        it('accepts an enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, enemyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, null)).toThrow();
        });
        it('throws on ally position', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, allyPos))
                .toThrow('ENEMY_ONLY');
        });
    });

    describe('ANY', () => {
        it('accepts an ally position', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, allyPos)).not.toThrow();
        });
        it('accepts an enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, enemyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, null)).toThrow();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/TargetValidator.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the validator**

Create `src/domain/services/TargetValidator.ts`:

```ts
import TargetConstraint from "../types/TargetConstraint.type";
import Position from "../types/Position.type";
import { PlayerIndex } from "../types/Position.type";

export function validateTarget(
    constraint: TargetConstraint,
    actorPlayerIndex: PlayerIndex,
    target: Position | null,
): void {
    if (constraint === TargetConstraint.NONE) {
        if (target !== null) throw new Error('NONE face does not accept a target');
        return;
    }
    if (target === null) throw new Error(`target required for constraint ${constraint}`);
    if (constraint === TargetConstraint.ALLY_ONLY && target.playerIndex !== actorPlayerIndex)
        throw new Error('ALLY_ONLY constraint violated: target must be on actor\'s team');
    if (constraint === TargetConstraint.ENEMY_ONLY && target.playerIndex === actorPlayerIndex)
        throw new Error('ENEMY_ONLY constraint violated: target must be on opponent\'s team');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/TargetValidator.spec.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/TargetValidator.ts tests/TargetValidator.spec.ts
git commit -m "feat: add TargetValidator utility with full test coverage"
```

---

### Task 4: Enforce constraint at assignment time in Player.service

**Files:**
- Modify: `src/domain/services/Player.service.ts`
- Test: `tests/Player.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Open `tests/Player.service.spec.ts`. Add these imports at the top:

```ts
import TargetConstraint from "@domain/types/TargetConstraint.type";
import DieFace from "@domain/types/DieFace.type";
```

Add these tests in the `selectTargetOfCharacter` describe block (create it if it doesn't exist):

```ts
describe('selectTargetOfCharacter', () => {
    const baseFace = (constraint: TargetConstraint): DieFace => ({
        priority: 1, effects: [], description: 'test', targetConstraint: constraint,
    });

    it('throws when enemy target given for ALLY_ONLY face', () => {
        const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ALLY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
        const player = createPlayer([char], 0);
        const enemyPos: Position = { playerIndex: 1, slot: 2 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos))
            .toThrow('ALLY_ONLY');
    });

    it('throws when ally target given for ENEMY_ONLY face', () => {
        const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ENEMY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
        const player = createPlayer([char], 0);
        const allyPos: Position = { playerIndex: 0, slot: 1 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, allyPos))
            .toThrow('ENEMY_ONLY');
    });

    it('throws when any target given for NONE face', () => {
        const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.NONE)) as Die, { playerIndex: 0, slot: 0 });
        const player = createPlayer([char], 0);
        const pos: Position = { playerIndex: 0, slot: 1 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, pos))
            .toThrow('NONE');
    });

    it('accepts ally target for ALLY_ONLY face', () => {
        const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ALLY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
        const player = createPlayer([char], 0);
        const allyPos: Position = { playerIndex: 0, slot: 2 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, allyPos)).not.toThrow();
    });

    it('accepts enemy target for ANY face', () => {
        const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ANY)) as Die, { playerIndex: 0, slot: 0 });
        const player = createPlayer([char], 0);
        const enemyPos: Position = { playerIndex: 1, slot: 2 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos)).not.toThrow();
    });
});
```

You will also need these imports at the top if not already present:
```ts
import { selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import Die from "@domain/types/Die.type";
import Position from "@domain/types/Position.type";
import { SlotIndex } from "@domain/types/Position.type";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/Player.service.spec.ts`
Expected: FAIL — constraint is not validated yet

- [ ] **Step 3: Update selectTargetOfCharacter in Player.service.ts**

Open `src/domain/services/Player.service.ts`. Add this import at the top:

```ts
import { validateTarget } from "./TargetValidator";
```

Replace `selectTargetOfCharacter`:

```ts
export function selectTargetOfCharacter(player: Player, slot: SlotIndex, target: Position): Player {
    const char = player.team.find(c => c.position.slot === slot);
    if (!char) return player;
    validateTarget(char.face.targetConstraint, player.playerIndex, target);
    const newTeam = player.team.map((c) =>
        c.position.slot === slot ? setTarget(c, target) : c
    );
    return { ...player, team: newTeam };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/Player.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/Player.service.ts tests/Player.service.spec.ts
git commit -m "feat: enforce targetConstraint in selectTargetOfCharacter"
```

---

### Task 5: Defense-in-depth guard in PriorityQueue.service

**Files:**
- Modify: `src/domain/services/PriorityQueue.service.ts`
- Test: `tests/PriorityQueue.service.spec.ts`

- [ ] **Step 1: Write failing test**

Open `tests/PriorityQueue.service.spec.ts`. Add import:

```ts
import TargetConstraint from "@domain/types/TargetConstraint.type";
```

Add this test in the `unstackPriorityQueueWithLog` describe block (create if needed):

```ts
it('throws when a queued face has a violated targetConstraint', () => {
    initializeEffects();
    const face: DieFace = {
        priority: 1,
        effects: [],
        description: 'ally-only',
        targetConstraint: TargetConstraint.ALLY_ONLY,
    };
    const char = createCharacter('A', 100, 5, [face, face, face, face, face, face], { playerIndex: 0, slot: 0 });
    const team1 = [char, ...Array(4).fill(null).map((_, i) => createCharacter(`T${i}`, 100, 5, [face,face,face,face,face,face], { playerIndex: 0, slot: (i + 1) as SlotIndex }))];
    const team2 = Array(5).fill(null).map((_, i) => createCharacter(`E${i}`, 100, 5, [face,face,face,face,face,face], { playerIndex: 1, slot: i as SlotIndex }));
    const player1 = createPlayer(team1, 0);
    const player2 = createPlayer(team2, 1);
    let gs = createGameState(player1, player2);
    gs = beginResolvePhase(gs);

    // Manually inject an invalid entry: ALLY_ONLY face targeting enemy
    const enemyPos: Position = { playerIndex: 1, slot: 0 };
    let queue = createPriorityQueue(10);
    queue = addEffectsToPriorityQueue(queue, face, enemyPos, char.id, char.baseSpeed);
    gs = { ...gs, priorityQueue: queue };

    expect(() => unstackPriorityQueueWithLog(gs)).toThrow('ALLY_ONLY');
});
```

Add required imports for the test file if not present:
```ts
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { beginResolvePhase } from "@domain/services/Phase.service";
import DieFace from "@domain/types/DieFace.type";
import Position from "@domain/types/Position.type";
import { SlotIndex } from "@domain/types/Position.type";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/PriorityQueue.service.spec.ts`
Expected: FAIL — no throw yet

- [ ] **Step 3: Add guard to unstackPriorityQueueWithLog**

Open `src/domain/services/PriorityQueue.service.ts`. Add import at the top:

```ts
import { validateTarget } from "./TargetValidator";
import { PlayerIndex } from "../types/Position.type";
```

Add a private helper function before `unstackPriorityQueueWithLog`:

```ts
function findActorPlayerIndex(state: GameState, characterId: string): PlayerIndex | undefined {
    for (let pi = 0; pi < state.players.length; pi++) {
        if (state.players[pi].team.some(c => c.id === characterId)) return pi as PlayerIndex;
    }
    return undefined;
}
```

Inside `unstackPriorityQueueWithLog`, after the `isAlive` check and before the `affectedIds` loop, add:

```ts
const actorPlayerIndex = findActorPlayerIndex(state, characterId);
if (actorPlayerIndex === undefined) {
    log.push({ characterId, skipped: true, changes: [] });
    continue;
}
validateTarget(face.targetConstraint, actorPlayerIndex, targetedPosition);
```

The full inner loop should now look like:

```ts
for (const [face, targetedPosition, characterId] of shuffled(state.priorityQueue[i])) {
    if (!isAlive(state, characterId)) {
        log.push({ characterId, skipped: true, changes: [] });
        continue;
    }

    const actorPlayerIndex = findActorPlayerIndex(state, characterId);
    if (actorPlayerIndex === undefined) {
        log.push({ characterId, skipped: true, changes: [] });
        continue;
    }
    validateTarget(face.targetConstraint, actorPlayerIndex, targetedPosition);

    const affectedIds = new Set<string>();
    for (const effect of face.effects) {
        const { state: newState, affected } = effect.solve(state, targetedPosition, characterId);
        state = newState;
        affected.forEach(id => affectedIds.add(id));
    }
    // ... rest unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/PriorityQueue.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/PriorityQueue.service.ts tests/PriorityQueue.service.spec.ts
git commit -m "feat: add defense-in-depth targetConstraint guard in resolution pipeline"
```

---

### Task 6: Remove manual guard from SwapAlly and update Swap tests

**Files:**
- Modify: `src/domain/strategies/Swap.class.ts`
- Modify: `tests/Swap.spec.ts`

- [ ] **Step 1: Update Swap.spec.ts baseDieInstructions**

Open `tests/Swap.spec.ts`. The `baseDieInstructions` array defines the test die. Add `targetConstraint` import and update the SwapAlly face entry:

Add import:
```ts
import TargetConstraint from "@domain/types/TargetConstraint.type";
```

In the `baseDieInstructions` array, find the SwapAlly entry and add `targetConstraint`:
```ts
{ description: "SwapAlly", priority: 1, effects: [{ effect: EffectLabel.SwapAlly, magnitude: 0 }], targetConstraint: TargetConstraint.ALLY_ONLY },
```

For PushLeft/PushRight entries, add `targetConstraint: TargetConstraint.ANY`.
For MoveToSlot entries, add `targetConstraint: TargetConstraint.ANY`.
For SingleTargetDamage entries, add `targetConstraint: TargetConstraint.ENEMY_ONLY`.

- [ ] **Step 2: Update the "enemy target" test in Swap.spec.ts**

Find the test that verifies SwapAlly does nothing when targeting an enemy (it currently asserts `affected` is empty). Replace it with a test that verifies the constraint is enforced at assignment time:

```ts
it('throws ALLY_ONLY error when attempting to assign enemy target to SwapAlly face', () => {
    const char = team1[0];
    const withAllyFace = { ...char, face: die[1] }; // face index 1 is SwapAlly
    const player = { ...player1, team: player1.team.map((c, i) => i === 0 ? withAllyFace : c) };
    const enemyPos: Position = { playerIndex: 1, slot: 2 };
    expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos)).toThrow('ALLY_ONLY');
});
```

Add `selectTargetOfCharacter` to imports if not already there:
```ts
import { selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
```

- [ ] **Step 3: Run tests to verify current state**

Run: `npx jest tests/Swap.spec.ts`
Expected: PASS (the guard in SwapAlly is still present so nothing broke yet)

- [ ] **Step 4: Remove the manual guard from SwapAlly**

Open `src/domain/strategies/Swap.class.ts`. Remove this line from `SwapAlly.solve()`:

```ts
if (target.playerIndex !== actorPlayerIndex) return { state: gameState, affected: [] };
```

The `solve` method becomes:

```ts
solve(gameState: GameState, target: Position, actorId: string): { state: GameState; affected: string[] } {
    let actorSlot: number | undefined;
    let actorPlayerIndex: number | undefined;

    for (let pi = 0; pi < gameState.players.length; pi++) {
        const idx = gameState.players[pi].team.findIndex(c => c.id === actorId);
        if (idx !== -1) { actorSlot = idx; actorPlayerIndex = pi; break; }
    }

    if (actorSlot === undefined || actorPlayerIndex === undefined) return { state: gameState, affected: [] };

    return swapSlotsOnSameTeam(gameState, actorPlayerIndex, actorSlot, target.slot);
}
```

- [ ] **Step 5: Run Swap tests**

Run: `npx jest tests/Swap.spec.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/strategies/Swap.class.ts tests/Swap.spec.ts
git commit -m "refactor: remove manual team guard from SwapAlly, enforced by TargetConstraint"
```

---

### Task 7: Update Diana.json template, DieFaceDTO, and GameStateMapper

**Files:**
- Modify: `tmplt/Diana.json`
- Modify: `src/application/dtos/GameState.dto.ts`
- Modify: `src/application/mappers/GameStateMapper.ts`

- [ ] **Step 1: Update Diana.json**

Replace the contents of `tmplt/Diana.json` with:

```json
{
    "name": "Diana",
    "maxHp": 20,
    "baseSpeed": 1,
    "baseDieInstructions": [
        { "description": "Deal 4 damage to a single target.", "priority": 3, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }] },
        { "description": "Push a target one step to the left.", "priority": 1, "targetConstraint": "ANY", "effects": [{ "effect": "PushLeft", "magnitude": 1 }] },
        { "description": "Deal 5 damage to a single target.", "priority": 4, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }] },
        { "description": "Push a target one step to the right.", "priority": 2, "targetConstraint": "ANY", "effects": [{ "effect": "PushRight", "magnitude": 1 }] },
        { "description": "Deal 3 cleave damage.", "priority": 2, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Deal 6 damage and gain 2 shield.", "priority": 5, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 6 }, { "effect": "SelfShield", "magnitude": 2 }] }
    ]
}
```

- [ ] **Step 2: Run full test suite to verify template is still valid**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Update DieFaceDTO**

In `src/application/dtos/GameState.dto.ts`, update `DieFaceDTO`:

```ts
export type DieFaceDTO = {
    description: string;
    priority: number;
    targetConstraint: string;
};
```

- [ ] **Step 4: Update GameStateMapper.faceToDTO**

In `src/application/mappers/GameStateMapper.ts`, update the `faceToDTO` method:

```ts
private static faceToDTO(face: DieFace): DieFaceDTO {
    return {
        description: face.description,
        priority: face.priority,
        targetConstraint: face.targetConstraint,
    };
}
```

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add tmplt/Diana.json src/application/dtos/GameState.dto.ts src/application/mappers/GameStateMapper.ts
git commit -m "feat: expose targetConstraint in DieFaceDTO and update Diana.json template"
```
