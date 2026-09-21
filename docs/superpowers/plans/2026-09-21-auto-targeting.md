# Auto-targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the ASSIGN phase: every die-face effect carries predefined target cells (absolute or relative groups) that the server resolves at the moment the effect resolves.

**Architecture:** A pure `resolveTargets(groups, actorPosition)` turns template target groups into board positions. The 15 effect strategies collapse into 4 generic ones (`Damage`, `Heal`, `Shield`, `Swap`) whose `solve` receives `Position[]`. The priority queue only carries ordering; the engine resolves each effect's cells just before applying it, from the actor's current position. KEEP flows straight into RESOLVE.

**Tech Stack:** TypeScript, NestJS, Jest (ts-jest, type-checked — a test file that no longer compiles fails its suite).

**Spec:** `docs/superpowers/specs/2026-09-21-auto-targeting-design.md`

## Global Constraints

- Backend only. Do not touch `Goodlock-frontend`.
- Board: 5 slots per side, `SlotIndex` 0..4, `PlayerIndex` 0..1. `ENEMY` relative offset 0 = enemy with the same slot index as the actor.
- `TargetGroup = { side: 'ALLY' | 'ENEMY'; mode: 'ABSOLUTE' | 'RELATIVE'; n: number[] }`. ABSOLUTE `n` ∈ 0..4, RELATIVE `n` ∈ -4..4.
- Out-of-board relative cells are dropped; an effect with 0 resolved cells fizzles (no-op, logged with `targets: []`). A cell reached twice is hit once.
- `Swap`: exactly 2 numbers in total across its groups, all groups the same `side`; fizzles unless exactly 2 distinct cells resolve.
- Dead characters stay targetable (damage wasted); `gainHp` already refuses to heal the dead — keep it.
- Domain tests never import NestJS. Tests live in `tests/`.
- Conventional commits, each ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Work on branch `feat/auto-targeting` (create it from `main` before Task 1: `git checkout -b feat/auto-targeting`).

## File map

| File | Change |
|---|---|
| `src/domain/types/TargetGroup.type.ts` | **new** — `Side`, `TargetMode`, `TargetGroup` |
| `src/domain/services/TargetResolution.service.ts` | **new** — `resolveTargets`, `validateEffectTargets` |
| `src/domain/services/Position.service.ts` | replace targeting fns with `findOccupants` |
| `src/domain/strategies/Damage.class.ts`, `Heal.class.ts`, `Shield.class.ts` | **new** |
| `src/domain/strategies/Swap.class.ts` | becomes the generic `Swap` (keeps `swapSlotsOnSameTeam`) |
| other `src/domain/strategies/*.class.ts` | **deleted** |
| `src/domain/types/Effect.type.ts` | `solve(gs, targets: readonly Position[], actorId)` |
| `src/domain/types/EffectLabels.type.ts` | 4 labels |
| `src/domain/types/DieFace.type.ts` | `effects: readonly FaceEffect[]`, no `targetConstraint` |
| `src/domain/types/BaseDieInstructions.type.ts` | `EffectEntry.targets`, no `targetConstraint` |
| `src/domain/types/Character.type.ts` | drop `target` |
| `src/domain/types/PriorityQueue.type.ts` | `QueueEntry = [DieFace, actorId, speed]`, `ResolveStep.effects` |
| `src/domain/types/TargetConstraint.type.ts`, `TargetingFunction.type.ts`, `services/TargetValidator.ts` | **deleted** |
| `src/domain/types/GamePhase.type.ts`, `services/Phase.service.ts`, `services/GameLoop.service.ts`, `services/Claim.service.ts` | no ASSIGN |
| `src/domain/services/CharacterGeneration.service.ts`, `GameInit.service.ts`, `PriorityQueue.service.ts`, `Player.service.ts`, `Character.service.ts`, `Round.service.ts` | adapt |
| `src/application/services/GameCoordinator.service.ts` | no assignment; last `confirmKeep` resolves the round |
| `src/application/dtos/GameState.dto.ts`, `mappers/GameStateMapper.ts` | face `effects[]`, no `target`, `ResolveStepDTO.effects` |
| `src/infrastructure/adapters/websocket/session.gateway.ts`, `payloads/ConfirmAssignment.payload.ts` | remove assignment handlers / delete payload |
| `src/index.ts` | exports |
| `tmplt/*.json` | migrated |
| `tests/helpers/targets.ts` | **new** — shorthand builders for tests |
| `CLAUDE.md` | architecture notes |

---

### Task 1: Target groups and `resolveTargets`

**Files:**
- Create: `src/domain/types/TargetGroup.type.ts`
- Create: `src/domain/services/TargetResolution.service.ts`
- Create: `tests/helpers/targets.ts`
- Test: `tests/TargetResolution.service.spec.ts`

**Interfaces:**
- Produces: `type Side = 'ALLY' | 'ENEMY'`, `type TargetMode = 'ABSOLUTE' | 'RELATIVE'`, `type TargetGroup` (default export) in `@domain/types/TargetGroup.type`; `resolveTargets(groups: readonly TargetGroup[], actor: Position): Position[]` in `@domain/services/TargetResolution.service`; test helpers `enemyAbs`, `allyAbs`, `enemyRel`, `allyRel` (`(...n: number[]) => TargetGroup`) in `tests/helpers/targets.ts`.

- [ ] **Step 1: Create the type**

```ts
// src/domain/types/TargetGroup.type.ts
export type Side = 'ALLY' | 'ENEMY';
export type TargetMode = 'ABSOLUTE' | 'RELATIVE';

/**
 * A group of target cells for one effect. Side is relative to the acting
 * character's team. ABSOLUTE: n are slots (0..4). RELATIVE: n are offsets
 * added to the actor's current slot (-4..4).
 */
type TargetGroup = {
    readonly side: Side;
    readonly mode: TargetMode;
    readonly n: readonly number[];
};

export default TargetGroup;
```

- [ ] **Step 2: Create the test helpers**

```ts
// tests/helpers/targets.ts
import TargetGroup from "@domain/types/TargetGroup.type";

export const enemyAbs = (...n: number[]): TargetGroup => ({ side: 'ENEMY', mode: 'ABSOLUTE', n });
export const allyAbs  = (...n: number[]): TargetGroup => ({ side: 'ALLY',  mode: 'ABSOLUTE', n });
export const enemyRel = (...n: number[]): TargetGroup => ({ side: 'ENEMY', mode: 'RELATIVE', n });
export const allyRel  = (...n: number[]): TargetGroup => ({ side: 'ALLY',  mode: 'RELATIVE', n });
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/TargetResolution.service.spec.ts
import { resolveTargets } from "@domain/services/TargetResolution.service";
import Position from "@domain/types/Position.type";
import { enemyAbs, allyAbs, enemyRel, allyRel } from "./helpers/targets";

const p0s2: Position = { playerIndex: 0, slot: 2 };
const p1s0: Position = { playerIndex: 1, slot: 0 };

describe('resolveTargets', () => {
    it('maps ALLY to the actor team and ENEMY to the other team', () => {
        expect(resolveTargets([allyAbs(3)], p0s2)).toEqual([{ playerIndex: 0, slot: 3 }]);
        expect(resolveTargets([enemyAbs(3)], p0s2)).toEqual([{ playerIndex: 1, slot: 3 }]);
        expect(resolveTargets([enemyAbs(3)], p1s0)).toEqual([{ playerIndex: 0, slot: 3 }]);
    });

    it('ABSOLUTE ignores the actor slot', () => {
        expect(resolveTargets([enemyAbs(0, 4)], p0s2)).toEqual([
            { playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 4 },
        ]);
    });

    it('RELATIVE adds the offset to the actor slot', () => {
        expect(resolveTargets([enemyRel(-1, 0, 1)], p0s2)).toEqual([
            { playerIndex: 1, slot: 1 }, { playerIndex: 1, slot: 2 }, { playerIndex: 1, slot: 3 },
        ]);
        expect(resolveTargets([allyRel(0)], p0s2)).toEqual([{ playerIndex: 0, slot: 2 }]);
    });

    it('drops relative cells outside the board', () => {
        expect(resolveTargets([enemyRel(-1, 0, 1)], p1s0)).toEqual([
            { playerIndex: 0, slot: 0 }, { playerIndex: 0, slot: 1 },
        ]);
    });

    it('returns [] when every cell is off the board (fizzle)', () => {
        expect(resolveTargets([allyRel(-1)], p1s0)).toEqual([]);
        expect(resolveTargets([], p1s0)).toEqual([]);
    });

    it('flattens several groups, mixing sides and modes, preserving order', () => {
        expect(resolveTargets([enemyAbs(0, 1, 2), allyRel(0)], p0s2)).toEqual([
            { playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 1 }, { playerIndex: 1, slot: 2 },
            { playerIndex: 0, slot: 2 },
        ]);
    });

    it('keeps a cell reached twice only once', () => {
        expect(resolveTargets([enemyRel(0), enemyAbs(2)], p0s2)).toEqual([{ playerIndex: 1, slot: 2 }]);
    });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx jest tests/TargetResolution.service.spec.ts`
