# Disconnect/Reconnect Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Started games survive disconnects: stable player identity, presence tracking with a 60s grace period, viewer-masked reconnect snapshots, claim-victory on forfeit/AFK, concession on quit, eviction of duplicate sockets, and a janitor for abandoned rooms.

**Architecture:** Timestamps + on-demand validation (no per-game timers). Domain gains pure functions (`evaluateClaim`, presence helpers) taking `now` as a parameter; `RoomManager` stamps `phaseStartedAt`; coordinators emit `remainingMs` values computed at emit time. Spec: `docs/superpowers/specs/2026-06-10-reconnect-lifecycle-design.md`.

**Tech Stack:** NestJS 10, Socket.io, Jest. No new dependencies.

**House rules:** TDD bottom-up (domain → application → infrastructure). Domain specs must not import NestJS. Run a single spec with `npx jest tests/<File>.spec.ts`. Commit after every green task with conventional commits.

---

### Task 1: Domain presence types + Room.service lifecycle functions

**Files:**
- Create: `src/domain/types/Presence.type.ts`
- Modify: `src/domain/types/Room.type.ts`
- Modify: `src/domain/services/Room.service.ts`
- Create: `tests/RoomPresence.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/RoomPresence.spec.ts`:

```typescript
import { createRoom, addPlayerToRoom, startRoom, resolvePlayerIndex, setPresenceInRoom } from '@domain/services/Room.service';
import GameState from '@domain/types/GameState.type';

const GS = {} as GameState; // startRoom stores it opaquely

function startedRoom() {
    return startRoom(addPlayerToRoom(createRoom('p0'), 'p1'), GS);
}

describe('startRoom presence & playerOrder', () => {
    it('snapshots playerOrder from playersId', () => {
        expect(startedRoom().playerOrder).toEqual(['p0', 'p1']);
    });

    it('initializes both players as connected', () => {
        expect(startedRoom().presence).toEqual([
            { connected: true, disconnectedAt: null },
            { connected: true, disconnectedAt: null },
        ]);
    });
});

describe('resolvePlayerIndex', () => {
    it('uses playerOrder for started rooms even after playersId changes', () => {
        const room = { ...startedRoom(), playersId: ['p1'] };
        expect(resolvePlayerIndex(room, 'p1')).toBe(1);
        expect(resolvePlayerIndex(room, 'p0')).toBe(0);
    });

    it('falls back to playersId for lobby rooms', () => {
        const room = addPlayerToRoom(createRoom('p0'), 'p1');
        expect(resolvePlayerIndex(room, 'p1')).toBe(1);
    });

    it('returns -1 for unknown ids', () => {
        expect(resolvePlayerIndex(startedRoom(), 'stranger')).toBe(-1);
    });
});

describe('setPresenceInRoom', () => {
    it('marks a player disconnected with timestamp', () => {
        const room = setPresenceInRoom(startedRoom(), 1, false, 5000);
        expect(room.presence![1]).toEqual({ connected: false, disconnectedAt: 5000 });
        expect(room.presence![0].connected).toBe(true);
    });

    it('clears disconnectedAt on reconnect', () => {
        const room = setPresenceInRoom(setPresenceInRoom(startedRoom(), 1, false, 5000), 1, true, 9000);
        expect(room.presence![1]).toEqual({ connected: true, disconnectedAt: null });
    });

    it('is a no-op on rooms without presence (lobby)', () => {
        const lobby = createRoom('p0');
        expect(setPresenceInRoom(lobby, 0, false, 5000)).toBe(lobby);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/RoomPresence.spec.ts`
Expected: FAIL — `resolvePlayerIndex` / `setPresenceInRoom` are not exported.

- [ ] **Step 3: Implement**

Create `src/domain/types/Presence.type.ts`:

```typescript
export type PlayerPresence = {
    readonly connected: boolean;
    readonly disconnectedAt: number | null;
};
```

Modify `src/domain/types/Room.type.ts` to:

```typescript
import GameState from "./GameState.type";
import { PlayerPresence } from "./Presence.type";

export type Room = {
    readonly roomId: string;
    readonly playersId: readonly string[];
    readonly ownerId: string;
    readonly isStarted: boolean;
    readonly gameState?: GameState;
    /** Snapshotted at startRoom; immutable afterwards. Index = playerIndex in gameState.players. */
    readonly playerOrder?: readonly [string, string];
    /** Indexed like playerOrder. Only present on started rooms. */
    readonly presence?: readonly [PlayerPresence, PlayerPresence];
    /** Stamped by RoomManager when phase or rollsLeft changes. Epoch ms. */
    readonly phaseStartedAt?: number;
};
```

In `src/domain/services/Room.service.ts`, add the import and replace `startRoom`, then append the two new functions:

```typescript
import { PlayerPresence } from '../types/Presence.type';

const CONNECTED: PlayerPresence = { connected: true, disconnectedAt: null };

export function startRoom(room: Room, gameState: GameState): Room {
    if (!isRoomReady(room)) throw new Error('Room is not ready to start');
    return {
        ...room,
        isStarted: true,
        gameState,
        playerOrder: [room.playersId[0], room.playersId[1]],
        presence: [CONNECTED, CONNECTED],
    };
}

export function resolvePlayerIndex(room: Room, sessionId: string): number {
    if (room.playerOrder) return room.playerOrder.indexOf(sessionId);
    return room.playersId.indexOf(sessionId);
}

export function setPresenceInRoom(room: Room, playerIndex: number, connected: boolean, now: number): Room {
    if (!room.presence) return room;
    const presence = room.presence.map((p, i) =>
        i === playerIndex ? { connected, disconnectedAt: connected ? null : now } : p
    ) as unknown as readonly [PlayerPresence, PlayerPresence];
    return { ...room, presence };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/RoomPresence.spec.ts tests/Room.service.spec.ts`
Expected: PASS (both). If an existing Room.service test compares a started room with exact `toEqual`, it now fails on the new `playerOrder`/`presence` fields — change that assertion to `expect.objectContaining(...)` on the original fields.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types/Presence.type.ts src/domain/types/Room.type.ts src/domain/services/Room.service.ts tests/RoomPresence.spec.ts
git commit -m "feat: add playerOrder, presence and stable index resolution to Room domain"
```

---

### Task 2: Domain claim rules (`evaluateClaim`, countdown helpers)

**Files:**
- Create: `src/domain/types/Claim.type.ts`
- Create: `src/domain/services/Claim.service.ts`
- Create: `tests/Claim.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/Claim.service.spec.ts`:

```typescript
import { evaluateClaim, computeAfkClaimInMs, computeForfeitClaimInMs } from '@domain/services/Claim.service';
import { ClaimConfig } from '@domain/types/Claim.type';
import { PlayerPresence } from '@domain/types/Presence.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { Player } from '@domain/types/Player.type';

