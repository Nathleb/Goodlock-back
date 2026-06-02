# Batched Phase Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the granular `toggleDieLock` / `selectTarget` per-tap events with single batched payloads sent at confirm time: `confirmKeep({ lockedCharacterIds })` and `confirmAssignment({ targets })`.

**Architecture:** Bottom-up TDD. `toggleDieLock` + its domain function removed together first (they are tightly coupled; removing one without the other breaks TypeScript compilation). Then `selectTarget` removed. Then a pure refactor of `confirmAction` → `doConfirm`. Then the two new batched implementations with tests written before code.

**Tech Stack:** NestJS, Socket.io, Jest, class-validator

**Spec:** `docs/superpowers/specs/2026-06-02-batched-phase-actions-design.md`

---

## File Map

| Action | File |
|---|---|
| Modify | `src/domain/services/Player.service.ts` |
| Modify | `tests/Player.service.spec.ts` |
| Modify | `tests/Roll.service.spec.ts` |
| Modify | `tests/Round.service.spec.ts` |
| Modify | `tests/GameLoop.service.spec.ts` |
| Modify | `src/application/services/GameCoordinator.service.ts` |
| Modify | `tests/GameCoordinator.service.spec.ts` |
| Modify | `src/infrastructure/adapters/websocket/session.gateway.ts` |
| Create | `src/infrastructure/adapters/websocket/payloads/ConfirmKeep.payload.ts` |
| Create | `src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts` |
| Delete | `src/infrastructure/adapters/websocket/payloads/ToggleDieLock.payload.ts` |
| Delete | `src/infrastructure/adapters/websocket/payloads/SelectTarget.payload.ts` |

---

## Task 1: Remove `toggleDieLock` end-to-end (domain + coordinator + gateway + tests)

`toggleDieLockForCharacter` (domain) and `toggleDieLock` (coordinator/gateway) are removed together. Removing the domain function without simultaneously removing its only caller in `GameCoordinator.service.ts` would break TypeScript compilation between tasks.

**Files:**
- Modify: `src/domain/services/Player.service.ts`
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`
- Delete: `src/infrastructure/adapters/websocket/payloads/ToggleDieLock.payload.ts`
- Modify: `tests/Player.service.spec.ts`
- Modify: `tests/Roll.service.spec.ts`
- Modify: `tests/Round.service.spec.ts`
- Modify: `tests/GameLoop.service.spec.ts`

- [ ] **Step 1: Remove `toggleDieLockForCharacter` from `Player.service.ts`**

Delete lines 7–12 (the entire `toggleDieLockForCharacter` export):
```typescript
// Remove this block entirely:
export function toggleDieLockForCharacter(player: Player, position: Position): Player {
    const newTeam = player.team.map(char =>
        char.position.slot === position.slot ? toggleIsFaceLocked(char) : char
    );
    return { ...player, team: newTeam };
}
```

`toggleIsFaceLocked` is only used by this function. Remove it from the import on line 2:
```typescript
// Before:
import { isDead, rollForTurn, setTarget, toggleIsFaceLocked, rollDie } from "./Character.service";

// After:
import { isDead, rollForTurn, setTarget, rollDie } from "./Character.service";
```

- [ ] **Step 2: Remove `toggleDieLock` from `GameCoordinator.service.ts`**

Remove `toggleDieLockForCharacter` from the import on line 19:
```typescript
// Before:
import { createPlayer, rearrangeTeam, toggleDieLockForCharacter, selectTargetOfCharacter } from '@domain/services/Player.service';

// After:
import { createPlayer, rearrangeTeam, selectTargetOfCharacter } from '@domain/services/Player.service';
```

> `selectTargetOfCharacter` stays — it will be used in the new `confirmAssignment` in Task 5.

Delete the entire `toggleDieLock` method (lines 168–188):
```typescript
// Remove:
toggleDieLock(socketId: string, characterId: string): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        assertPhase(room.gameState, GamePhase.KEEP);
        assertNotReady(room.gameState, playerIndex);
        const player = room.gameState.players[playerIndex];
        const char = player.team.find(c => c.id === characterId);
        if (!char) throw new Error('Character not found');

        const updatedPlayer = toggleDieLockForCharacter(player, char.position);
        const players = [...room.gameState.players] as [Player, Player];
        players[playerIndex] = updatedPlayer;
        const updatedGs = { ...room.gameState, players };
        this.roomPort.updateGameState(room.roomId, updatedGs);
        this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(updatedGs));
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