Expected: FAIL — cannot find module `@domain/services/TargetResolution.service`.

- [ ] **Step 5: Implement**

```ts
// src/domain/services/TargetResolution.service.ts
import Position, { PlayerIndex, SlotIndex } from "../types/Position.type";
import TargetGroup from "../types/TargetGroup.type";

const MIN_SLOT = 0;
const MAX_SLOT = 4;

export function resolveTargets(groups: readonly TargetGroup[], actor: Position): Position[] {
    const out: Position[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
        const playerIndex = (group.side === 'ALLY' ? actor.playerIndex : 1 - actor.playerIndex) as PlayerIndex;
        for (const n of group.n) {
            const slot = group.mode === 'ABSOLUTE' ? n : actor.slot + n;
            if (slot < MIN_SLOT || slot > MAX_SLOT) continue;
            const key = `${playerIndex}:${slot}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ playerIndex, slot: slot as SlotIndex });
        }
    }
    return out;
}
```

- [ ] **Step 6: Run to see it pass**

Run: `npx jest tests/TargetResolution.service.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/domain/types/TargetGroup.type.ts src/domain/services/TargetResolution.service.ts tests/helpers/targets.ts tests/TargetResolution.service.spec.ts
git commit -m "feat: add target groups and resolveTargets for auto-targeting"
```

---

### Task 2: Effect target validation

**Files:**
- Modify: `src/domain/services/TargetResolution.service.ts`
- Test: `tests/TargetResolution.service.spec.ts`

**Interfaces:**
- Consumes: `TargetGroup` (Task 1).
- Produces: `validateEffectTargets(effect: string, groups: readonly TargetGroup[]): string[]` — returns human-readable errors, `[]` when valid. Never throws.

- [ ] **Step 1: Append the failing tests**

```ts
// tests/TargetResolution.service.spec.ts — add import + block
import { validateEffectTargets } from "@domain/services/TargetResolution.service";
import TargetGroup from "@domain/types/TargetGroup.type";

describe('validateEffectTargets', () => {
    it('accepts valid groups', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(0, 1, 2), allyRel(0)])).toEqual([]);
        expect(validateEffectTargets('Heal', [allyRel(-4, 4)])).toEqual([]);
    });

    it('rejects an empty target list', () => {
        expect(validateEffectTargets('Damage', [])).not.toEqual([]);
    });

    it('rejects a group with no numbers', () => {
        expect(validateEffectTargets('Damage', [enemyAbs()])).not.toEqual([]);
    });

    it('rejects non-integer numbers', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(1.5)])).not.toEqual([]);
    });

    it('rejects ABSOLUTE slots outside 0..4', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(5)])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [enemyAbs(-1)])).not.toEqual([]);
    });

    it('rejects RELATIVE offsets outside -4..4', () => {
        expect(validateEffectTargets('Damage', [enemyRel(5)])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [enemyRel(-5)])).not.toEqual([]);
    });

    it('rejects an unknown side or mode', () => {
        const badSide = { side: 'FOE', mode: 'ABSOLUTE', n: [0] } as unknown as TargetGroup;
        const badMode = { side: 'ENEMY', mode: 'NEAR', n: [0] } as unknown as TargetGroup;
        expect(validateEffectTargets('Damage', [badSide])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [badMode])).not.toEqual([]);
    });

    it('rejects the same (side, mode, n) twice', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(1, 1)])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [enemyAbs(1), enemyAbs(1)])).not.toEqual([]);
    });

    it('Swap needs exactly 2 numbers on one side (modes may differ)', () => {
        expect(validateEffectTargets('Swap', [allyRel(0), allyAbs(0)])).toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(0, 1)])).toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(0)])).not.toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(-1, 0, 1)])).not.toEqual([]);
        expect(validateEffectTargets('Swap', [allyRel(0), enemyRel(0)])).not.toEqual([]);
    });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest tests/TargetResolution.service.spec.ts`
Expected: FAIL — `validateEffectTargets` is not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/services/TargetResolution.service.ts`:

```ts
const SWAP_EFFECT = 'Swap';
const MIN_OFFSET = -4;
const MAX_OFFSET = 4;

export function validateEffectTargets(effect: string, groups: readonly TargetGroup[]): string[] {
    const errors: string[] = [];
    if (!Array.isArray(groups) || groups.length === 0) return ['targets must be a non-empty array'];

    const seen = new Set<string>();
    groups.forEach((g, gi) => {
        const where = `group ${gi}`;
        if (g.side !== 'ALLY' && g.side !== 'ENEMY') errors.push(`${where}: side must be ALLY or ENEMY`);
        if (g.mode !== 'ABSOLUTE' && g.mode !== 'RELATIVE') errors.push(`${where}: mode must be ABSOLUTE or RELATIVE`);
        if (!Array.isArray(g.n) || g.n.length === 0) { errors.push(`${where}: n must be a non-empty array`); return; }
        const [min, max] = g.mode === 'ABSOLUTE' ? [MIN_SLOT, MAX_SLOT] : [MIN_OFFSET, MAX_OFFSET];
        for (const n of g.n) {
            if (!Number.isInteger(n)) { errors.push(`${where}: ${n} is not an integer`); continue; }
            if (n < min || n > max) errors.push(`${where}: ${n} is outside ${min}..${max}`);
            const key = `${g.side}:${g.mode}:${n}`;
            if (seen.has(key)) errors.push(`${where}: duplicate cell ${g.side} ${g.mode} ${n}`);
            seen.add(key);
        }
    });

    if (effect === SWAP_EFFECT) {
        const count = groups.reduce((acc, g) => acc + (Array.isArray(g.n) ? g.n.length : 0), 0);
        if (count !== 2) errors.push(`Swap needs exactly 2 cells, got ${count}`);
        if (new Set(groups.map(g => g.side)).size > 1) errors.push('Swap cells must all be on the same side');
    }
    return errors;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx jest tests/TargetResolution.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/TargetResolution.service.ts tests/TargetResolution.service.spec.ts
git commit -m "feat: validate effect target groups (ranges, duplicates, Swap arity)"
```

---

### Task 3: Generic effects `Damage`, `Heal`, `Shield`, `Swap` (additive)

The new classes use the new `solve(gs, targets: readonly Position[], actorId)` signature. They do **not** declare `implements Effect` yet (the interface changes in Task 5); TypeScript structural typing keeps everything compiling.

**Files:**
- Modify: `src/domain/services/Position.service.ts` (add `findOccupants`)
- Create: `src/domain/strategies/Damage.class.ts`, `Heal.class.ts`, `Shield.class.ts`
- Modify: `src/domain/strategies/Swap.class.ts` (add named export `Swap`)
- Test: `tests/Effects.spec.ts`