const CONFIG: ClaimConfig = { graceMs: 60_000, afkLimitMs: 120_000 };
const NOW = 1_000_000;
const ONLINE: PlayerPresence = { connected: true, disconnectedAt: null };

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const empty = (i: 0 | 1): Player => ({ playerIndex: i, team: [] });
    return { phase, currentRound: 1, rollsLeft: 2, playersReady, priorityQueue: [], players: [empty(0), empty(1)] };
}

describe('evaluateClaim — forfeit ground', () => {
    const offline: PlayerPresence = { connected: false, disconnectedAt: NOW - 60_000 };

    it('valid when opponent disconnected for exactly the grace period', () => {
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, offline, NOW - 10, NOW, CONFIG))
            .toEqual({ valid: true, reason: 'forfeit' });
    });

    it('invalid when disconnected for less than the grace period', () => {
        const recent: PlayerPresence = { connected: false, disconnectedAt: NOW - 59_999 };
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, recent, NOW - 10, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid when opponent is connected', () => {
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, ONLINE, NOW - 10, NOW, CONFIG).valid).toBe(false);
    });
});

describe('evaluateClaim — AFK ground', () => {
    it('valid when claimant ready, opponent not, past the AFK limit in a confirm phase', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [true, false]), 0, ONLINE, NOW - 120_000, NOW, CONFIG))
            .toEqual({ valid: true, reason: 'afk' });
    });

    it('invalid when the claimant has not confirmed', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [false, false]), 0, ONLINE, NOW - 999_999, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid in non-confirm phases', () => {
        expect(evaluateClaim(gs(GamePhase.RESULT, [true, false]), 0, ONLINE, NOW - 999_999, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid when phaseStartedAt is unknown', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [true, false]), 0, ONLINE, undefined, NOW, CONFIG).valid).toBe(false);
    });
});