- [ ] **Step 3: Remove `toggleDieLock` from `tests/GameCoordinator.service.spec.ts`**

Delete the entire `describe('toggleDieLock', ...)` block (all tests inside it).

In `describe('post-confirm mutation guards', ...)`, delete this test:
```typescript
// Remove:
it('emits error when toggleDieLock called after confirmKeep', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
    coordinator.toggleDieLock(SOCKET_0, 'any-char-id');
    expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
    expect(mockRoom.updateGameState).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Remove `toggleDieLock` handler from `session.gateway.ts` and delete payload file**

Remove the `ToggleDieLockPayload` import (line 19):
```typescript
// Remove:
import { ToggleDieLockPayload } from './payloads/ToggleDieLock.payload';
```

Delete the `handleToggleDieLock` handler:
```typescript
// Remove:
@SubscribeMessage('toggleDieLock')
handleToggleDieLock(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ToggleDieLockPayload,
): void {
    this.gameCoordinator.toggleDieLock(client.id, data.characterId);
}
```

Delete the payload file:
```bash
rm src/infrastructure/adapters/websocket/payloads/ToggleDieLock.payload.ts
```

- [ ] **Step 5: Update domain test helpers — replace toggle calls with direct state construction**

**`tests/Player.service.spec.ts`** — remove `toggleDieLockForCharacter` from import and delete its test:
```typescript
// Import — before:
import { hasLost, rollDiceForTurn, toggleDieLockForCharacter, selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
// After:
import { hasLost, rollDiceForTurn, selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
```
```typescript
// Delete this test:
it('should toggle die lock for character', () => {
  const updatedPlayer = toggleDieLockForCharacter(player, { playerIndex: 0, slot: 0 });
  expect(updatedPlayer.team[0].isFaceLocked).toBe(true);
});
```

**`tests/Roll.service.spec.ts`** — remove import, replace call (line 42):
```typescript
// Import — before:
import { createPlayer, toggleDieLockForCharacter } from "@domain/services/Player.service";
// After:
import { createPlayer } from "@domain/services/Player.service";
```
```typescript
// Line 42 — before:
player = toggleDieLockForCharacter(player, { playerIndex: 0, slot: 0 });
// After:
player = { ...player, team: player.team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) };
```

**`tests/Round.service.spec.ts`** — remove import, replace calls (lines 90–91):
```typescript
// Import — before:
import { createPlayer, toggleDieLockForCharacter } from "@domain/services/Player.service";
// After:
import { createPlayer } from "@domain/services/Player.service";
```
```typescript
// Lines 90-91 — before:
player1 = toggleDieLockForCharacter(player1, { playerIndex: 0, slot: 0 });
player2 = toggleDieLockForCharacter(player2, { playerIndex: 1, slot: 2 });
// After:
player1 = { ...player1, team: player1.team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) };
player2 = { ...player2, team: player2.team.map((c, i) => i === 2 ? { ...c, isFaceLocked: true } : c) };
```

**`tests/GameLoop.service.spec.ts`** — remove import, replace call (line 126):
```typescript
// Import — before:
import { createPlayer, toggleDieLockForCharacter } from "@domain/services/Player.service";
// After:
import { createPlayer } from "@domain/services/Player.service";
```
```typescript
// Line 126 — before:
players: [
    toggleDieLockForCharacter(inKeep.players[0], { playerIndex: 0, slot: 0 }),
    inKeep.players[1],
] as [Player, Player],
// After:
players: [
    { ...inKeep.players[0], team: inKeep.players[0].team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) },
    inKeep.players[1],
] as [Player, Player],
```

- [ ] **Step 6: Run the test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/services/Player.service.ts src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts src/infrastructure/adapters/websocket/session.gateway.ts tests/Player.service.spec.ts tests/Roll.service.spec.ts tests/Round.service.spec.ts tests/GameLoop.service.spec.ts
git commit -m "refactor: remove toggleDieLock event and toggleDieLockForCharacter domain function"
```

---