**Interfaces:**
- Produces: `findOccupants(players: readonly [Player, Player], positions: readonly Position[]): Character[]`; classes `Damage(amount)`, `Heal(amount)`, `Shield(amount)` (default exports), `Swap` (named export from `Swap.class.ts`, constructor takes no argument), all with `solve(gs: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/Effects.spec.ts
import Damage from "@domain/strategies/Damage.class";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import { Swap } from "@domain/strategies/Swap.class";
import { findOccupants } from "@domain/services/Position.service";
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import Die from "@domain/types/Die.type";
import GameState from "@domain/types/GameState.type";
import Position, { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { Player } from "@domain/types/Player.type";

// Shape-agnostic die: effects never read the die, so its face content is irrelevant.
const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const team = (pi: PlayerIndex, prefix: string) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter(`${prefix}${i}`, 20, 1, EMPTY_DIE, { playerIndex: pi, slot: i as SlotIndex })), pi);

let gs: GameState;
beforeEach(() => { gs = createGameState(team(0, 'A'), team(1, 'B')); });

const at = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot];
const pos = (playerIndex: PlayerIndex, slot: number): Position => ({ playerIndex, slot: slot as SlotIndex });
const withHp = (s: GameState, pi: PlayerIndex, slot: number, hp: number): GameState => {
    const players = [...s.players] as [Player, Player];
    players[pi] = { ...players[pi], team: players[pi].team.map((c, i) => i === slot ? { ...c, hp } : c) };
    return { ...s, players };
};
const actorId = () => at(gs, 0, 2).id;

describe('findOccupants', () => {
    it('returns the characters at the given positions, once each', () => {
        const found = findOccupants(gs.players, [pos(1, 0), pos(0, 3), pos(1, 0)]);
        expect(found.map(c => c.name)).toEqual(['B0', 'A3']);
    });
});

describe('Damage', () => {
    it('damages every occupant of the given cells, across both teams', () => {
        const { state, affected } = new Damage(5).solve(gs, [pos(1, 0), pos(1, 1), pos(0, 2)], actorId());
        expect(at(state, 1, 0).hp).toBe(15);
        expect(at(state, 1, 1).hp).toBe(15);
        expect(at(state, 0, 2).hp).toBe(15);
        expect(at(state, 1, 2).hp).toBe(20);
        expect(affected).toHaveLength(3);
    });

    it('is absorbed by shield first', () => {
        const shielded = new Shield(3).solve(gs, [pos(1, 0)], actorId()).state;
        const { state } = new Damage(5).solve(shielded, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).shield).toBe(0);
        expect(at(state, 1, 0).hp).toBe(18);
    });

    it('hits a dead occupant without effect on hp (damage wasted)', () => {
        const dead = withHp(gs, 1, 0, 0);
        const { state } = new Damage(5).solve(dead, [pos(1, 0)], actorId());
        expect(at(state, 1, 0).hp).toBe(0);
    });

    it('hits all 10 characters when given all 10 cells', () => {
        const all = [0, 1].flatMap(pi => [0, 1, 2, 3, 4].map(s => pos(pi as PlayerIndex, s)));
        const { state, affected } = new Damage(1).solve(gs, all, actorId());
        expect(affected).toHaveLength(10);
        expect(state.players.every(p => p.team.every(c => c.hp === 19))).toBe(true);
    });
});

describe('Heal', () => {
    it('heals occupants up to maxHp', () => {
        const hurt = withHp(gs, 0, 1, 10);
        const { state } = new Heal(15).solve(hurt, [pos(0, 1)], actorId());
        expect(at(state, 0, 1).hp).toBe(20);
    });

    it('does not revive a dead occupant', () => {
        const dead = withHp(gs, 0, 1, 0);
        const { state } = new Heal(5).solve(dead, [pos(0, 1)], actorId());
        expect(at(state, 0, 1).hp).toBe(0);
    });
});

describe('Shield', () => {
    it('adds shield to every occupant', () => {
        const { state } = new Shield(4).solve(gs, [pos(0, 0), pos(0, 4)], actorId());
        expect(at(state, 0, 0).shield).toBe(4);
        expect(at(state, 0, 4).shield).toBe(4);
        expect(at(state, 0, 2).shield).toBe(0);
    });
});

describe('Swap', () => {
    it('exchanges the occupants of 2 cells on the same team and keeps slots consistent', () => {
        const a = at(gs, 1, 1).id, b = at(gs, 1, 3).id;
        const { state, affected } = new Swap().solve(gs, [pos(1, 1), pos(1, 3)], actorId());
        expect(at(state, 1, 1).id).toBe(b);
        expect(at(state, 1, 3).id).toBe(a);
        expect(at(state, 1, 1).position.slot).toBe(1);
        expect(at(state, 1, 3).position.slot).toBe(3);
        expect(affected.sort()).toEqual([a, b].sort());
    });

    it('fizzles with fewer or more than 2 cells', () => {
        expect(new Swap().solve(gs, [pos(1, 1)], actorId())).toEqual({ state: gs, affected: [] });
        expect(new Swap().solve(gs, [pos(1, 1), pos(1, 2), pos(1, 3)], actorId())).toEqual({ state: gs, affected: [] });
    });

    it('fizzles when the 2 cells are on different teams', () => {
        expect(new Swap().solve(gs, [pos(0, 1), pos(1, 1)], actorId())).toEqual({ state: gs, affected: [] });
    });

    it('can move a dead character', () => {
        const dead = withHp(gs, 0, 0, 0);
        const deadId = at(dead, 0, 0).id;
        const { state } = new Swap().solve(dead, [pos(0, 0), pos(0, 4)], actorId());
        expect(at(state, 0, 4).id).toBe(deadId);
    });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest tests/Effects.spec.ts`
Expected: FAIL — cannot find module `@domain/strategies/Damage.class`.

- [ ] **Step 3: Add `findOccupants`**

Append to `src/domain/services/Position.service.ts`:

```ts
export function findOccupants(players: readonly [Player, Player], positions: readonly Position[]): Character[] {
    const out: Character[] = [];
    const seen = new Set<string>();
    for (const p of positions) {
        const char = players[p.playerIndex].team.find(c => c.position.slot === p.slot);
        if (char && !seen.has(char.id)) { seen.add(char.id); out.push(char); }
    }
    return out;
}
```

- [ ] **Step 4: Create the three stat effects**

```ts
// src/domain/strategies/Damage.class.ts
import { dealDamage } from "../services/Character.service";
import { findOccupants } from "../services/Position.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class Damage {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        const chars = findOccupants(gameState.players, targets);
        const players = applyEffectToTargets(gameState.players, chars, c => dealDamage(c, this.amount));
        return { state: { ...gameState, players }, affected: chars.map(c => c.id) };
    }
}
```

```ts
// src/domain/strategies/Heal.class.ts
import { gainHp } from "../services/Character.service";
import { findOccupants } from "../services/Position.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class Heal {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        const chars = findOccupants(gameState.players, targets);
        const players = applyEffectToTargets(gameState.players, chars, c => gainHp(c, this.amount));
        return { state: { ...gameState, players }, affected: chars.map(c => c.id) };
    }
}
```

```ts
// src/domain/strategies/Shield.class.ts
import { gainShield } from "../services/Character.service";
import { findOccupants } from "../services/Position.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class Shield {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        const chars = findOccupants(gameState.players, targets);
        const players = applyEffectToTargets(gameState.players, chars, c => gainShield(c, this.amount));
        return { state: { ...gameState, players }, affected: chars.map(c => c.id) };
    }
}
```

- [ ] **Step 5: Add the generic `Swap` to `Swap.class.ts`**

Add below `swapSlotsOnSameTeam` (keep `SwapAlly` untouched for now):

```ts
/** Exchanges the occupants of exactly 2 cells on the same team; anything else fizzles. */
export class Swap {
    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        if (targets.length !== 2) return { state: gameState, affected: [] };
        const [a, b] = targets;
        if (a.playerIndex !== b.playerIndex) return { state: gameState, affected: [] };
        return swapSlotsOnSameTeam(gameState, a.playerIndex, a.slot, b.slot);
    }
}
```

- [ ] **Step 6: Run to see it pass**

Run: `npx jest tests/Effects.spec.ts` → PASS. Then `npm run test` → all green (nothing else changed).

- [ ] **Step 7: Commit**

```bash
git add src/domain/services/Position.service.ts src/domain/strategies/Damage.class.ts src/domain/strategies/Heal.class.ts src/domain/strategies/Shield.class.ts src/domain/strategies/Swap.class.ts tests/Effects.spec.ts
git commit -m "feat: add generic Damage/Heal/Shield/Swap effects over resolved cells"
```

---

### Task 4: Remove the ASSIGN phase (KEEP → RESOLVE)