describe('countdown helpers', () => {
    it('computeAfkClaimInMs returns remaining window, floored at 0', () => {
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), NOW - 100_000, NOW, 120_000)).toBe(20_000);
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), NOW - 500_000, NOW, 120_000)).toBe(0);
    });

    it('computeAfkClaimInMs is null when both ready, in non-confirm phases, or without a stamp', () => {
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [true, true]), NOW - 1, NOW, 120_000)).toBeNull();
        expect(computeAfkClaimInMs(gs(GamePhase.RESOLVE, [false, false]), NOW - 1, NOW, 120_000)).toBeNull();
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), undefined, NOW, 120_000)).toBeNull();
    });

    it('computeForfeitClaimInMs returns remaining grace for a disconnected player, null when connected', () => {
        expect(computeForfeitClaimInMs({ connected: false, disconnectedAt: NOW - 15_000 }, NOW, 60_000)).toBe(45_000);
        expect(computeForfeitClaimInMs(ONLINE, NOW, 60_000)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/Claim.service.spec.ts`
Expected: FAIL — module `@domain/services/Claim.service` not found.

- [ ] **Step 3: Implement**

Create `src/domain/types/Claim.type.ts`:

```typescript
export type ClaimConfig = {
    readonly graceMs: number;
    readonly afkLimitMs: number;
};

export type GameOverReason = 'elimination' | 'forfeit' | 'afk' | 'concede';

export type ClaimVerdict =
    | { readonly valid: true; readonly reason: 'forfeit' | 'afk' }
    | { readonly valid: false; readonly error: string };
```

Create `src/domain/services/Claim.service.ts`:

```typescript
import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { PlayerPresence } from "../types/Presence.type";
import { ClaimConfig, ClaimVerdict } from "../types/Claim.type";

const CONFIRM_PHASES: readonly GamePhase[] = [GamePhase.PLACEMENT, GamePhase.KEEP, GamePhase.ASSIGN];

export function evaluateClaim(
    gs: GameState,
    claimantIndex: PlayerIndex,
    opponentPresence: PlayerPresence,
    phaseStartedAt: number | undefined,
    now: number,
    config: ClaimConfig,
): ClaimVerdict {
    if (!opponentPresence.connected
        && opponentPresence.disconnectedAt !== null
        && now - opponentPresence.disconnectedAt >= config.graceMs) {
        return { valid: true, reason: 'forfeit' };
    }
    const opponentIndex = (1 - claimantIndex) as PlayerIndex;
    if (CONFIRM_PHASES.includes(gs.phase)
        && gs.playersReady[claimantIndex]
        && !gs.playersReady[opponentIndex]
        && phaseStartedAt !== undefined
        && now - phaseStartedAt >= config.afkLimitMs) {
        return { valid: true, reason: 'afk' };
    }
    return { valid: false, error: 'No valid claim: opponent is neither forfeited nor AFK' };
}

export function computeAfkClaimInMs(
    gs: GameState,
    phaseStartedAt: number | undefined,
    now: number,
    afkLimitMs: number,
): number | null {
    if (!CONFIRM_PHASES.includes(gs.phase)) return null;
    if (phaseStartedAt === undefined) return null;
    if (gs.playersReady[0] && gs.playersReady[1]) return null;
    return Math.max(0, afkLimitMs - (now - phaseStartedAt));
}

export function computeForfeitClaimInMs(presence: PlayerPresence, now: number, graceMs: number): number | null {
    if (presence.connected || presence.disconnectedAt === null) return null;
    return Math.max(0, graceMs - (now - presence.disconnectedAt));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/Claim.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types/Claim.type.ts src/domain/services/Claim.service.ts tests/Claim.service.spec.ts
git commit -m "feat: add pure claim-victory rules (forfeit/AFK) and countdown helpers"
```

---

### Task 3: Viewer-aware snapshot mapper + payload DTOs

**Files:**
- Modify: `src/application/mappers/GameStateMapper.ts`
- Modify: `src/application/dtos/GameState.dto.ts`
- Create: `tests/GameStateMapper.viewer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/GameStateMapper.viewer.spec.ts`:

```typescript
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex, PlayerIndex } from '@domain/types/Position.type';
import TargetConstraint from '@domain/types/TargetConstraint.type';
import DieFace from '@domain/types/DieFace.type';

const FACE: DieFace = { description: 'd', priority: 1, effects: [], targetConstraint: TargetConstraint.ANY };

function char(id: string, playerIndex: PlayerIndex, slot: number, locked: boolean): Character {
    return {
        id, name: id, maxHp: 10, baseSpeed: 1, hp: 10, shield: 0, modifiers: [],
        baseDie: [FACE, FACE, FACE, FACE, FACE, FACE], face: FACE, isFaceLocked: locked,
        target: { playerIndex: 0, slot: 0 as SlotIndex },
        position: { playerIndex, slot: slot as SlotIndex },
    };
}

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const team = (pi: PlayerIndex): Player => ({
        playerIndex: pi,
        team: [char(`c${pi}0`, pi, 0, true), char(`c${pi}1`, pi, 1, false)],
    });
    return { phase, currentRound: 1, rollsLeft: 1, playersReady, priorityQueue: [], players: [team(0), team(1)] };
}

describe('toDTOForViewer', () => {
    it('always nulls the opponent targets, keeps own targets', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.ASSIGN, [false, true]), 0);
        expect(dto.players[1].team.every(c => c.target === null)).toBe(true);
        expect(dto.players[0].team.every(c => c.target !== null)).toBe(true);
    });

    it('masks opponent locks during KEEP when the opponent already confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, true]), 0);
        expect(dto.players[1].team.every(c => c.isFaceLocked === false)).toBe(true);
    });

    it('keeps opponent locks during KEEP when the opponent has not confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, false]), 0);
        expect(dto.players[1].team[0].isFaceLocked).toBe(true);
    });

    it('delegates to placement masking during PLACEMENT', () => {
        const viewer = GameStateMapper.toDTOForViewer(gs(GamePhase.PLACEMENT, [false, false]), 0);
        const placement = GameStateMapper.toDTOForPlacement(gs(GamePhase.PLACEMENT, [false, false]), 0);
        expect(viewer.players[1].team.map(c => c.position.slot))
            .toEqual(placement.players[1].team.map(c => c.position.slot));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/GameStateMapper.viewer.spec.ts`
Expected: FAIL — `toDTOForViewer` is not a function.

- [ ] **Step 3: Implement**

In `src/application/dtos/GameState.dto.ts`, append:

```typescript
export type GameStateUpdatePayload = GameStateDTO & {
    /** Remaining ms until an AFK claim becomes valid against the non-ready player; null when not applicable. Computed server-side at emit time. */
    afkClaimInMs: number | null;
};

export type PresenceChangedDTO = {
    playerIndex: 0 | 1;
    connected: boolean;
    /** Remaining ms until a forfeit claim becomes valid; null when connected. */
    claimInMs: number | null;
};

export type GameOverDTO = {
    winner: 0 | 1 | 'draw';
    reason: 'elimination' | 'forfeit' | 'afk' | 'concede';
};
```

In `src/application/mappers/GameStateMapper.ts`, add `import GamePhase from '@domain/types/GamePhase.type';` and this static method after `toDTOForPlacement`:

```typescript
    static toDTOForViewer(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        if (gameState.phase === GamePhase.PLACEMENT) {
            return GameStateMapper.toDTOForPlacement(gameState, viewerIndex);
        }
        const dto = GameStateMapper.toDTO(gameState);
        const enemyIndex = (1 - viewerIndex) as 0 | 1;
        const maskLocks = gameState.phase === GamePhase.KEEP && gameState.playersReady[enemyIndex];
        const enemyTeam = dto.players[enemyIndex].team.map(char => ({
            ...char,
            target: null,
            isFaceLocked: maskLocks ? false : char.isFaceLocked,
        }));
        const players = [...dto.players] as [PlayerGameStateDTO, PlayerGameStateDTO];
        players[enemyIndex] = { ...players[enemyIndex], team: enemyTeam };
        return { ...dto, players };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/GameStateMapper.viewer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/mappers/GameStateMapper.ts src/application/dtos/GameState.dto.ts tests/GameStateMapper.viewer.spec.ts
git commit -m "feat: add viewer-aware game state snapshot and lifecycle payload DTOs"
```

---

### Task 4: RoomManager — phase stamping, presence, janitor sweep

**Files:**
- Modify: `src/application/ports/RoomPort.ts`
- Modify: `src/infrastructure/adapters/managers/room.manager.ts`
- Create: `tests/RoomManager.lifecycle.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/RoomManager.lifecycle.spec.ts`:

```typescript
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';

function gs(phase: GamePhase, rollsLeft: number): GameState {
    return { phase, currentRound: 1, rollsLeft, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

function startedRoom(manager: RoomManager): string {
    const room = manager.createRoom('p0');
    manager.joinRoom('p1', room.roomId);
    manager.startGame(room.roomId, gs(GamePhase.PLACEMENT, 2));
    return room.roomId;
}

describe('phaseStartedAt stamping', () => {
    it('stamps on startGame', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        expect(manager.getRoom(roomId)!.phaseStartedAt).toEqual(expect.any(Number));
    });

    it('re-stamps on phase change, not on same-phase same-rolls updates', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        jest.spyOn(Date, 'now').mockReturnValue(111_111);
        manager.updateGameState(roomId, gs(GamePhase.PLACEMENT, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).not.toBe(111_111);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(111_111);
        jest.restoreAllMocks();
    });

    it('re-stamps on rollsLeft change within KEEP (reroll sub-round)', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        jest.spyOn(Date, 'now').mockReturnValue(222_222);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 1));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(222_222);
        jest.restoreAllMocks();
    });
});

describe('setPresence', () => {
    it('updates presence and returns the updated room', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        const updated = manager.setPresence(roomId, 1, false, 5000);
        expect(updated!.presence![1]).toEqual({ connected: false, disconnectedAt: 5000 });
        expect(manager.getRoom(roomId)!.presence![1].connected).toBe(false);
    });

    it('returns undefined for unknown rooms', () => {
        expect(new RoomManager().setPresence('nope', 0, false, 0)).toBeUndefined();
    });
});

