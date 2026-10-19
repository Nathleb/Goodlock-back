# Pokemon-style Speed System Implementation Plan

**Status:** implemented 2026-06-17, merged in `8f054e8`

**Goal:** Replace the single fused `priority + baseSpeed` ordering axis with a Pokemon-style two-key resolution: sort by the move's priority bracket, then by character speed within the bracket, with a random tiebreak.

**Architecture:** The priority queue stops being a fixed-length array of buckets indexed by `priority + speed`. It becomes a flat list of entries, each tagged with its actor's speed. At resolution, the list is shuffled (fairness) then stable-sorted by `face.priority` desc, then `speed` desc — so equal `(bracket, speed)` keep their shuffled (random) order. The `ResolveStep` log shape is unchanged, so application/infrastructure/frontend are untouched.

**Tech Stack:** TypeScript, NestJS (domain layer is framework-free), Jest. Path aliases `@domain/*` etc.

---

## File Structure

- `src/domain/types/PriorityQueue.type.ts` — **modify**: `QueueEntry` gains a `speed` field; `PriorityQueue` becomes a flat `readonly QueueEntry[]`.
- `src/domain/services/PriorityQueue.service.ts` — **modify**: `createPriorityQueue()` no-arg → `[]`; `addEffectsToPriorityQueue` appends a flat entry; bounds guard removed; `resetPriorityQueue` → `[]`; `unstackPriorityQueueWithLog` shuffles + stable-sorts.
- `src/domain/services/GameInit.service.ts` — **modify**: `createPriorityQueue(100)` → `createPriorityQueue()`.
- `tests/PriorityQueue.service.spec.ts` — **rewrite**: drop bounds/length tests, fix bucket assertions, add bracket/speed ordering tests.
- `tests/GameLoop.service.spec.ts:188` — **modify**: bucket assertion → flat-length assertion.
- `tests/SelfEffects.spec.ts:41`, `tests/CleaveAndFullTeam.spec.ts:33`, `tests/Swap.spec.ts:41,68` — **modify**: `createPriorityQueue(10)` → `createPriorityQueue()`.
- `tests/templates.spec.ts` — **create**: integrity test for all `tmplt/*.json`.
- `tmplt/*.json` (all 10) — **modify**: re-tune `priority` to small brackets and widen `baseSpeed`.

---

## Task 1: Flatten the queue type

**Files:**
- Modify: `src/domain/types/PriorityQueue.type.ts`

- [ ] **Step 1: Replace the type definitions**

Replace the whole file with:

```ts
import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";

// [dieFace, targetPosition, actorId, actorSpeed]
export type QueueEntry = readonly [DieFace, Position, string, number];

export type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[];
export default PriorityQueue;
```

- [ ] **Step 2: Verify it compiles (will have downstream type errors — expected until Task 2)**

Run: `npx tsc --noEmit`
Expected: errors only in `PriorityQueue.service.ts` (the consumer we rewrite next). No errors reported inside `PriorityQueue.type.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types/PriorityQueue.type.ts
git commit -m "refactor: flatten PriorityQueue type and tag entries with speed"
```

---

## Task 2: Rewrite the ordering engine (TDD)

**Files:**
- Test: `tests/PriorityQueue.service.spec.ts`
- Modify: `src/domain/services/PriorityQueue.service.ts`

- [ ] **Step 1: Rewrite the spec file with the new contract**

The old spec asserts bucket indexing (`queue[1]`), a fixed length (`createPriorityQueue(15).length === 15`), and out-of-range throwing — all of which the new model deletes. Replace the **first block of tests** (the `createPriorityQueue` / `addEffectsToPriorityQueue` / `resetPriorityQueue` / `unstack-clears` cases near the top, lines ~38–67) with the versions below. Leave every later test in the file as-is **except**: globally replace `createPriorityQueue(10)` with `createPriorityQueue()`, and replace any `priorityQueue.every(bucket => bucket.length === 0)` with `priorityQueue.length === 0`.