## Task 2: Remove `selectTarget` end-to-end (coordinator + gateway + tests)

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`
- Delete: `src/infrastructure/adapters/websocket/payloads/SelectTarget.payload.ts`

- [ ] **Step 1: Remove `selectTarget` from `GameCoordinator.service.ts`**

Delete the entire `selectTarget` method (lines 194–220 in the original file; adjust for Task 1 changes):
```typescript
// Remove:
selectTarget(socketId: string, characterId: string, rawTarget: { playerIndex: number; slot: number }): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        assertPhase(room.gameState, GamePhase.ASSIGN);
        assertNotReady(room.gameState, playerIndex);
        const player = room.gameState.players[playerIndex];
        const char = player.team.find(c => c.id === characterId);
        if (!char) throw new Error('Character not found');
        if (rawTarget.playerIndex !== 0 && rawTarget.playerIndex !== 1) throw new Error('Invalid target playerIndex');
        if (rawTarget.slot < 0 || rawTarget.slot > 4) throw new Error('Invalid target slot');

        const target: Position = {
            playerIndex: rawTarget.playerIndex as PlayerIndex,
            slot: rawTarget.slot as SlotIndex,
        };
        const updatedPlayer = selectTargetOfCharacter(player, char.position.slot, target);
        const players = [...room.gameState.players] as [Player, Player];
        players[playerIndex] = updatedPlayer;
        const updatedGs = { ...room.gameState, players };
        this.roomPort.updateGameState(room.roomId, updatedGs);
        this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(updatedGs));
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

- [ ] **Step 2: Remove `selectTarget` from `tests/GameCoordinator.service.spec.ts`**

Delete the entire `describe('selectTarget', ...)` block.

In `describe('post-confirm mutation guards', ...)`, delete this test:
```typescript
// Remove:
it('emits error when selectTarget called after confirmAssignment', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
    coordinator.selectTarget(SOCKET_0, 'any-char-id', { playerIndex: 1, slot: 0 });
    expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
    expect(mockRoom.updateGameState).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Remove `selectTarget` handler from `session.gateway.ts` and delete payload file**

Remove the `SelectTargetPayload` import (line 20):
```typescript
// Remove:
import { SelectTargetPayload } from './payloads/SelectTarget.payload';
```

Delete the `handleSelectTarget` handler:
```typescript
// Remove:
@SubscribeMessage('selectTarget')
handleSelectTarget(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SelectTargetPayload,
): void {
    this.gameCoordinator.selectTarget(client.id, data.characterId, data.target);
}
```

Delete the payload file:
```bash
rm src/infrastructure/adapters/websocket/payloads/SelectTarget.payload.ts
```

- [ ] **Step 4: Run the test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts src/infrastructure/adapters/websocket/session.gateway.ts
git commit -m "refactor: remove selectTarget event; assignment targets will be sent as a batch on confirmAssignment"
```

---

## Task 3: Refactor `confirmAction` → `doConfirm(socketId, ctx, gs, domainFn)`

Pure behavior-preserving refactor. `doConfirm` receives `GameContext` and `GameState` as explicit parameters rather than deriving them internally. No test changes — all existing tests continue to pass.

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`

- [ ] **Step 1: Replace `confirmAction` with `doConfirm`**

Replace the entire `private confirmAction(...)` method:
```typescript
// Before:
private confirmAction(
    socketId: string,
    domainFn: (gs: GameState, pi: PlayerIndex) => GameState,
    autoFn?: (gs: GameState) => GameState,
): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        const otherIndex = (1 - playerIndex) as PlayerIndex;
        const wasOtherReady = room.gameState.playersReady[otherIndex];
        let gs = domainFn(room.gameState, playerIndex);
        if (wasOtherReady && autoFn) gs = autoFn(gs);
        this.roomPort.updateGameState(room.roomId, gs);
        if (wasOtherReady) {
            this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
        }
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

```typescript
// After:
private doConfirm(
    socketId: string,
    ctx: GameContext,
    gs: GameState,
    domainFn: (gs: GameState, pi: PlayerIndex) => GameState,
): void {
    const { room, playerIndex } = ctx;
    try {
        const otherIndex = (1 - playerIndex) as PlayerIndex;
        const wasOtherReady = gs.playersReady[otherIndex];
        const confirmed = domainFn(gs, playerIndex);
        this.roomPort.updateGameState(room.roomId, confirmed);
        if (wasOtherReady) {
            this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(confirmed));
        }
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

- [ ] **Step 2: Update `confirmKeep` to call `doConfirm`**

```typescript
// Before:
confirmKeep(socketId: string): void {
    this.confirmAction(socketId, confirmKeep);
}