Targets are still the old `Character.target` in this task (faces with a null target simply don't fire). Only the phase flow, protocol and coordinator change.

**Files:**
- Modify: `src/domain/types/GamePhase.type.ts`, `src/domain/services/Phase.service.ts`, `src/domain/services/GameLoop.service.ts`, `src/domain/services/Claim.service.ts`
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`
- Delete: `src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts`
- Test: `tests/GameLoop.service.spec.ts`, `tests/Phase.service.spec.ts`, `tests/Claim.service.spec.ts`, `tests/GameCoordinator.claim.spec.ts`, `tests/GameCoordinator.service.spec.ts`, `tests/DomainIntegration.spec.ts`

**Interfaces:**
- Produces: `confirmKeep` returns a state in `GamePhase.RESOLVE` when the keep stage ends; `GameCoordinatorService.confirmKeep` resolves the round in that case (emits `roundResolved`, then `gameOver` or `gameStateUpdated` for the next round). `confirmAssignment` / `cancelAssignment` no longer exist anywhere.

- [ ] **Step 1: Update domain tests first**

`tests/GameLoop.service.spec.ts`:
- Import line 8 → `import { beginKeepPhase, beginRollPhase } from "@domain/services/Phase.service";`
- Import lines 10-11 → drop `confirmAssignment` and `cancelAssignment`.
- In the three tests at lines ~105-127, rename "ASSIGN" to "RESOLVE" in the titles and change `expect(result.phase).toBe(GamePhase.ASSIGN)` to `expect(result.phase).toBe(GamePhase.RESOLVE)`; also update the comment on line ~131 ("skip-to-ASSIGN" → "skip-to-RESOLVE").
- Delete `describe('confirmAssignment', …)` and `describe('cancelAssignment', …)` entirely.

`tests/Phase.service.spec.ts`: remove `beginAssignPhase` from the import and delete the line `expect(beginAssignPhase(gs).phase).toBe(GamePhase.ASSIGN);`.

`tests/Claim.service.spec.ts` and `tests/GameCoordinator.claim.spec.ts`: replace every `GamePhase.ASSIGN` with `GamePhase.KEEP` (KEEP is still a confirm phase, so the assertions keep their meaning).

`tests/DomainIntegration.spec.ts`: wherever the flow calls `beginAssignPhase(...)` / `confirmAssignment(...)`, go straight from the KEEP-ended state to `performResolve` (the KEEP-ended state is already in RESOLVE). Rename the test "PLACEMENT → ROLL → KEEP → ASSIGN → RESOLVE → RESULT…" to "PLACEMENT → ROLL → KEEP → RESOLVE → RESULT…" and assert `GamePhase.RESOLVE` after the last `confirmKeep`. Tests that set up a state with `beginAssignPhase(gs)` and then call `performResolve` must use `beginResolvePhase(gs)` instead.

- [ ] **Step 2: Update coordinator tests first**

In `tests/GameCoordinator.service.spec.ts`:
- Import line 12 → `import { beginKeepPhase } from '@domain/services/Phase.service';`; delete the `TargetConstraint` import, `const assignGs = …` and `makeTargets`.
- Replace the test `'advances to ASSIGN and emits gameStateUpdated when both confirm with rollsLeft = 0'` with:

```ts
    it('resolves the round when both confirm with rollsLeft = 0: roundResolved then next-round gameStateUpdated', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready({ ...keepGs, rollsLeft: 0 })));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.objectContaining({ resolveLog: expect.any(Array) }));
        const events = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(events).toEqual(['roundResolved', 'gameStateUpdated']);
        expect(mockWs.emitToRoom).toHaveBeenLastCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP, rollsLeft: 2 }));
    });

    it('resolves the round when both confirm with every die locked', () => {
        const allLocked = (p: Player): Player => ({ ...p, team: p.team.map(c => ({ ...c, isFaceLocked: true })) });
        const locked = { ...keepGs, players: [keepGs.players[0], allLocked(keepGs.players[1])] as [Player, Player] };
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(locked)));
        coordinator.confirmKeep(SOCKET_0, keepGs.players[0].team.map(c => c.id));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
    });

    it('resolves then emits gameOver last when a winner is found', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(withDeadEnemies(p1Ready({ ...keepGs, rollsLeft: 0 }))));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0, reason: 'elimination' });
        const events = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(events[events.length - 1]).toBe('gameOver');
    });
```

- Delete `describe('confirmAssignment', …)`, `describe('cancelAssignment', …)` and the `'emits error on second confirmAssignment'` test inside `describe('double-confirm guards', …)`.

- [ ] **Step 3: Run to see them fail**

Run: `npx jest tests/GameLoop.service.spec.ts tests/Phase.service.spec.ts tests/Claim.service.spec.ts tests/GameCoordinator.claim.spec.ts tests/GameCoordinator.service.spec.ts tests/DomainIntegration.spec.ts`
Expected: FAIL — confirmKeep still lands in ASSIGN; the coordinator emits no `roundResolved` from `confirmKeep`.

- [ ] **Step 4: Domain changes**

`src/domain/types/GamePhase.type.ts`: delete the line `ASSIGN    = "ASSIGN_PHASE",`.

`src/domain/services/Phase.service.ts`: delete `beginAssignPhase`.

`src/domain/services/GameLoop.service.ts`:
- Import: replace `beginAssignPhase` with nothing (keep `beginResolvePhase`).
- In `confirmKeep`, both `beginAssignPhase(...)` calls become `beginResolvePhase(...)`; update the comment to "skip the dead keep round and go straight to resolve with the final dice."
- Delete `confirmAssignment` and `cancelAssignment`.

`src/domain/services/Claim.service.ts`: `const CONFIRM_PHASES: readonly GamePhase[] = [GamePhase.PLACEMENT, GamePhase.KEEP];`

- [ ] **Step 5: Coordinator changes**

In `src/application/services/GameCoordinator.service.ts`:
- Remove imports `validateTarget`, `TargetConstraint`, `selectTargetOfCharacter`, `isDead`, `SlotIndex`/`Position` if now unused, `confirmAssignment as domainConfirmAssignment`, `cancelAssignment as domainCancelAssignment`.
- Delete the methods `confirmAssignment` and `cancelAssignment`.
- Add a private method (the body is the tail of the old `confirmAssignment`):

```ts
    private resolveRound(roomId: string, gs: GameState): void {
        const { state: resolved, log } = performResolve(gs);
        let next = resolved;
        const winner = checkWinner(next);

        this.roomPort.updateGameState(roomId, next);
        this.wsPort.emitToRoom(roomId, 'roundResolved', {
            gameState: GameStateMapper.toDTO(next),
            resolveLog: GameStateMapper.resolveStepsToDTO(log),
        });

        if (winner !== null) {
            const payload: GameOverDTO = { winner, reason: 'elimination' };
            this.wsPort.emitToRoom(roomId, 'gameOver', payload);
            return;
        }
        next = performRoll(beginRollPhase(endOfRound(next)));
        this.roomPort.updateGameState(roomId, next);
        this.wsPort.emitToRoom(roomId, 'gameStateUpdated', this.withTimers(roomId, GameStateMapper.toDTO(next), next));
    }
```

- In `doConfirm`, right after `const confirmed = domainFn(gs, playerIndex);`, insert:

```ts
            if (confirmed.phase === GamePhase.RESOLVE) {
                // Last KEEP confirm ends the input stage: resolve immediately.
                this.resolveRound(room.roomId, confirmed);
                return;
            }
```

- [ ] **Step 6: Gateway changes**

In `src/infrastructure/adapters/websocket/session.gateway.ts` delete the `ConfirmAssignmentPayload` import and the `handleConfirmAssignment` and `handleCancelAssignment` handlers. Delete `src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts`.

- [ ] **Step 7: Check nothing references ASSIGN**

Run: `grep -rn "ASSIGN\|Assignment\|beginAssignPhase" src tests`
Expected: no output.

- [ ] **Step 8: Run everything**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A src tests
git commit -m "feat!: remove ASSIGN phase; last KEEP confirm resolves the round"
```

---

### Task 5: Switch the engine to per-effect auto-targeting

One compile-coupled switch: effect interface, labels, die faces, template loading, queue, resolution, templates, and the minimum mapper change. Tests are updated first.

**Files:**
- Modify: `src/domain/types/Effect.type.ts`, `EffectLabels.type.ts`, `DieFace.type.ts`, `BaseDieInstructions.type.ts`, `Character.type.ts`, `PriorityQueue.type.ts`
- Modify: `src/domain/services/CharacterGeneration.service.ts`, `GameInit.service.ts`, `PriorityQueue.service.ts`, `Player.service.ts`, `Character.service.ts`, `Round.service.ts`, `Position.service.ts`, `TargetResolution.service.ts`
- Modify: `src/domain/strategies/Damage.class.ts`, `Heal.class.ts`, `Shield.class.ts`, `Swap.class.ts`
- Delete: `src/domain/strategies/{SingleTargetDamage,SingleTargetHeal,SingleTargetShield,CleaveDamage,CleaveHeal,CleaveShield,FullTeamDamage,FullTeamHeal,FullTeamShield,Push,MoveToSlot,SelfDamage,SelfHeal,SelfShield}.class.ts`, `src/domain/types/TargetConstraint.type.ts`, `src/domain/types/TargetingFunction.type.ts`, `src/domain/services/TargetValidator.ts`
- Modify: `src/application/dtos/GameState.dto.ts`, `src/application/mappers/GameStateMapper.ts`, `src/index.ts`
- Modify: `tmplt/*.json` (all 10)
- Delete tests: `tests/TargetValidator.spec.ts`, `tests/SelfEffects.spec.ts`, `tests/CleaveAndFullTeam.spec.ts`, `tests/SingleTargetHeal.spec.ts`
- Modify tests: `tests/PriorityQueue.service.spec.ts`, `tests/Swap.spec.ts`, `tests/DomainIntegration.spec.ts`, `tests/CharacterGeneration.service.spec.ts`, `tests/EffectFactory.spec.ts`, `tests/templates.spec.ts`, `tests/Player.service.spec.ts`, `tests/Position.service.spec.ts`, `tests/Character.service.spec.ts`, `tests/Round.service.spec.ts`, `tests/GameStateMapper.viewer.spec.ts`, and any other spec that fails to compile