Replace the four early tests with:

```ts
  it('creates an empty priority queue', () => {
    expect(createPriorityQueue()).toEqual([]);
  });

  it('appends one flat entry per queued action', () => {
    const queue = addEffectsToPriorityQueue(createPriorityQueue(), character.face, target, character.id, character.baseSpeed);
    expect(queue.length).toBe(1);
  });

  it('resets the priority queue to empty', () => {
    const withEffect = { ...gameState, priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(), character.face, target, character.id, character.baseSpeed) };
    const reset = resetPriorityQueue(withEffect);
    expect(reset.priorityQueue.length).toBe(0);
  });

  it('unstacks the priority queue and clears it', () => {
    const { state } = unstackPriorityQueueWithLog(gameState);
    expect(state.priorityQueue.length).toBe(0);
  });
```

Also update the `beforeEach` (line ~36) from `priorityQueue: createPriorityQueue(10)` to `priorityQueue: createPriorityQueue()`, and **delete** the test titled `should reject a finalPriority outside the queue bounds with a descriptive error` (the bounds guard is gone).

- [ ] **Step 2: Add the new ordering tests**

Append these inside the `describe('PriorityQueueService', ...)` block. They use no-op faces so no actor dies and the log order equals resolution order:

```ts
  describe('Pokemon-style ordering', () => {
    const noop = (priority: number): DieFace => ({
      priority,
      effects: [],
      description: `noop@${priority}`,
      targetConstraint: TargetConstraint.NONE,
    });
    const dieOf = (f: DieFace) => [f, f, f, f, f, f];

    const buildState = (
      entries: { face: DieFace; id: string; speed: number; playerIndex: 0 | 1 }[],
    ): GameState => {
      const a = createCharacter('A', 100, 0, dieOf(noop(0)), { playerIndex: 0, slot: 0 });
      const b = createCharacter('B', 100, 0, dieOf(noop(0)), { playerIndex: 1, slot: 0 });
      const idA = entries[0].id;
      const idB = entries[1].id;
      const charA = { ...a, id: idA };
      const charB = { ...b, id: idB };
      let q = createPriorityQueue();
      for (const e of entries) {
        const pos: Position = { playerIndex: e.playerIndex, slot: 0 as SlotIndex };
        q = addEffectsToPriorityQueue(q, e.face, pos, e.id, e.speed);
      }
      return {
        ...createGameState({ playerIndex: 0, team: [charA] }, { playerIndex: 1, team: [charB] }),
        priorityQueue: q,
      };
    };

    it('a higher bracket resolves before a lower bracket, regardless of speed', () => {
      const state = buildState([
        { face: noop(0), id: 'fast-low', speed: 100, playerIndex: 0 },
        { face: noop(1), id: 'slow-high', speed: 0, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('slow-high');
      expect(log[1].characterId).toBe('fast-low');
    });

    it('within the same bracket, the faster character resolves first', () => {
      const state = buildState([
        { face: noop(1), id: 'fast', speed: 9, playerIndex: 0 },
        { face: noop(1), id: 'slow', speed: 1, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('fast');
      expect(log[1].characterId).toBe('slow');
    });

    it('a negative bracket resolves last', () => {
      const state = buildState([
        { face: noop(-1), id: 'last', speed: 100, playerIndex: 0 },
        { face: noop(0), id: 'first', speed: 0, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log[0].characterId).toBe('first');
      expect(log[1].characterId).toBe('last');
    });

    it('equal bracket and equal speed both resolve (order not asserted)', () => {
      const state = buildState([
        { face: noop(0), id: 'x', speed: 5, playerIndex: 0 },
        { face: noop(0), id: 'y', speed: 5, playerIndex: 1 },
      ]);
      const { log } = unstackPriorityQueueWithLog(state);
      expect(log).toHaveLength(2);
      expect(log.map(s => s.characterId)).toEqual(expect.arrayContaining(['x', 'y']));
    });
  });
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `npx jest tests/PriorityQueue.service.spec.ts`
Expected: FAIL — `createPriorityQueue` still requires a `length` arg and returns array-of-arrays; ordering tests fail because the old impl indexes by `priority + speed`.

- [ ] **Step 4: Rewrite the service**

Replace the whole `src/domain/services/PriorityQueue.service.ts` with:

```ts
import PriorityQueue, { QueueEntry, ResolveStep } from "../types/PriorityQueue.type";
import Position, { PlayerIndex } from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
import GameState from "../types/GameState.type";
import { validateTarget } from "./TargetValidator";
import TargetConstraint from "../types/TargetConstraint.type";