// After:
confirmKeep(socketId: string): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    this.doConfirm(socketId, ctx, ctx.room.gameState, confirmKeep);
}
```

- [ ] **Step 3: Run the test suite**

```bash
npm run test
```

Expected: all tests pass. Behavior is identical — only the plumbing changed.

- [ ] **Step 4: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts
git commit -m "refactor: replace confirmAction with doConfirm accepting explicit GameContext and GameState"
```

---

## Task 4: Implement batched `confirmKeep` (TDD)

`confirmKeep` now accepts `lockedCharacterIds: string[]`. The server validates all IDs, applies SET semantics (`isFaceLocked = id is in the list` for every character), then delegates to `doConfirm`.

**Files:**
- Modify: `tests/GameCoordinator.service.spec.ts`
- Modify: `src/application/services/GameCoordinator.service.ts`
- Create: `src/infrastructure/adapters/websocket/payloads/ConfirmKeep.payload.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`

- [ ] **Step 1: Update `confirmKeep` tests in `tests/GameCoordinator.service.spec.ts`**

Replace the entire `describe('confirmKeep', ...)` block with:
```typescript
describe('confirmKeep', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(makeRoom(keepGs)));

    it('saves state silently when first to confirm', () => {
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('rerolls and emits gameStateUpdated still in KEEP when both confirm with rollsLeft > 0', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });

    it('advances to ASSIGN and emits gameStateUpdated when both confirm with rollsLeft = 0', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready({ ...keepGs, rollsLeft: 0 })));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.ASSIGN }));
    });

    it('emits error when lockedCharacterIds contains unknown id', () => {
        coordinator.confirmKeep(SOCKET_0, ['unknown-id']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('accepts empty array (no characters locked)', () => {
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('accepts all 5 characters locked', () => {
        const allIds = keepGs.players[0].team.map(c => c.id);
        coordinator.confirmKeep(SOCKET_0, allIds);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('sets isFaceLocked=true only for locked characters and false for the rest', () => {
        const firstId = keepGs.players[0].team[0].id;
        coordinator.confirmKeep(SOCKET_0, [firstId]);
        const savedGs = mockRoom.updateGameState.mock.calls[0][1];
        expect(savedGs.players[0].team[0].isFaceLocked).toBe(true);
        expect(savedGs.players[0].team[1].isFaceLocked).toBe(false);
        expect(savedGs.players[0].team[2].isFaceLocked).toBe(false);
    });
});
```

Update the double-confirm guard (find and update the `confirmKeep` call in post-confirm guards):
```typescript
it('emits error on second confirmKeep', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
    coordinator.confirmKeep(SOCKET_0, []);
    expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
    expect(mockRoom.updateGameState).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm run test -- --testPathPattern=GameCoordinator
```

Expected: `confirmKeep` tests fail — TypeScript rejects the new 2-argument calls against the current 1-argument signature. This is the red state.

- [ ] **Step 3: Implement batched `confirmKeep` in `GameCoordinator.service.ts`**

Replace the current `confirmKeep` method:
```typescript
confirmKeep(socketId: string, lockedCharacterIds: string[]): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    const player = room.gameState.players[playerIndex];
    const teamIds = new Set(player.team.map(c => c.id));
    for (const id of lockedCharacterIds) {
        if (!teamIds.has(id)) { this.emitError(socketId, `Unknown character id: ${id}`); return; }
    }
    const lockedSet = new Set(lockedCharacterIds);
    const updatedPlayer: Player = {
        ...player,
        team: player.team.map(c => ({ ...c, isFaceLocked: lockedSet.has(c.id) })),
    };
    const players = [...room.gameState.players] as [Player, Player];
    players[playerIndex] = updatedPlayer;
    const gsWithLocks: GameState = { ...room.gameState, players };
    this.doConfirm(socketId, ctx, gsWithLocks, confirmKeep);
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
npm run test -- --testPathPattern=GameCoordinator
```

Expected: all `confirmKeep` tests pass.

- [ ] **Step 5: Create `ConfirmKeep.payload.ts`**