**Interfaces:**
- Consumes: `TargetGroup`, `resolveTargets`, `validateEffectTargets` (Tasks 1-2); `Damage`, `Heal`, `Shield`, `Swap`, `findOccupants` (Task 3).
- Produces:
  - `enum EffectLabel { Damage = "Damage", Heal = "Heal", Shield = "Shield", Swap = "Swap" }`
  - `type Effect = { solve(gs: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] } }`
  - `type FaceEffect = { readonly label: EffectLabel; readonly magnitude: number; readonly targets: readonly TargetGroup[]; readonly impl: Effect }` (named export of `DieFace.type.ts`)
  - `type DieFace = { readonly priority: number; readonly description: string; readonly effects: readonly FaceEffect[] }`
  - `type EffectEntry = { readonly effect: EffectLabel; readonly magnitude: number; readonly targets: readonly TargetGroup[] }`; `FaceTemplate` without `targetConstraint`
  - `type QueueEntry = readonly [DieFace, string, number]` — `[face, actorId, actorSpeed]`
  - `addEffectsToPriorityQueue(queue, dieFace, characterId, baseSpeed)` (no target)
  - `type ResolveStep = { characterId; skipped; effects: readonly { effect: EffectLabel; targets: readonly Position[] }[]; changes }`
  - `DieFaceDTO = { description; priority; effects: { effect: string; magnitude: number; targets: { side: string; mode: string; n: number[] }[] }[] }`; `CharacterDTO` without `target`

#### Test translation guide (apply to every existing spec touched in this task)

Migrated tests keep the **same cells** the old test hit, expressed as target groups (import builders from `./helpers/targets`):

| Old fixture | New `EffectEntry` |
|---|---|
| `SingleTargetDamage m` + target (enemy, slot s) | `{ effect: EffectLabel.Damage, magnitude: m, targets: [enemyAbs(s)] }` |
| `SingleTargetHeal/Shield m` + target (ally, slot s) | `Heal`/`Shield`, `[allyAbs(s)]` |
| `Cleave* m` around (side, s), s in 1..3 | `[xAbs(s-1, s, s+1)]` |
| `Cleave* m` around (side, 0) / (side, 4) | `[xAbs(0, 1)]` / `[xAbs(3, 4)]` |
| `FullTeam* m` on side | `[xAbs(0, 1, 2, 3, 4)]` |
| `Self* m` | `[allyRel(0)]` |
| `SwapAlly` actor ↔ ally slot t | `{ effect: Swap, magnitude: 0, targets: [allyRel(0), allyAbs(t)] }` |
| `PushLeft k` on (side, s) | `Swap`, `[xAbs(s, s-k)]`; boundary case → actor-relative: `[xRel(0, -k)]` with the actor placed so `slot - k < 0` |
| `PushRight k` on (side, s) | `Swap`, `[xAbs(s, s+k)]`; boundary case → `[xRel(0, k)]` with `slot + k > 4` |
| `MoveToSlot d` on (side, s) | `Swap`, `[xAbs(s, d)]` |
| `targetConstraint: …` | delete the key |
| `selectTargetOfCharacter(...)` / `setTarget(...)` / `target: …` on a character | delete — targets now live in the face |
| `[face, target, id, speed]` queue tuples, `addEffectsToPriorityQueue(q, face, target, id, speed)` | `[face, id, speed]`, `addEffectsToPriorityQueue(q, face, id, speed)` |

Tests whose subject no longer exists are **deleted**, not rewritten: target-constraint enforcement (`throws when … violated targetConstraint`, DomainIntegration "Target constraint enforcement" block, Swap.spec "throws ALLY_ONLY error…"), `selectTargetOfCharacter` block in Player.service.spec, "NONE-constraint face is queued using actor position…", "characters without an assigned target do not fire", Character.service "should set target", Round "should reset all targets to null", CharacterGeneration "defaults targetConstraint…"/"preserves explicit targetConstraint…", MoveToSlot "no-op when destination slot is out of bounds" (now a template validation error), Position.service `findSingleTarget` tests and SelfEffects `findSelf` tests (functions removed; `findOccupants` is covered by Effects.spec). The four spec files listed under "Delete tests" are fully replaced by `Effects.spec.ts` (Task 3) and the new engine tests below.

- [ ] **Step 1: Write the new engine tests in `tests/PriorityQueue.service.spec.ts`**

Apply the translation guide to the existing file, then add this block at the end of the top-level `describe`:

```ts
  describe('auto-targeting at resolution time', () => {
    const factory = buildEffectFactory();
    const face = (priority: number, effects: EffectEntry[]) =>
      generateFullDie(Array(6).fill({ description: 'f', priority, effects }) as unknown as BaseDieInstructions, factory)[0];
    const idle = face(0, []);
    const mk = (name: string, speed: number, f: DieFace, pi: PlayerIndex, slot: number) =>
      ({ ...createCharacter(name, 20, speed, [f, f, f, f, f, f], { playerIndex: pi, slot: slot as SlotIndex }), face: f });
    const teamOf = (pi: PlayerIndex, overrides: Record<number, DieFace> = {}, speeds: Record<number, number> = {}) =>
      createPlayer([0, 1, 2, 3, 4].map(s => mk(`${pi}-${s}`, speeds[s] ?? 1, overrides[s] ?? idle, pi, s)), pi);
    const run = (p0: Player, p1: Player) => {
      const gs = addAllEffectsToPriorityQueue(createGameState(p0, p1));
      return unstackPriorityQueueWithLog(gs);
    };
    const hp = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team[slot].hp;

    it('queues every character, one entry each, as [face, actorId, speed]', () => {
      const gs = addAllEffectsToPriorityQueue(createGameState(teamOf(0), teamOf(1)));
      expect(gs.priorityQueue).toHaveLength(10);
      const [f, id, speed] = gs.priorityQueue[0];
      expect(f).toBe(idle);
      expect(id).toBe(gs.players[0].team[0].id);
      expect(speed).toBe(1);
    });

    it('a relative attack hits the enemy facing the actor', () => {
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const { state } = run(teamOf(0, { 2: hit }), teamOf(1));
      expect(hp(state, 1, 2)).toBe(15);
      expect(hp(state, 1, 1)).toBe(20);
    });

    it('logs the cells each effect actually resolved to', () => {
      const hit = face(0, [
        { effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(-1, 0, 1)] },
        { effect: EffectLabel.Shield, magnitude: 1, targets: [allyRel(0)] },
      ]);
      const { log } = run(teamOf(0, { 0: hit }), teamOf(1));
      const step = log.find(s => s.effects.length === 2)!;
      expect(step.effects[0]).toEqual({ effect: EffectLabel.Damage, targets: [{ playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 1 }] });
      expect(step.effects[1]).toEqual({ effect: EffectLabel.Shield, targets: [{ playerIndex: 0, slot: 0 }] });
    });

    it('an effect whose cells are all off the board fizzles and logs targets []', () => {
      const miss = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(-1)] }]);
      const { state, log } = run(teamOf(0, { 0: miss }), teamOf(1));
      expect(state.players[1].team.every(c => c.hp === 20)).toBe(true);
      const step = log.find(s => s.effects.length === 1)!;
      expect(step).toMatchObject({ skipped: false, effects: [{ effect: EffectLabel.Damage, targets: [] }], changes: [] });
    });

    it('relative cells follow an actor moved earlier in the round', () => {
      // Fast ally at slot 0 swaps itself with the slow attacker at slot 2 → attacker now at slot 0.
      const moveAttacker = face(1, [{ effect: EffectLabel.Swap, magnitude: 0, targets: [allyAbs(0, 2)] }]);
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const { state } = run(teamOf(0, { 0: moveAttacker, 2: hit }), teamOf(1));
      expect(hp(state, 1, 0)).toBe(15);
      expect(hp(state, 1, 2)).toBe(20);
    });

    it('relative cells target a slot, so they hit whoever stands there now', () => {
      // Enemy slot 1 swaps its slots 2 and 3 first (bracket 1); then our attacker at slot 2 hits enemy slot 2.
      const enemySwap = face(1, [{ effect: EffectLabel.Swap, magnitude: 0, targets: [allyAbs(2, 3)] }]);
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const p1 = teamOf(1, { 1: enemySwap });
      const wasAtSlot3 = p1.team[3].id;
      const { state } = run(teamOf(0, { 2: hit }), p1);
      expect(state.players[1].team[2].id).toBe(wasAtSlot3);
      expect(hp(state, 1, 2)).toBe(15);
    });

    it('effects of one face resolve in order: a self-move shifts the next effect', () => {
      const moveThenHit = face(0, [
        { effect: EffectLabel.Swap, magnitude: 0, targets: [allyRel(0), allyAbs(4)] },
        { effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] },
      ]);
      const { state } = run(teamOf(0, { 1: moveThenHit }), teamOf(1));
      expect(hp(state, 1, 4)).toBe(15);
      expect(hp(state, 1, 1)).toBe(20);
    });

    it('a dead actor is skipped with no effects logged', () => {
      const hit = face(0, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }]);
      const p0 = teamOf(0, { 0: hit });
      const deadP0 = { ...p0, team: p0.team.map((c, i) => i === 0 ? { ...c, hp: 0 } : c) };
      const { state, log } = run(deadP0, teamOf(1));
      expect(hp(state, 1, 0)).toBe(20);
      expect(log.find(s => s.characterId === deadP0.team[0].id)).toEqual(
        { characterId: deadP0.team[0].id, skipped: true, effects: [], changes: [] });
    });
  });
```