describe('sweepAbandonedRooms', () => {
    it('deletes started rooms where all players are disconnected past the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        manager.setPresence(roomId, 1, false, 2000);
        expect(manager.sweepAbandonedRooms(2000 + 600_000, 600_000)).toEqual([roomId]);
        expect(manager.getRoom(roomId)).toBeUndefined();
    });

    it('keeps rooms where any player is connected or within the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        expect(manager.sweepAbandonedRooms(700_000, 600_000)).toEqual([]);
        expect(manager.getRoom(roomId)).toBeDefined();
    });

    it('ignores lobby rooms (no presence)', () => {
        const manager = new RoomManager();
        manager.createRoom('p0');
        expect(manager.sweepAbandonedRooms(Number.MAX_SAFE_INTEGER, 0)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/RoomManager.lifecycle.spec.ts`
Expected: FAIL — `setPresence` / `sweepAbandonedRooms` do not exist.

- [ ] **Step 3: Implement**

In `src/application/ports/RoomPort.ts`, add to the interface:

```typescript
    setPresence(roomId: string, playerIndex: number, connected: boolean, now: number): Room | undefined;
```

Replace `src/infrastructure/adapters/managers/room.manager.ts` content with:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import { createRoom, addPlayerToRoom, removePlayerFromRoom, startRoom, setPresenceInRoom } from '@domain/services/Room.service';

const SWEEP_INTERVAL_MS = 60_000;
const ABANDONED_ROOM_TTL_MS = 10 * 60_000;

@Injectable()
export class RoomManager implements RoomPort, OnModuleInit, OnModuleDestroy {
    private readonly rooms = new Map<string, Room>();
    private readonly playerToRoom = new Map<string, string>();
    private sweepInterval?: NodeJS.Timeout;

    onModuleInit(): void {
        this.sweepInterval = setInterval(
            () => this.sweepAbandonedRooms(Date.now(), ABANDONED_ROOM_TTL_MS),
            SWEEP_INTERVAL_MS,
        );
    }

    onModuleDestroy(): void {
        if (this.sweepInterval) clearInterval(this.sweepInterval);
    }

    createRoom(ownerId: string): Room {
        const room = createRoom(ownerId);
        this.rooms.set(room.roomId, room);
        this.playerToRoom.set(ownerId, room.roomId);
        return room;
    }

    joinRoom(playerId: string, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const updated = addPlayerToRoom(room, playerId);
        this.rooms.set(roomId, updated);
        this.playerToRoom.set(playerId, roomId);
        return updated;
    }

    quitRoom(playerId: string): Room | null {
        const roomId = this.playerToRoom.get(playerId);
        if (!roomId) return null;
        const room = this.rooms.get(roomId);
        if (!room) return null;
        const updated = removePlayerFromRoom(room, playerId);
        this.playerToRoom.delete(playerId);
        if (updated === null) {
            this.rooms.delete(roomId);
        } else {
            this.rooms.set(roomId, updated);
        }
        return updated;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    startGame(roomId: string, gameState: GameState): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const started = { ...startRoom(room, gameState), phaseStartedAt: Date.now() };
        this.rooms.set(roomId, started);
        return started;
    }

    updateGameState(roomId: string, gameState: GameState): void {
        const room = this.rooms.get(roomId);
        if (!room) return;
        // A new confirmation sub-round starts on phase change OR on a KEEP reroll (rollsLeft change).
        const newSubRound = room.gameState?.phase !== gameState.phase
            || room.gameState?.rollsLeft !== gameState.rollsLeft;
        this.rooms.set(roomId, {
            ...room,
            gameState,
            phaseStartedAt: newSubRound ? Date.now() : room.phaseStartedAt,
        });
    }

    setPresence(roomId: string, playerIndex: number, connected: boolean, now: number): Room | undefined {
        const room = this.rooms.get(roomId);
        if (!room) return undefined;
        const updated = setPresenceInRoom(room, playerIndex, connected, now);
        this.rooms.set(roomId, updated);
        return updated;
    }

    sweepAbandonedRooms(now: number, thresholdMs: number): string[] {
        const deleted: string[] = [];
        for (const [roomId, room] of this.rooms) {
            if (!room.presence) continue;
            const allGone = room.presence.every(
                p => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= thresholdMs,
            );
            if (allGone) {
                this.rooms.delete(roomId);
                for (const [playerId, mappedRoomId] of this.playerToRoom) {
                    if (mappedRoomId === roomId) this.playerToRoom.delete(playerId);
                }
                deleted.push(roomId);
            }
        }
        return deleted;
    }

    listOpenRooms(): Room[] {
        return [...this.rooms.values()].filter(room => !room.isStarted);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/RoomManager.lifecycle.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/ports/RoomPort.ts src/infrastructure/adapters/managers/room.manager.ts tests/RoomManager.lifecycle.spec.ts
git commit -m "feat: stamp phaseStartedAt, track presence and sweep abandoned rooms in RoomManager"
```

---

### Task 5: Eviction plumbing — SessionManager result, WebSocket disconnect

**Files:**
- Modify: `src/application/ports/SessionPort.ts`
- Modify: `src/application/ports/WebSocketPort.ts`
- Modify: `src/infrastructure/adapters/managers/session.manager.ts`
- Modify: `src/infrastructure/adapters/websocket/services/WebSocketService.ts`
- Create: `tests/SessionManager.eviction.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/SessionManager.eviction.spec.ts`:

```typescript
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { UserId } from '@shared/branded.types';

const USER = 'user-1' as UserId;

describe('createOrReconnectSession eviction reporting', () => {
    it('reports no eviction for a brand-new session', () => {
        const manager = new SessionManager();
        const { session, evictedSocketId } = manager.createOrReconnectSession('sock-a', USER);
        expect(session.socketId).toBe('sock-a');
        expect(evictedSocketId).toBeNull();
    });

    it('reports the old socket when it is still live (duplicate login)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession('sock-a', USER);
        const { evictedSocketId } = manager.createOrReconnectSession('sock-b', USER);
        expect(evictedSocketId).toBe('sock-a');
    });

    it('reports no eviction when the old socket already disconnected (normal reconnect)', () => {
        const manager = new SessionManager();
        manager.createOrReconnectSession('sock-a', USER);
        manager.disconnectSession('sock-a');
        const { session, evictedSocketId } = manager.createOrReconnectSession('sock-b', USER);
        expect(evictedSocketId).toBeNull();
        expect(session.socketId).toBe('sock-b');
    });

    it('preserves sessionId and roomId across reconnects', () => {
        const manager = new SessionManager();
        const first = manager.createOrReconnectSession('sock-a', USER).session;
        manager.setSessionRoom('sock-a', 'room-1');
        manager.disconnectSession('sock-a');
        const second = manager.createOrReconnectSession('sock-b', USER).session;
        expect(second.sessionId).toBe(first.sessionId);
        expect(second.roomId).toBe('room-1');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/SessionManager.eviction.spec.ts`
Expected: FAIL — destructuring `session` from a plain `Session` returns undefined.

- [ ] **Step 3: Implement**

In `src/application/ports/SessionPort.ts`, replace the file content with:

```typescript
import { UserId } from '@shared/branded.types';
import { Session } from '@application/dtos/Session.dto';

export type ConnectResult = {
    session: Session;
    /** Socket to kick because this user signed in elsewhere; null when none is live. */
    evictedSocketId: string | null;
};

export interface SessionPort {
    createOrReconnectSession(socketId: string, userId: UserId): ConnectResult;
    getSession(socketId: string): Session | undefined;
    setSessionRoom(socketId: string, roomId: string | undefined): void;
    disconnectSession(socketId: string): void;
    deleteSession(socketId: string): void;
}
```

In `src/application/ports/WebSocketPort.ts`, add to the interface:

```typescript
    disconnectSocket(socketId: string): void;
```

In `src/infrastructure/adapters/managers/session.manager.ts`, update the import and replace `createOrReconnectSession`:

```typescript
import { SessionPort, ConnectResult } from '@application/ports/SessionPort';
```

```typescript
    createOrReconnectSession(socketId: string, userId: UserId): ConnectResult {
        const existing = this.byUserId.get(userId);
        if (existing) {
            const evictedSocketId = this.bySockId.has(existing.socketId) ? existing.socketId : null;
            this.bySockId.delete(existing.socketId);
            const reconnected: Session = { ...existing, socketId };
            this.bySockId.set(socketId, reconnected);
            this.byUserId.set(userId, reconnected);
            return { session: reconnected, evictedSocketId };
        }
        const session: Session = {
            sessionId: crypto.randomUUID(),
            socketId,
            userId,
        };
        this.bySockId.set(socketId, session);
        this.byUserId.set(userId, session);
        return { session, evictedSocketId: null };
    }
```

In `src/infrastructure/adapters/websocket/services/WebSocketService.ts`, add:

```typescript
    disconnectSocket(socketId: string): void {
        this.shared.getServer().in(socketId).disconnectSockets(true);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/SessionManager.eviction.spec.ts`
Expected: PASS.

- [ ] **Step 5: Do NOT commit yet**

The signature change makes `SessionCoordinator.service.ts` (and its spec) red until Task 6 updates it. Task 6's commit covers both tasks so every commit in history is green. Verify the expected breakage:

Run: `npx jest tests/SessionCoordinator.service.spec.ts`
Expected: FAIL — the coordinator's call site no longer matches `ConnectResult`. This is the Task 6 starting point.

---

### Task 6: SessionCoordinator — presence-aware connect/disconnect

**Files:**
- Modify: `src/application/ports/tokens.ts`
- Modify: `src/application/services/SessionCoordinator.service.ts`
- Modify: `tests/SessionCoordinator.service.spec.ts`

- [ ] **Step 1: Update existing spec mocks and add failing tests**

In `tests/SessionCoordinator.service.spec.ts`:

1. Add to imports:

```typescript
import { CLAIM_CONFIG } from '@application/ports/tokens';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
```

2. Extend the mocks and fixtures (replace the existing `mockRoom`/`mockWs` definitions and add fixtures):

```typescript
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setPresence: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

const GS: GameState = { phase: GamePhase.KEEP, currentRound: 1, rollsLeft: 2, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
const STARTED_ROOM: Room = {
    roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true, gameState: GS,
    playerOrder: ['p0', 'p1'],
    presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
    phaseStartedAt: 0,
};
```

3. Register the config provider in the testing module's `providers` array:

```typescript
            { provide: CLAIM_CONFIG, useValue: { graceMs: 60_000, afkLimitMs: 120_000 } },
```

4. Update every `mockSession.createOrReconnectSession.mockReturnValue(X)` to `mockSession.createOrReconnectSession.mockReturnValue({ session: X, evictedSocketId: null })`.

5. Append these new describes:

```typescript
describe('handleConnect — eviction', () => {
    it('kicks the evicted socket with sessionEvicted', () => {
        mockSession.createOrReconnectSession.mockReturnValue({ session: SESSION, evictedSocketId: 'old-sock' });
        coordinator.handleConnect(SOCKET, USER_ID);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith('old-sock', 'sessionEvicted', { reason: 'signed-in-elsewhere' });
        expect(mockWs.disconnectSocket).toHaveBeenCalledWith('old-sock');
    });
});

describe('handleConnect — started game reconnect', () => {
    it('marks presence connected, notifies the room, and sends a viewer snapshot with afkClaimInMs', () => {
        mockSession.createOrReconnectSession.mockReturnValue({ session: SESSION_WITH_ROOM, evictedSocketId: null });
        mockRoom.getRoom.mockReturnValue(STARTED_ROOM);
        mockRoom.setPresence.mockReturnValue(STARTED_ROOM);
        coordinator.handleConnect(SOCKET, USER_ID);
        expect(mockRoom.setPresence).toHaveBeenCalledWith('room-1', 0, true, expect.any(Number));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'presenceChanged', { playerIndex: 0, connected: true, claimInMs: null });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'gameStateUpdated',
            expect.objectContaining({ afkClaimInMs: expect.any(Number) }));
    });
});

describe('handleDisconnect — started game', () => {
    it('marks presence disconnected and emits presenceChanged instead of quitting', () => {
        mockSession.getSession.mockReturnValue(SESSION_WITH_ROOM);
        mockRoom.getRoom.mockReturnValue(STARTED_ROOM);
        coordinator.handleDisconnect(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
        expect(mockRoom.setPresence).toHaveBeenCalledWith('room-1', 0, false, expect.any(Number));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'presenceChanged', { playerIndex: 0, connected: false, claimInMs: 60_000 });
        expect(mockSession.disconnectSession).toHaveBeenCalledWith(SOCKET);
    });
});
```

6. The two existing lobby-disconnect tests (`quits the room...` / `does not emit roomUpdated...`) must additionally stub `mockRoom.getRoom.mockReturnValue(ROOM)` (a non-started room) so they take the lobby branch; also add to the first of them:

```typescript
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, undefined);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/SessionCoordinator.service.spec.ts`
Expected: FAIL — `CLAIM_CONFIG` doesn't exist yet, then coordinator logic missing.

- [ ] **Step 3: Implement**

In `src/application/ports/tokens.ts`, append:

```typescript
export const CLAIM_CONFIG = Symbol('ClaimConfig');
```

Replace `src/application/services/SessionCoordinator.service.ts` content with:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CLAIM_CONFIG } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { UserId } from '@shared/branded.types';
import { PlayerIndex } from '@domain/types/Position.type';
import { ClaimConfig } from '@domain/types/Claim.type';
import { resolvePlayerIndex } from '@domain/services/Room.service';
import { computeAfkClaimInMs } from '@domain/services/Claim.service';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        @Inject(CLAIM_CONFIG) private readonly claimConfig: ClaimConfig,
    ) {}

    handleConnect(socketId: string, userId: UserId): void {
        const { session, evictedSocketId } = this.sessionPort.createOrReconnectSession(socketId, userId);
        if (evictedSocketId) {
            this.wsPort.emitToSocket(evictedSocketId, 'sessionEvicted', { reason: 'signed-in-elsewhere' });
            this.wsPort.disconnectSocket(evictedSocketId);
        }
        if (!session.roomId) return;
        this.wsPort.joinRoom(socketId, session.roomId);
        let room = this.roomPort.getRoom(session.roomId);
        if (!room) return;

        const playerIndex = resolvePlayerIndex(room, session.sessionId);
        if (room.isStarted && playerIndex !== -1) {
            room = this.roomPort.setPresence(room.roomId, playerIndex, true, Date.now()) ?? room;
            this.wsPort.emitToRoom(room.roomId, 'presenceChanged', { playerIndex, connected: true, claimInMs: null });
        }

        this.wsPort.emitToSocket(socketId, 'roomUpdated', RoomMapper.toDTO(room));
        if (room.gameState) {
            const dto = playerIndex !== -1
                ? GameStateMapper.toDTOForViewer(room.gameState, playerIndex as PlayerIndex)
                : GameStateMapper.toDTO(room.gameState);
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', {
                ...dto,
                afkClaimInMs: computeAfkClaimInMs(room.gameState, room.phaseStartedAt, Date.now(), this.claimConfig.afkLimitMs),
            });
        }
    }

    handleDisconnect(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        if (session.roomId) {
            const room = this.roomPort.getRoom(session.roomId);
            if (room?.isStarted) {
                const playerIndex = resolvePlayerIndex(room, session.sessionId);
                if (playerIndex !== -1) {
                    this.roomPort.setPresence(room.roomId, playerIndex, false, Date.now());
                    this.wsPort.emitToRoom(room.roomId, 'presenceChanged', {
                        playerIndex,
                        connected: false,
                        claimInMs: this.claimConfig.graceMs,
                    });
                }
                this.wsPort.leaveRoom(socketId, session.roomId);
            } else {
                const updatedRoom = this.roomPort.quitRoom(session.sessionId);
                this.sessionPort.setSessionRoom(socketId, undefined);
                this.wsPort.leaveRoom(socketId, session.roomId);
                if (updatedRoom) {
                    this.wsPort.emitToRoom(session.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
                }
            }
        }
        this.sessionPort.disconnectSession(socketId);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/SessionCoordinator.service.spec.ts tests/SessionManager.eviction.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/ports/SessionPort.ts src/application/ports/WebSocketPort.ts src/application/ports/tokens.ts src/infrastructure/adapters/managers/session.manager.ts src/infrastructure/adapters/websocket/services/WebSocketService.ts src/application/services/SessionCoordinator.service.ts tests/SessionManager.eviction.spec.ts tests/SessionCoordinator.service.spec.ts
git commit -m "feat: presence-aware connect/disconnect with eviction kick and viewer snapshot"
```

(This commit includes Task 5's files — the two tasks share one green commit.)

---

### Task 7: GameCoordinator — stable index, claimVictory, gameOver reasons, afkClaimInMs

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Create: `tests/GameCoordinator.claim.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/GameCoordinator.claim.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, EFFECT_FACTORY, CLAIM_CONFIG } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { buildEffectFactory } from '@domain/services/GameInit.service';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';

const NOW = 1_000_000;
const SOCKET = 'sock-0';

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setPresence: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    return { phase, currentRound: 1, rollsLeft: 2, playersReady, priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

function room(overrides: Partial<Room>): Room {
    return {
        roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true,
        playerOrder: ['p0', 'p1'],
        presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
        phaseStartedAt: NOW - 1000,
        gameState: gs(GamePhase.KEEP, [false, false]),
        ...overrides,
    };
}

let coordinator: GameCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: EFFECT_FACTORY, useValue: buildEffectFactory() },
            { provide: CLAIM_CONFIG, useValue: { graceMs: 60_000, afkLimitMs: 120_000 } },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    mockSession.getSession.mockReturnValue({ sessionId: 'p0', socketId: SOCKET, userId: 'u', roomId: 'room-1' });
});