```typescript
// src/infrastructure/adapters/websocket/payloads/ConfirmKeep.payload.ts
import { IsArray, IsString } from 'class-validator';

export class ConfirmKeepPayload {
    @IsArray()
    @IsString({ each: true })
    lockedCharacterIds: string[];
}
```

- [ ] **Step 6: Update `handleConfirmKeep` in `session.gateway.ts`**

Add the import:
```typescript
import { ConfirmKeepPayload } from './payloads/ConfirmKeep.payload';
```

Replace the handler:
```typescript
// Before:
@SubscribeMessage('confirmKeep')
handleConfirmKeep(@ConnectedSocket() client: Socket): void {
    this.gameCoordinator.confirmKeep(client.id);
}

// After:
@SubscribeMessage('confirmKeep')
handleConfirmKeep(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ConfirmKeepPayload,
): void {
    this.gameCoordinator.confirmKeep(client.id, data.lockedCharacterIds);
}
```

- [ ] **Step 7: Run the full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts src/infrastructure/adapters/websocket/session.gateway.ts src/infrastructure/adapters/websocket/payloads/ConfirmKeep.payload.ts
git commit -m "feat: confirmKeep now accepts batched lockedCharacterIds payload"
```

---

## Task 5: Implement batched `confirmAssignment` (TDD)

`confirmAssignment` now accepts `targets: { characterId, target }[]`. Validates all 5 entries atomically, applies targets to player state, then triggers round resolution.

**Files:**
- Modify: `tests/GameCoordinator.service.spec.ts`
- Modify: `src/application/services/GameCoordinator.service.ts`
- Create: `src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`

- [ ] **Step 1: Add `makeTargets` helper and update `confirmAssignment` tests**

After the existing fixtures block in `tests/GameCoordinator.service.spec.ts`, add:
```typescript
// Builds a valid 5-entry targets payload: player 0 targets all enemies at matching slot indices
const makeTargets = (gs: typeof assignGs) =>
    gs.players[0].team.map(c => ({
        characterId: c.id,
        target: { playerIndex: 1 as const, slot: c.position.slot as number },
    }));
```

Replace the entire `describe('confirmAssignment', ...)` block with:
```typescript
describe('confirmAssignment', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(makeRoom(assignGs)));

    it('saves state silently when first to confirm', () => {
        coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs));
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('emits roundResolved then gameStateUpdated for a new round when no winner', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(assignGs)));
        coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.objectContaining({ resolveLog: expect.any(Array) }));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });

    it('emits roundResolved then gameOver when a winner is found', () => {
        const gameOverGs = withDeadEnemies(p1Ready(assignGs));
        mockRoom.getRoom.mockReturnValue(makeRoom(gameOverGs));
        coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0 });
        const calls = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(calls[calls.length - 1]).toBe('gameOver');
    });

    it('emits error when payload contains unknown characterId', () => {
        const bad = makeTargets(assignGs).map((t, i) => i === 0 ? { ...t, characterId: 'unknown-id' } : t);
        coordinator.confirmAssignment(SOCKET_0, bad);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when payload has wrong count (4 entries)', () => {
        coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs).slice(0, 4));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when payload has duplicate characterIds', () => {
        const firstId = assignGs.players[0].team[0].id;
        const dup = makeTargets(assignGs).map((t, i) => i === 4 ? { ...t, characterId: firstId } : t);
        coordinator.confirmAssignment(SOCKET_0, dup);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when target playerIndex is invalid', () => {
        const bad = makeTargets(assignGs).map((t, i) => i === 0 ? { ...t, target: { playerIndex: 2, slot: 0 } } : t);
        coordinator.confirmAssignment(SOCKET_0, bad);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when target slot is out of bounds', () => {
        const bad = makeTargets(assignGs).map((t, i) => i === 0 ? { ...t, target: { playerIndex: 1, slot: 5 } } : t);
        coordinator.confirmAssignment(SOCKET_0, bad);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
```

Update the double-confirm guard:
```typescript
it('emits error on second confirmAssignment', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
    coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs));
    expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
    expect(mockRoom.updateGameState).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm run test -- --testPathPattern=GameCoordinator