Imports this block needs at the top of the file (merge with existing ones): `generateFullDie`, `createCharacter` from `@domain/services/CharacterGeneration.service`; `createPlayer` from `@domain/services/Player.service`; `addAllEffectsToPriorityQueue`, `unstackPriorityQueueWithLog` from `@domain/services/PriorityQueue.service`; `EffectLabel`; `DieFace`; `BaseDieInstructions, EffectEntry` from `@domain/types/BaseDieInstructions.type`; `GameState`; `Player`; `PlayerIndex, SlotIndex`; `{ enemyRel, allyRel, allyAbs }` from `./helpers/targets`.

- [ ] **Step 2: Update the other specs per the translation guide**

- Delete `tests/TargetValidator.spec.ts`, `tests/SelfEffects.spec.ts`, `tests/CleaveAndFullTeam.spec.ts`, `tests/SingleTargetHeal.spec.ts`.
- `tests/Swap.spec.ts`: rewrite the die instructions and the `resolve` helper so each face carries its cells; keep every behaviour test except those listed as deleted above. The `resolve` helper becomes:

```ts
function resolve(gs: GameState, actorId: string, faceIndex: number): GameState {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(), actor.baseDie[faceIndex], actorId, actor.baseSpeed),
    };
    return unstackPriorityQueueWithLog(state).state;
}
```
  and tests that need a specific target build a one-off face with `generateFullDie` whose `Swap` entry lists the cells from the guide.
- `tests/DomainIntegration.spec.ts`: migrate fixtures per the guide; keep all behaviour blocks except "Target constraint enforcement" and "characters without an assigned target do not fire"; rename "NONE-constraint self-effects" to "Self-targeted effects".
- `tests/EffectFactory.spec.ts`: the three registration tests use `EffectLabel.Damage/Heal/Shield` with `Damage`/`Heal`/`Shield` classes; add one for `EffectLabel.Swap` → `Swap`.
- `tests/CharacterGeneration.service.spec.ts`: replace the two `targetConstraint` tests with:

```ts
  it('carries label, magnitude and targets on each face effect', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] }] }) });
    const c = createCharacterFromJsonTemplate(json, factory);
    expect(c.baseDie[0].effects[0]).toMatchObject({
      label: 'Damage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }],
    });
  });

  it.each([
    ['empty targets', []],
    ['slot out of range', [{ side: 'ENEMY', mode: 'ABSOLUTE', n: [7] }]],
    ['missing targets', undefined],
  ])('throws on invalid targets (%s)', (_label, targets) => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Damage', magnitude: 4, targets }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow(/Invalid targets/);
  });

  it('throws on a Swap with 3 cells', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'Swap', magnitude: 0, targets: [{ side: 'ALLY', mode: 'ABSOLUTE', n: [0, 1, 2] }] }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow(/Invalid targets/);
  });

  it('throws on an unknown effect label', () => {
    const json = JSON.stringify({ name: 'T', maxHp: 10, baseSpeed: 3, baseDieInstructions: Array(6).fill(
      { description: 'd', priority: 0, effects: [{ effect: 'SingleTargetDamage', magnitude: 4, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] }) });
    expect(() => createCharacterFromJsonTemplate(json, factory)).toThrow();
  });
```
- `tests/templates.spec.ts`: add

```ts
  it.each(files)("%s has no targetConstraint and targets on every effect", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    for (const face of tmpl.baseDieInstructions) {
      expect(face.targetConstraint).toBeUndefined();
      for (const e of face.effects) {
        expect(["Damage", "Heal", "Shield", "Swap"]).toContain(e.effect);
        expect(Array.isArray(e.targets) && e.targets.length > 0).toBe(true);
      }
    }
  });
```
- `tests/GameStateMapper.viewer.spec.ts`: `FACE` becomes `{ description: 'd', priority: 1, effects: [] }`; drop the `TargetConstraint` import and `target:` on the fixture; delete the two target assertions pairs (lines ~30-33 test and lines ~55-56) — replace the first test with:

```ts
    it('exposes no target field on characters', () => {
        const dto = GameStateMapper.toDTOForViewer(gs, 0);
        expect(dto.players.every(p => p.team.every(c => !('target' in c)))).toBe(true);
    });
```
  and in the "masks player 0 when the viewer is player 1" test keep only the lock-masking assertions.
- `tests/Player.service.spec.ts`, `tests/Position.service.spec.ts`, `tests/Character.service.spec.ts`, `tests/Round.service.spec.ts`: delete the tests listed as deleted above and any now-unused imports.

- [ ] **Step 3: Run to see them fail**

Run: `npm run test`
Expected: FAIL — compilation errors (`EffectLabel.Damage` missing, `ResolveStep.effects` missing, `addEffectsToPriorityQueue` arity, etc.).

- [ ] **Step 4: Domain types**

```ts
// src/domain/types/EffectLabels.type.ts
enum EffectLabel {
    Damage = "Damage",
    Heal   = "Heal",
    Shield = "Shield",
    Swap   = "Swap",
}

export default EffectLabel;
```

```ts
// src/domain/types/Effect.type.ts
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

type Effect = {
    solve(gameState: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] };
};

export default Effect;
```

```ts
// src/domain/types/DieFace.type.ts
import Effect from "./Effect.type";
import EffectLabel from "./EffectLabels.type";
import TargetGroup from "./TargetGroup.type";

export type FaceEffect = {
    readonly label: EffectLabel;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
    readonly impl: Effect;
};

type DieFace = {
    readonly priority: number;
    readonly description: string;
    readonly effects: readonly FaceEffect[];
};

export default DieFace;
```

```ts
// src/domain/types/BaseDieInstructions.type.ts
import EffectLabel from "./EffectLabels.type";
import TargetGroup from "./TargetGroup.type";

export type EffectEntry = {
    readonly effect: EffectLabel;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
};

export type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
```

`src/domain/types/Character.type.ts`: delete `readonly target: Position | null;` (and the `Position` import only if unused — `position` still uses it, so keep it).

```ts
// src/domain/types/PriorityQueue.type.ts
import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";
import EffectLabel from "./EffectLabels.type";

// [dieFace, actorId, actorSpeed] — targets are resolved per effect at resolution time.
export type QueueEntry = readonly [DieFace, string, number];

export type ResolvedEffect = {
    readonly effect: EffectLabel;
    readonly targets: readonly Position[];   // [] = fizzled
};

export type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly effects: readonly ResolvedEffect[];
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[];
export default PriorityQueue;
```

Delete `src/domain/types/TargetConstraint.type.ts`, `src/domain/types/TargetingFunction.type.ts`, `src/domain/services/TargetValidator.ts`.

- [ ] **Step 5: Strategies**