export function createPriorityQueue(): PriorityQueue {
    return [];
}

export function addEffectsToPriorityQueue(
    priorityQueue: PriorityQueue,
    dieFace: DieFace,
    target: Position,
    characterId: string,
    baseSpeed: number
): PriorityQueue {
    const newEntry: QueueEntry = [dieFace, target, characterId, baseSpeed];
    return [...priorityQueue, newEntry];
}

export function addAllEffectsToPriorityQueue(gameState: GameState): GameState {
    let queue = gameState.priorityQueue;
    gameState.players.forEach(player => player.team.forEach(char => {
        const target = char.face.targetConstraint === TargetConstraint.NONE
            ? char.position
            : char.target;
        if (target !== null) {
            queue = addEffectsToPriorityQueue(queue, char.face, target, char.id, char.baseSpeed);
        }
    }));
    return { ...gameState, priorityQueue: queue };
}

export function resetPriorityQueue(gameState: GameState): GameState {
    return { ...gameState, priorityQueue: createPriorityQueue() };
}

function isAlive(gameState: GameState, characterId: string): boolean {
    return gameState.players.some(player =>
        player.team.some(char => char.id === characterId && char.hp > 0)
    );
}

function findCharacter(gameState: GameState, characterId: string): Character | undefined {
    for (const player of gameState.players) {
        const char = player.team.find(c => c.id === characterId);
        if (char) return char;
    }
    return undefined;
}

function findActorPlayerIndex(state: GameState, characterId: string): PlayerIndex | undefined {
    for (let pi = 0; pi < state.players.length; pi++) {
        if (state.players[pi].team.some(c => c.id === characterId)) return pi as PlayerIndex;
    }
    return undefined;
}