```

Expected: `confirmAssignment` tests fail — wrong signature. This is the red state.

- [ ] **Step 3: Implement batched `confirmAssignment` in `GameCoordinator.service.ts`**

Replace the entire `confirmAssignment` method:
```typescript
confirmAssignment(socketId: string, targets: { characterId: string; target: { playerIndex: number; slot: number } }[]): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    const player = room.gameState.players[playerIndex];
    const teamIds = new Set(player.team.map(c => c.id));

    // Validate: 5 unique IDs covering exactly the player's team, valid target positions
    const payloadIds = new Set(targets.map(t => t.characterId));
    if (targets.length !== 5 || payloadIds.size !== 5) {
        this.emitError(socketId, 'Payload must contain exactly one entry per character');
        return;
    }
    for (const entry of targets) {
        if (!teamIds.has(entry.characterId)) { this.emitError(socketId, `Unknown character id: ${entry.characterId}`); return; }
        if (entry.target.playerIndex !== 0 && entry.target.playerIndex !== 1) { this.emitError(socketId, 'Invalid target playerIndex'); return; }
        if (entry.target.slot < 0 || entry.target.slot > 4) { this.emitError(socketId, 'Invalid target slot'); return; }
    }

    try {
        // Apply targets
        let updatedPlayer = player;
        for (const entry of targets) {
            const target: Position = {
                playerIndex: entry.target.playerIndex as PlayerIndex,
                slot: entry.target.slot as SlotIndex,
            };
            const charSlot = updatedPlayer.team.find(c => c.id === entry.characterId)!.position.slot;
            updatedPlayer = selectTargetOfCharacter(updatedPlayer, charSlot, target);
        }
        const players = [...room.gameState.players] as [Player, Player];
        players[playerIndex] = updatedPlayer;
        const gsWithTargets: GameState = { ...room.gameState, players };

        // Confirm and resolve
        const otherIndex = (1 - playerIndex) as PlayerIndex;
        const wasOtherReady = gsWithTargets.playersReady[otherIndex];
        let gs = domainConfirmAssignment(gsWithTargets, playerIndex);

        if (!wasOtherReady) {
            this.roomPort.updateGameState(room.roomId, gs);
            return;
        }

        const { state: resolved, log } = performResolve(gs);
        gs = resolved;
        const winner = checkWinner(gs);

        this.roomPort.updateGameState(room.roomId, gs);
        this.wsPort.emitToRoom(room.roomId, 'roundResolved', {
            gameState: GameStateMapper.toDTO(gs),
            resolveLog: GameStateMapper.resolveStepsToDTO(log),
        });

        if (winner !== null) {
            this.wsPort.emitToRoom(room.roomId, 'gameOver', { winner });
        } else {
            gs = performRoll(beginRollPhase(endOfRound(gs)));
            this.roomPort.updateGameState(room.roomId, gs);
            this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
        }
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
npm run test -- --testPathPattern=GameCoordinator
```

Expected: all `confirmAssignment` tests pass.

- [ ] **Step 5: Create `ConfirmAssignment.payload.ts`**

```typescript
// src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts
import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AssignmentTargetPosition {
    @IsInt()
    playerIndex: number;

    @IsInt()
    slot: number;
}

class AssignmentTarget {
    @IsString()
    characterId: string;

    @ValidateNested()
    @Type(() => AssignmentTargetPosition)
    target: AssignmentTargetPosition;
}

export class ConfirmAssignmentPayload {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AssignmentTarget)
    targets: AssignmentTarget[];
}
```

- [ ] **Step 6: Update `handleConfirmAssignment` in `session.gateway.ts`**

Add the import:
```typescript
import { ConfirmAssignmentPayload } from './payloads/ConfirmAssignment.payload';
```

Replace the handler:
```typescript
// Before:
@SubscribeMessage('confirmAssignment')
handleConfirmAssignment(@ConnectedSocket() client: Socket): void {
    this.gameCoordinator.confirmAssignment(client.id);
}

// After:
@SubscribeMessage('confirmAssignment')
handleConfirmAssignment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ConfirmAssignmentPayload,
): void {
    this.gameCoordinator.confirmAssignment(client.id, data.targets);
}
```

- [ ] **Step 7: Run the full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 8: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts src/infrastructure/adapters/websocket/session.gateway.ts src/infrastructure/adapters/websocket/payloads/ConfirmAssignment.payload.ts
git commit -m "feat: confirmAssignment now accepts batched targets payload"
```