- Add `implements Effect` (and `import Effect from "../types/Effect.type";`) to `Damage`, `Heal`, `Shield`.
- `src/domain/strategies/Swap.class.ts`: delete the `SwapAlly` class; the generic class becomes the default export: `export default class Swap implements Effect { … }` (same body as Task 3). Update the import in `tests/Effects.spec.ts` to `import Swap from "@domain/strategies/Swap.class";`.
- Delete the 14 old strategy files listed in **Files**.
- `src/domain/services/Position.service.ts`: delete `findSingleTarget`, `findAdjacentTargets`, `findFullTeam`, `findSelf` and the `TargetingFunction` import; keep `findOccupants`.
- `src/domain/services/TargetResolution.service.ts`: replace `const SWAP_EFFECT = 'Swap';` with `import EffectLabel from "../types/EffectLabels.type";` and compare `effect === EffectLabel.Swap`.

- [ ] **Step 6: Factory and template loading**

`src/domain/services/GameInit.service.ts` — replace the strategy imports and `buildEffectFactory` with:

```ts
import Damage from "../strategies/Damage.class";
import Heal from "../strategies/Heal.class";
import Shield from "../strategies/Shield.class";
import Swap from "../strategies/Swap.class";

export function buildEffectFactory(): EffectFactory {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Damage, (amount) => new Damage(amount));
    factory.registerEffect(EffectLabel.Heal,   (amount) => new Heal(amount));
    factory.registerEffect(EffectLabel.Shield, (amount) => new Shield(amount));
    factory.registerEffect(EffectLabel.Swap,   () => new Swap());
    return factory;
}
```

`src/domain/services/CharacterGeneration.service.ts`:
- Remove the `TargetConstraint` import; add `import { validateEffectTargets } from "./TargetResolution.service";`.
- In `createCharacter`, delete `target: null,`.
- Replace `generateFullDie`, `generateFaceFromEffectEntries`, `addEffectToFace` with:

```ts
export function generateFullDie(baseDieInstructions: BaseDieInstructions, factory: EffectFactory): Die {
    return baseDieInstructions.map(faceData =>
        generateFaceFromEffectEntries(
            { description: faceData.description, priority: faceData.priority, effects: [] },
            faceData.effects,
            factory,
        )
    ) as Die;
}

export function generateFaceFromEffectEntries(face: DieFace, effectEntries: readonly EffectEntry[], factory: EffectFactory): DieFace {
    return effectEntries.reduce((acc, entry) => addEffectToFace(acc, entry, factory), face);
}

export function addEffectToFace(dieFace: DieFace, entry: EffectEntry, factory: EffectFactory): DieFace {
    // Template load is a startup boundary: a bad template is a non-recoverable config error.
    const errors = validateEffectTargets(entry.effect, entry.targets ?? []);
    if (errors.length > 0) {
        throw new Error(`Invalid targets for effect "${entry.effect}" on face "${dieFace.description}": ${errors.join('; ')}`);
    }
    const impl = factory.createEffect(entry.effect, entry.magnitude);
    return {
        ...dieFace,
        effects: [...dieFace.effects, { label: entry.effect, magnitude: entry.magnitude, targets: entry.targets, impl }],
    };
}
```

- [ ] **Step 7: Remove character targets elsewhere**

- `src/domain/services/Character.service.ts`: delete `setTarget` (and the `Position` import if unused).
- `src/domain/services/Player.service.ts`: delete `selectTargetOfCharacter`, the `validateTarget` import and `setTarget` from the Character.service import.
- `src/domain/services/Round.service.ts`: `resetShield({ ...c, target: null })` → `resetShield(c)`.

- [ ] **Step 8: Queue and resolution**

In `src/domain/services/PriorityQueue.service.ts`:
- Remove imports of `validateTarget` and `TargetConstraint`; add `import { resolveTargets } from "./TargetResolution.service";` and `import { ResolvedEffect } from "../types/PriorityQueue.type";` (merge with the existing import). Drop `findActorPlayerIndex` (unused after this change) and the `Position`/`PlayerIndex` imports if unused.
- Replace `addEffectsToPriorityQueue` and `addAllEffectsToPriorityQueue`:

```ts
export function addEffectsToPriorityQueue(
    priorityQueue: PriorityQueue,
    dieFace: DieFace,
    characterId: string,
    baseSpeed: number
): PriorityQueue {
    const newEntry: QueueEntry = [dieFace, characterId, baseSpeed];
    return [...priorityQueue, newEntry];
}

export function addAllEffectsToPriorityQueue(gameState: GameState): GameState {
    let queue = gameState.priorityQueue;
    gameState.players.forEach(player => player.team.forEach(char => {
        queue = addEffectsToPriorityQueue(queue, char.face, char.id, char.baseSpeed);
    }));
    return { ...gameState, priorityQueue: queue };
}
```

- In `orderedForResolution`, the speed is now index 2: `(b[0].priority - a[0].priority) || (b[2] - a[2])`.
- Replace the loop in `unstackPriorityQueueWithLog`:

```ts
    for (const [face, characterId] of orderedForResolution(state.priorityQueue)) {
        if (!isAlive(state, characterId) || findCharacter(state, characterId) === undefined) {
            log.push({ characterId, skipped: true, effects: [], changes: [] });
            continue;
        }

        const affectedIds = new Set<string>();
        const effects: ResolvedEffect[] = [];
        for (const faceEffect of face.effects) {
            // Cells are resolved just before each effect, from the actor's *current*
            // position — an earlier swap (this face or another actor's) shifts them.
            const actor = findCharacter(state, characterId)!;
            const targets = resolveTargets(faceEffect.targets, actor.position);
            effects.push({ effect: faceEffect.label, targets });
            if (targets.length === 0) continue;
            const { state: newState, affected } = faceEffect.impl.solve(state, targets, characterId);
            state = newState;
            affected.forEach(id => affectedIds.add(id));
        }

        const changes = [...affectedIds]
            .map(id => findCharacter(state, id))
            .filter((c): c is Character => c !== undefined)
            .map(c => ({ characterId: c.id, character: c }));

        log.push({ characterId, skipped: false, effects, changes });
    }
```

- [ ] **Step 9: Mapper and DTO (compile-coupled minimum)**

`src/application/dtos/GameState.dto.ts`:

```ts
export type TargetGroupDTO = { side: string; mode: string; n: number[] };

export type FaceEffectDTO = { effect: string; magnitude: number; targets: TargetGroupDTO[] };

export type DieFaceDTO = {
    description: string;
    priority: number;
    effects: FaceEffectDTO[];
};
```
and delete `target: { playerIndex: number; slot: number } | null;` from `CharacterDTO`.

`src/application/mappers/GameStateMapper.ts`:
- `characterToDTO`: delete `target: char.target,`.
- `toDTOForViewer`: delete `target: null,` in the enemy-team map.
- `faceToDTO`:

```ts
    private static faceToDTO(face: DieFace): DieFaceDTO {
        return {
            description: face.description,
            priority: face.priority,
            effects: face.effects.map(e => ({
                effect: e.label,
                magnitude: e.magnitude,
                targets: e.targets.map(g => ({ side: g.side, mode: g.mode, n: [...g.n] })),
            })),
        };
    }
```

- [ ] **Step 10: Exports**

In `src/index.ts`: delete the three `strategies/SingleTarget*` exports and the `TargetingFunction.type` export; add

```ts
export * from "./domain/services/TargetResolution.service";
export * from "./domain/types/TargetGroup.type";
export { default as Damage } from "./domain/strategies/Damage.class";
export { default as Heal } from "./domain/strategies/Heal.class";
export { default as Shield } from "./domain/strategies/Shield.class";
export { default as Swap } from "./domain/strategies/Swap.class";
```

- [ ] **Step 11: Migrate the templates**