afterEach(() => jest.restoreAllMocks());

describe('claimVictory', () => {
    it('grants a forfeit win when the opponent is past the grace period', () => {
        const r = room({ presence: [{ connected: true, disconnectedAt: null }, { connected: false, disconnectedAt: NOW - 60_000 }] });
        mockRoom.getRoom.mockReturnValue(r);
        coordinator.claimVictory(SOCKET);
        expect(mockRoom.updateGameState).toHaveBeenCalledWith('room-1', expect.objectContaining({ phase: GamePhase.RESULT }));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0, reason: 'forfeit' });
    });

    it('grants an AFK win when claimant is ready, opponent idle past the limit', () => {
        const r = room({ gameState: gs(GamePhase.ASSIGN, [true, false]), phaseStartedAt: NOW - 120_000 });
        mockRoom.getRoom.mockReturnValue(r);
        coordinator.claimVictory(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0, reason: 'afk' });
    });

    it('rejects an invalid claim with an error and does not end the game', () => {
        mockRoom.getRoom.mockReturnValue(room({}));
        coordinator.claimVictory(SOCKET);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('stable player identity', () => {
    it('resolves playerIndex from playerOrder even when playersId shrank', () => {
        const r = room({
            playersId: ['p0'],
            gameState: gs(GamePhase.ASSIGN, [true, false]),
            phaseStartedAt: NOW - 120_000,
        });
        mockRoom.getRoom.mockReturnValue(r);
        mockSession.getSession.mockReturnValue({ sessionId: 'p0', socketId: SOCKET, userId: 'u', roomId: 'room-1' });
        coordinator.claimVictory(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0, reason: 'afk' });
    });
});

describe('afkClaimInMs in emitted game state', () => {
    it('startGame emits a payload containing afkClaimInMs', () => {
        const lobby = room({ isStarted: false, playerOrder: undefined, presence: undefined, gameState: undefined });
        mockRoom.getRoom.mockReturnValue(lobby);
        mockRoom.startGame.mockImplementation((_id: string, state: GameState) => {
            const started = room({ gameState: state, phaseStartedAt: NOW });
            mockRoom.getRoom.mockReturnValue(started);
            return started;
        });
        coordinator.startGame(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated',
            expect.objectContaining({ afkClaimInMs: 120_000 }));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/GameCoordinator.claim.spec.ts`
Expected: FAIL — `claimVictory` is not a function; startGame payload lacks `afkClaimInMs`.

- [ ] **Step 3: Implement**

In `src/application/services/GameCoordinator.service.ts`:

1. Extend imports:

```typescript
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, EFFECT_FACTORY, CLAIM_CONFIG } from '@application/ports/tokens';
import { GameStateDTO, GameStateUpdatePayload } from '@application/dtos/GameState.dto';
import { ClaimConfig } from '@domain/types/Claim.type';
import { isRoomReady, resolvePlayerIndex } from '@domain/services/Room.service';
import { evaluateClaim, computeAfkClaimInMs } from '@domain/services/Claim.service';
import { assertPhase, assertNotReady, beginRollPhase, beginResultPhase } from '@domain/services/Phase.service';
```

2. Add the config to the constructor:

```typescript
        @Inject(CLAIM_CONFIG) private readonly claimConfig: ClaimConfig,
```

3. In `getContext`, replace `const idx = room.playersId.indexOf(session.sessionId);` with:

```typescript
        const idx = resolvePlayerIndex(room, session.sessionId);
```

4. Add a private payload helper (after `emitError`):

```typescript
    private withTimers(roomId: string, dto: GameStateDTO, gs: GameState): GameStateUpdatePayload {
        const room = this.roomPort.getRoom(roomId);
        return {
            ...dto,
            afkClaimInMs: computeAfkClaimInMs(gs, room?.phaseStartedAt, Date.now(), this.claimConfig.afkLimitMs),
        };
    }
```

5. Wrap every `gameStateUpdated` emit (the emit must happen **after** `updateGameState`/`startGame` so the fresh `phaseStartedAt` is read):
   - `doConfirm`: `this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(confirmed), confirmed));`
   - `startGame`: `this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(gameState), gameState));`
   - `confirmPlacement` both-ready branch: `this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(gs), gs));`
   - `confirmPlacement` solo branch: `this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));`
   - `confirmAssignment` next-round emit: `this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(gs), gs));`
   - `cancelPlacement`: `this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));`
   (The `roundResolved` payload is unchanged.)

6. In `confirmAssignment`, give the elimination win its reason:

```typescript
                this.wsPort.emitToRoom(room.roomId, 'gameOver', { winner, reason: 'elimination' });