function shuffled<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Pokemon-style ordering: bracket (face.priority) desc, then speed desc.
// Array.prototype.sort is stable in Node, so shuffling first gives a random
// tiebreak among entries that share both bracket and speed.
function orderedForResolution(queue: PriorityQueue): QueueEntry[] {
    return shuffled(queue).sort(
        (a, b) => (b[0].priority - a[0].priority) || (b[3] - a[3])
    );
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    for (const [face, targetedPosition, characterId] of orderedForResolution(state.priorityQueue)) {
        if (!isAlive(state, characterId)) {
            log.push({ characterId, skipped: true, changes: [] });
            continue;
        }

        const actorPlayerIndex = findActorPlayerIndex(state, characterId);
        if (actorPlayerIndex === undefined) {
            log.push({ characterId, skipped: true, changes: [] });
            continue;
        }
        if (face.targetConstraint !== TargetConstraint.NONE) {
            validateTarget(face.targetConstraint, actorPlayerIndex, targetedPosition);
        }

        const affectedIds = new Set<string>();
        for (const effect of face.effects) {
            const { state: newState, affected } = effect.solve(state, targetedPosition, characterId);
            state = newState;
            affected.forEach(id => affectedIds.add(id));
        }

        const changes = [...affectedIds]
            .map(id => findCharacter(state, id))
            .filter((c): c is Character => c !== undefined)
            .map(c => ({ characterId: c.id, character: c }));

        log.push({ characterId, skipped: false, changes });
    }

    return { state: resetPriorityQueue(state), log };
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npx jest tests/PriorityQueue.service.spec.ts`
Expected: PASS (all cases including the new ordering block).

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/PriorityQueue.service.ts tests/PriorityQueue.service.spec.ts
git commit -m "feat: order resolution by priority bracket then speed (Pokemon model)"
```

---

## Task 3: Update the remaining callers

**Files:**
- Modify: `src/domain/services/GameInit.service.ts:31`
- Modify: `tests/GameLoop.service.spec.ts:188`
- Modify: `tests/SelfEffects.spec.ts:41`, `tests/CleaveAndFullTeam.spec.ts:33`, `tests/Swap.spec.ts:41`, `tests/Swap.spec.ts:68`

- [ ] **Step 1: Fix GameInit**

In `src/domain/services/GameInit.service.ts`, change line 31:

```ts
        priorityQueue: createPriorityQueue(),
```

- [ ] **Step 2: Fix the GameLoop spec bucket assertion**

In `tests/GameLoop.service.spec.ts:188`, replace:

```ts
        expect(state.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
```

with:

```ts
        expect(state.priorityQueue.length).toBe(0);
```

- [ ] **Step 3: Fix the three direct-call test helpers**

In `tests/SelfEffects.spec.ts:41` and `tests/CleaveAndFullTeam.spec.ts:33`, replace `createPriorityQueue(10)` with `createPriorityQueue()`. In `tests/Swap.spec.ts`, replace `createPriorityQueue(10)` at both line 41 and line 68 with `createPriorityQueue()`.

- [ ] **Step 4: Run the affected specs**

Run: `npx jest tests/GameLoop.service.spec.ts tests/SelfEffects.spec.ts tests/CleaveAndFullTeam.spec.ts tests/Swap.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, no type errors. (Templates still hold old priority values — that's fine; the integrity test that flags them is added in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/GameInit.service.ts tests/GameLoop.service.spec.ts tests/SelfEffects.spec.ts tests/CleaveAndFullTeam.spec.ts tests/Swap.spec.ts
git commit -m "refactor: update priority-queue callers to flat no-arg API"
```

---

## Task 4: Template integrity test (TDD red)

**Files:**
- Create: `tests/templates.spec.ts`

- [ ] **Step 1: Write the integrity test**

Create `tests/templates.spec.ts`:

```ts
import * as fs from "fs";
import * as path from "path";
import { createCharacterFromJsonTemplate } from "@domain/services/CharacterGeneration.service";
import { buildEffectFactory } from "@domain/services/GameInit.service";

const tmpltDir = path.join(__dirname, "..", "tmplt");
const files = fs.readdirSync(tmpltDir).filter(f => f.endsWith(".json"));

describe("character templates", () => {
  it("finds at least one template", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses into a valid character", (file) => {
    const content = fs.readFileSync(path.join(tmpltDir, file), "utf-8");
    const factory = buildEffectFactory();
    expect(() => createCharacterFromJsonTemplate(content, factory)).not.toThrow();
  });

  it.each(files)("%s uses small integer priority brackets in [-2, 3]", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    for (const face of tmpl.baseDieInstructions) {
      expect(Number.isInteger(face.priority)).toBe(true);
      expect(face.priority).toBeGreaterThanOrEqual(-2);
      expect(face.priority).toBeLessThanOrEqual(3);
    }
  });

  it.each(files)("%s has a widened baseSpeed (>= 2)", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    expect(tmpl.baseSpeed).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/templates.spec.ts`
Expected: FAIL — current templates have `priority` up to 5 (outside [-2,3]) and several `baseSpeed` values of 1 (below 2).

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/templates.spec.ts
git commit -m "test: add character template integrity checks for new bracket scheme"
```

---

## Task 5: Re-tune the templates (TDD green)

**Files:**
- Modify all 10 `tmplt/*.json`.

Rule applied (templates are placeholder examples; no balancing): each face's `priority` is set by its **lead (first) effect's family** — Damage family → `0`, Heal/Shield/Movement family → `1`. `baseSpeed` is widened to distinct values preserving the current relative fast/slow order.

**New `baseSpeed` per character** (replace the existing value):

| Character | old | new |
|-----------|-----|-----|
| Diana     | 1   | 2   |
| Eve       | 1   | 3   |
| George    | 1   | 4   |
| Edward    | 2   | 7   |
| Fiona     | 2   | 8   |
| Jason     | 2   | 9   |
| Charlie   | 3   | 12  |
| Hannah    | 3   | 13  |
| Robbert   | 3   | 14  |
| Alicent   | 4   | 18  |

**New `priority` per face, in file order** (replace each face's `priority`, leave all other fields identical):

| Character | face priorities (in order) |
|-----------|-----------------------------|
| Alicent   | `0, 0, 0, 0, 0, 0` |
| Charlie   | `0, 0, 0, 0, 0, 0` |
| Diana     | `0, 1, 0, 1, 0, 0` |
| Edward    | `0, 0, 0, 0, 0, 1` |
| Eve       | `0, 0, 0, 1, 1, 0` |
| Fiona     | `1, 1, 1, 1, 1, 1` |
| George    | `1, 1, 1, 1, 1, 1` |
| Hannah    | `1, 1, 1, 1, 1, 1` |
| Jason     | `0, 0, 0, 1, 0, 1` |
| Robbert   | `0, 0, 1, 0, 1, 0` |

- [ ] **Step 1: Edit each template**

For each file, set `baseSpeed` from the first table and each face's `priority` from the second table (faces are in the order they appear in the JSON). Do not change `description`, `targetConstraint`, `effects`, `name`, or `maxHp`.

Worked example — `tmplt/Diana.json` becomes:

```json
{
    "name": "Diana",
    "maxHp": 20,
    "baseSpeed": 2,
    "baseDieInstructions": [
        { "description": "Deal 4 damage to a single target.", "priority": 0, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 4 }] },
        { "description": "Push a target one step to the left.", "priority": 1, "targetConstraint": "ANY", "effects": [{ "effect": "PushLeft", "magnitude": 1 }] },
        { "description": "Deal 5 damage to a single target.", "priority": 0, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 5 }] },
        { "description": "Push a target one step to the right.", "priority": 1, "targetConstraint": "ANY", "effects": [{ "effect": "PushRight", "magnitude": 1 }] },
        { "description": "Deal 3 cleave damage.", "priority": 0, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "CleaveDamage", "magnitude": 3 }] },
        { "description": "Deal 6 damage and gain 2 shield.", "priority": 0, "targetConstraint": "ENEMY_ONLY", "effects": [{ "effect": "SingleTargetDamage", "magnitude": 6 }, { "effect": "SelfShield", "magnitude": 2 }] }
    ]
}
```

Apply the analogous edit to the other nine files using the two tables.

- [ ] **Step 2: Run the integrity test to verify it passes**

Run: `npx jest tests/templates.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run the full suite + typecheck + lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add tmplt/
git commit -m "chore: re-tune template brackets and widen speeds for Pokemon model"
```

---

## Verification (whole feature)

- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `npm test` — full suite green.
- [ ] `npm run lint` — clean.
- [ ] Manual sanity: a `+1` move resolves before a `0` move regardless of speed; two `0` moves resolve fastest-first; no out-of-range queue errors exist anywhere.

## Notes for the implementer

- The domain layer must not import NestJS — none of these files do; keep it that way.
- `face.priority` is now a *bracket modifier*, not a queue index. Negative values are legal and resolve last.
- The `ResolveStep` log shape is unchanged on purpose — do not touch `GameStateMapper`, DTOs, the gateway, or the frontend.
- Game state stays in-memory; no persistence touched.