Save this one-off script to the session scratchpad (not the repo) as `migrate-templates.mjs` and run it from the repo root with `node <scratchpad>/migrate-templates.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const ALL = [0, 1, 2, 3, 4];
const g = (side, mode, n) => ({ side, mode, n });
const MAP = {
  SingleTargetDamage: ['Damage', [g('ENEMY', 'RELATIVE', [0])],        m => `deal ${m} damage to the enemy in front`],
  CleaveDamage:       ['Damage', [g('ENEMY', 'RELATIVE', [-1, 0, 1])], m => `deal ${m} damage to the enemy in front and its neighbours`],
  FullTeamDamage:     ['Damage', [g('ENEMY', 'ABSOLUTE', ALL)],        m => `deal ${m} damage to all enemies`],
  SelfDamage:         ['Damage', [g('ALLY', 'RELATIVE', [0])],         m => `take ${m} damage`],
  SelfHeal:           ['Heal',   [g('ALLY', 'RELATIVE', [0])],         m => `heal self for ${m} HP`],
  SelfShield:         ['Shield', [g('ALLY', 'RELATIVE', [0])],         m => `gain ${m} shield`],
  SingleTargetHeal:   ['Heal',   [g('ALLY', 'RELATIVE', [1])],         m => `heal the ally in the next slot for ${m} HP`],
  SingleTargetShield: ['Shield', [g('ALLY', 'RELATIVE', [1])],         m => `grant ${m} shield to the ally in the next slot`],
  CleaveHeal:         ['Heal',   [g('ALLY', 'RELATIVE', [-1, 0, 1])],  m => `heal self and adjacent allies for ${m} HP`],
  CleaveShield:       ['Shield', [g('ALLY', 'RELATIVE', [-1, 0, 1])],  m => `grant ${m} shield to self and adjacent allies`],
  FullTeamHeal:       ['Heal',   [g('ALLY', 'ABSOLUTE', ALL)],         m => `heal all allies for ${m} HP`],
  FullTeamShield:     ['Shield', [g('ALLY', 'ABSOLUTE', ALL)],         m => `grant ${m} shield to all allies`],
  PushLeft:           ['Swap',   [g('ENEMY', 'RELATIVE', [0, -1])],    () => `swap the enemy in front with its left neighbour`],
  PushRight:          ['Swap',   [g('ENEMY', 'RELATIVE', [0, 1])],     () => `swap the enemy in front with its right neighbour`],
};

const dir = path.join(process.cwd(), 'tmplt');
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const tmpl = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
  const faces = tmpl.baseDieInstructions.map(face => {
    const phrases = [];
    const effects = face.effects.map(e => {
      const rule = MAP[e.effect];
      if (!rule) throw new Error(`${file}: unmapped effect ${e.effect}`);
      if (e.effect.startsWith('Push') && e.magnitude !== 1) throw new Error(`${file}: push magnitude ${e.magnitude}`);
      const [effect, targets, phrase] = rule;
      phrases.push(phrase(e.magnitude));
      return { effect, magnitude: effect === 'Swap' ? 0 : e.magnitude, targets };
    });
    const text = phrases.join(' and ');
    return { description: text.charAt(0).toUpperCase() + text.slice(1) + '.', priority: face.priority, effects };
  });
  const lines = faces.map(f => '        ' + JSON.stringify(f).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\{"/g, '{ "').replace(/\}/g, ' }'));
  const out = [
    '{',
    `    "name": ${JSON.stringify(tmpl.name)},`,
    `    "maxHp": ${tmpl.maxHp},`,
    `    "baseSpeed": ${tmpl.baseSpeed},`,
    '    "baseDieInstructions": [',
    lines.join(',\n'),
    '    ]',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, file), out);
  console.log(`migrated ${file}`);
}
```

Then check: `grep -c targetConstraint tmplt/*.json` → all `0`; `node -e "for (const f of require('fs').readdirSync('tmplt')) JSON.parse(require('fs').readFileSync('tmplt/'+f))"` → no error; `git diff --stat tmplt` → 10 files.

- [ ] **Step 12: Check nothing old remains**

Run: `grep -rn "targetConstraint\|TargetConstraint\|TargetValidator\|selectTarget\|setTarget\|SingleTarget\|FullTeam\|Cleave\|SwapAlly\|PushLeft\|PushRight\|MoveToSlot\|SelfHeal\|SelfShield\|SelfDamage\|findSingleTarget\|findSelf\|TargetingFunction" src tests`
Expected: no output (descriptive test titles may say "cleave"/"full team" in lowercase — only the identifiers above must be gone).

- [ ] **Step 13: Run everything**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test`
Expected: PASS. If a spec still fails to compile, fix it with the translation guide; if a behaviour test fails, the engine is wrong — do not weaken the test.

- [ ] **Step 14: Commit**

```bash
git add -A src tests tmplt
git commit -m "feat!: per-effect auto-targeting with 4 generic effects; migrate templates"
```

---

### Task 6: Expose resolved targets in `roundResolved`

**Files:**
- Modify: `src/application/dtos/GameState.dto.ts`, `src/application/mappers/GameStateMapper.ts`
- Test: `tests/GameStateMapper.viewer.spec.ts`

**Interfaces:**
- Consumes: `ResolveStep.effects` (Task 5).
- Produces: `ResolveStepDTO = { characterId; skipped; effects: { effect: string; targets: { playerIndex: number; slot: number }[] }[]; changes }`; `DieFaceDTO.effects` (Task 5) covered by a test.

- [ ] **Step 1: Write the failing tests**

Append to `tests/GameStateMapper.viewer.spec.ts`:

```ts
describe('resolveStepsToDTO', () => {
    it('maps the resolved cells of every effect, including fizzles', () => {
        const dto = GameStateMapper.resolveStepsToDTO([{
            characterId: 'x',
            skipped: false,
            effects: [
                { effect: EffectLabel.Damage, targets: [{ playerIndex: 1, slot: 2 }] },
                { effect: EffectLabel.Heal, targets: [] },
            ],
            changes: [],
        }]);
        expect(dto[0].effects).toEqual([
            { effect: 'Damage', targets: [{ playerIndex: 1, slot: 2 }] },
            { effect: 'Heal', targets: [] },
        ]);
    });
});

describe('face DTO', () => {
    it('exposes each effect with its label, magnitude and target groups', () => {
        const factory = buildEffectFactory();
        const die = generateFullDie(Array(6).fill({ description: 'd', priority: 0, effects: [
            { effect: EffectLabel.Damage, magnitude: 3, targets: [enemyRel(-1, 0, 1)] },
        ] }) as unknown as BaseDieInstructions, factory);
        const char = createCharacter('T', 10, 1, die, { playerIndex: 0, slot: 0 });
        const dto = GameStateMapper.characterToDTO(char);
        expect(dto.face.effects).toEqual([
            { effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] },
        ]);
    });
});
```

Imports to add: `EffectLabel` from `@domain/types/EffectLabels.type`; `buildEffectFactory` from `@domain/services/GameInit.service`; `generateFullDie, createCharacter` from `@domain/services/CharacterGeneration.service`; `BaseDieInstructions` from `@domain/types/BaseDieInstructions.type`; `{ enemyRel }` from `./helpers/targets`.

- [ ] **Step 2: Run to see it fail**

Run: `npx jest tests/GameStateMapper.viewer.spec.ts`
Expected: FAIL — `dto[0].effects` is undefined (the `face DTO` test already passes after Task 5).

- [ ] **Step 3: Implement**

`src/application/dtos/GameState.dto.ts`:

```ts
export type ResolvedEffectDTO = {
    effect: string;
    targets: { playerIndex: number; slot: number }[];  // [] = fizzled
};

export type ResolveStepDTO = {
    characterId: string;
    skipped: boolean;
    effects: ResolvedEffectDTO[];
    changes: ResolveChangeDTO[];
};
```

`GameStateMapper.resolveStepsToDTO`: add after `skipped`:

```ts
            effects: step.effects.map(e => ({
                effect: e.effect,
                targets: e.targets.map(t => ({ playerIndex: t.playerIndex, slot: t.slot })),
            })),
```

- [ ] **Step 4: Run to see it pass**

Run: `npx jest tests/GameStateMapper.viewer.spec.ts` → PASS; `npm run test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/dtos/GameState.dto.ts src/application/mappers/GameStateMapper.ts tests/GameStateMapper.viewer.spec.ts
git commit -m "feat: include per-effect resolved cells in roundResolved log"
```

---

### Task 7: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Domain layer bullet `strategies/`: replace "`SingleTargetDamage/Heal/Shield`; implement per-effect resolution logic" with "`Damage`, `Heal`, `Shield`, `Swap`: generic effects applied to the cells resolved for them".
- Add under Domain layer: "- `services/TargetResolution.service.ts` `resolveTargets` (template target groups → positions, from the actor's current slot) and `validateEffectTargets` (template validation)."
- Key design rules, add rule 5: "**Auto-targeting**: players never choose targets. Each effect in a template carries `targets: { side: ALLY|ENEMY, mode: ABSOLUTE|RELATIVE, n: number[] }[]`, resolved to cells just before the effect applies. Off-board cells are dropped; no cell = fizzle. Phases: PLACEMENT → ROLL → KEEP → RESOLVE → RESULT (no ASSIGN)."

- [ ] **Step 2: Full verification**

Run: `npm run test && npm run lint && npm run build`
Expected: all pass. Fix lint findings in files touched by this plan only.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document auto-targeting and removal of ASSIGN phase"
```