```

7. Add the `claimVictory` method:

```typescript
    claimVictory(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        const opponentIndex = (1 - playerIndex) as PlayerIndex;
        const opponentPresence = room.presence?.[opponentIndex];
        if (!opponentPresence) { this.emitError(socketId, 'Action not available'); return; }

        const verdict = evaluateClaim(
            room.gameState, playerIndex, opponentPresence, room.phaseStartedAt, Date.now(), this.claimConfig,
        );
        if (!verdict.valid) { this.emitError(socketId, verdict.error); return; }

        this.roomPort.updateGameState(room.roomId, beginResultPhase(room.gameState));
        this.wsPort.emitToRoom(room.roomId, 'gameOver', { winner: playerIndex, reason: verdict.reason });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/GameCoordinator.claim.spec.ts tests/GameCoordinator.service.spec.ts`
Expected: PASS. If existing GameCoordinator tests assert exact `gameStateUpdated` payloads, they now also contain `afkClaimInMs` — update those assertions to `expect.objectContaining(...)` on the original fields, and add `setPresence: jest.fn()`, `disconnectSocket: jest.fn()` to its mocks if missing.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.claim.spec.ts tests/GameCoordinator.service.spec.ts
git commit -m "feat: claim-victory flow, stable player identity and AFK countdown in game payloads"
```

---

### Task 8: RoomCoordinator — concession on leaving a started game

**Files:**
- Modify: `src/application/services/RoomCoordinator.service.ts`
- Create: `tests/RoomCoordinator.concede.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/RoomCoordinator.concede.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';

const SOCKET = 'sock-0';

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), setPresence: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

function gs(phase: GamePhase): GameState {
    return { phase, currentRound: 1, rollsLeft: 2, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

const STARTED: Room = {
    roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true,
    playerOrder: ['p0', 'p1'],
    presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
    phaseStartedAt: 0, gameState: gs(GamePhase.KEEP),
};

let coordinator: RoomCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            RoomCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
        ],
    }).compile();
    coordinator = module.get(RoomCoordinatorService);
    mockSession.getSession.mockReturnValue({ sessionId: 'p0', socketId: SOCKET, userId: 'u', roomId: 'room-1' });
});

describe('quitRoom on a started game', () => {
    it('emits gameOver concede for the opponent and marks the quitter disconnected', () => {
        mockRoom.getRoom.mockReturnValue(STARTED);
        mockRoom.quitRoom.mockReturnValue(STARTED);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 1, reason: 'concede' });
        expect(mockRoom.updateGameState).toHaveBeenCalledWith('room-1', expect.objectContaining({ phase: GamePhase.RESULT }));
        expect(mockRoom.setPresence).toHaveBeenCalledWith('room-1', 0, false, expect.any(Number));
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
    });

    it('does not emit gameOver when the game is already in RESULT', () => {
        mockRoom.getRoom.mockReturnValue({ ...STARTED, gameState: gs(GamePhase.RESULT) });
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'gameOver', expect.anything());
    });

    it('does not emit gameOver for lobby rooms', () => {
        mockRoom.getRoom.mockReturnValue({ roomId: 'room-1', ownerId: 'p0', playersId: ['p0'], isStarted: false });
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'gameOver', expect.anything());
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/RoomCoordinator.concede.spec.ts`
Expected: FAIL — no `gameOver` emitted, `updateGameState`/`setPresence` not called.

- [ ] **Step 3: Implement**

In `src/application/services/RoomCoordinator.service.ts`, add imports:

```typescript
import GamePhase from '@domain/types/GamePhase.type';
import { beginResultPhase } from '@domain/services/Phase.service';
import { resolvePlayerIndex } from '@domain/services/Room.service';
```

Replace `leaveCurrentRoom` with:

```typescript
    private leaveCurrentRoom(socketId: string, sessionId: string, roomId: string): void {
        const room = this.roomPort.getRoom(roomId);
        if (room?.isStarted && room.gameState && room.gameState.phase !== GamePhase.RESULT) {
            const quitterIndex = resolvePlayerIndex(room, sessionId);
            if (quitterIndex !== -1) {
                const winner = (1 - quitterIndex) as 0 | 1;
                this.roomPort.updateGameState(roomId, beginResultPhase(room.gameState));
                // Mark the quitter gone so the janitor's "all players disconnected" rule can fire.
                this.roomPort.setPresence(roomId, quitterIndex, false, Date.now());
                this.wsPort.emitToRoom(roomId, 'gameOver', { winner, reason: 'concede' });
            }
        }
        const updatedRoom = this.roomPort.quitRoom(sessionId);
        this.sessionPort.setSessionRoom(socketId, undefined);
        this.wsPort.leaveRoom(socketId, roomId);
        if (updatedRoom) {
            this.wsPort.emitToRoom(updatedRoom.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/RoomCoordinator.concede.spec.ts tests/RoomCoordinator.service.spec.ts`
Expected: PASS. If the existing RoomCoordinator spec's mock lacks `getRoom` or `setPresence`, add them as `jest.fn()` (returning `undefined` keeps the old tests on the lobby path).

- [ ] **Step 5: Commit**

```bash
git add src/application/services/RoomCoordinator.service.ts tests/RoomCoordinator.concede.spec.ts tests/RoomCoordinator.service.spec.ts
git commit -m "feat: leaving a started game concedes it to the opponent"
```

---

### Task 9: Wiring — gateway event, claim config from env, .env.example

**Files:**
- Create: `src/infrastructure/config/claim.config.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`
- Modify: `src/app.module.ts`
- Modify: `.env.example`
- Create: `tests/ClaimConfig.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ClaimConfig.spec.ts`:

```typescript
import { claimConfigFromEnv } from '@infrastructure/config/claim.config';

describe('claimConfigFromEnv', () => {
    it('uses defaults when unset', () => {
        expect(claimConfigFromEnv({})).toEqual({ graceMs: 60_000, afkLimitMs: 120_000 });
    });

    it('parses overrides', () => {
        expect(claimConfigFromEnv({ CLAIM_GRACE_MS: '30000', CLAIM_AFK_LIMIT_MS: '90000' }))
            .toEqual({ graceMs: 30_000, afkLimitMs: 90_000 });
    });

    it('fails fast on garbage values', () => {
        expect(() => claimConfigFromEnv({ CLAIM_GRACE_MS: 'soon' })).toThrow(/CLAIM_GRACE_MS/);
        expect(() => claimConfigFromEnv({ CLAIM_AFK_LIMIT_MS: '-5' })).toThrow(/CLAIM_AFK_LIMIT_MS/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ClaimConfig.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/infrastructure/config/claim.config.ts`:

```typescript
import { ClaimConfig } from '@domain/types/Claim.type';

type EnvLike = { CLAIM_GRACE_MS?: string; CLAIM_AFK_LIMIT_MS?: string };

export function claimConfigFromEnv(env: EnvLike): ClaimConfig {
    return {
        graceMs: parseDuration(env.CLAIM_GRACE_MS, 60_000, 'CLAIM_GRACE_MS'),
        afkLimitMs: parseDuration(env.CLAIM_AFK_LIMIT_MS, 120_000, 'CLAIM_AFK_LIMIT_MS'),
    };
}

function parseDuration(raw: string | undefined, fallback: number, name: string): number {
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer of milliseconds, got: ${raw}`);
    }
    return value;
}
```

In `src/infrastructure/adapters/websocket/session.gateway.ts`, add after `handleConfirmAssignment`:

```typescript
    @SubscribeMessage('claimVictory')
    handleClaimVictory(@ConnectedSocket() client: Socket): void {
        this.gameCoordinator.claimVictory(client.id);
    }
```

In `src/app.module.ts`:

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ROOM_PORT, SESSION_PORT, WEBSOCKET_PORT, EFFECT_FACTORY, CLAIM_CONFIG } from '@application/ports/tokens';
import { claimConfigFromEnv } from '@infrastructure/config/claim.config';
```

and add to `providers` (injecting ConfigService guarantees `.env` is loaded before the factory runs):

```typescript
        {
            provide: CLAIM_CONFIG,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => claimConfigFromEnv({
                CLAIM_GRACE_MS: config.get<string>('CLAIM_GRACE_MS'),
                CLAIM_AFK_LIMIT_MS: config.get<string>('CLAIM_AFK_LIMIT_MS'),
            }),
        },
```

In `.env.example`, append:

```bash
# Claim-victory windows (milliseconds)
CLAIM_GRACE_MS=60000       # disconnect grace before the opponent may claim a forfeit win
CLAIM_AFK_LIMIT_MS=120000  # per-phase inactivity before the opponent may claim an AFK win
```

- [ ] **Step 4: Run test and boot check**

Run: `npx jest tests/ClaimConfig.spec.ts`
Expected: PASS.

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/config/claim.config.ts src/infrastructure/adapters/websocket/session.gateway.ts src/app.module.ts .env.example tests/ClaimConfig.spec.ts
git commit -m "feat: wire claimVictory gateway event and env-validated claim config"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm run test`
Expected: all green. Likely stragglers to fix (mechanical, same pattern as Tasks 6–8): any spec that mocks `RoomPort`/`WebSocketPort`/`SessionPort` needs the new `setPresence` / `disconnectSocket` jest.fn()s and the `{ session, evictedSocketId }` return shape; any spec asserting exact `gameStateUpdated` payloads needs `afkClaimInMs` accounted for.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit any test repairs**

```bash
git add -A tests
git commit -m "test: align existing specs with lifecycle port changes"
```

(Skip if nothing needed repair.)

- [ ] **Step 4: Manual smoke (optional but recommended before frontend work)**

Start `npm run start:dev` + the test client; verify: disconnect mid-game on one client → other client receives `presenceChanged`; reconnect → game resumes with masked snapshot; stay disconnected 60s → `claimVictory` from the other client ends the game with `reason: 'forfeit'`.
