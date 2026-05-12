# Cancel Confirmation & Silent Single-Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cancelPlacement`, `cancelKeep`, `cancelAssignment` WebSocket events that reset a player's ready state, and remove the `gameStateUpdated` emit that fires when only one player has confirmed.

**Architecture:** Cancel functions live in the domain (`GameLoop.service.ts`) as pure functions mirroring the confirm functions. The coordinator adds three thin cancel methods that call the domain, save state, and emit nothing. The single-confirm notification is removed from `confirmAction` and `confirmAssignment` in the coordinator.

**Tech Stack:** NestJS, Socket.IO, Jest

---

### Task 1: Domain cancel functions

**Files:**
- Modify: `src/domain/services/GameLoop.service.ts`
- Modify: `tests/GameLoop.service.spec.ts`

- [ ] **Step 1.1: Write failing tests**

In `tests/GameLoop.service.spec.ts`, add `cancelPlacement`, `cancelKeep`, `cancelAssignment` to the existing GameLoop import:

```ts
import {
    confirmPlacement, performRoll, confirmKeep, confirmAssignment, performResolve,
    cancelPlacement, cancelKeep, cancelAssignment,
} from "@domain/services/GameLoop.service";
```

Append these describe blocks at the end of the file:

```ts
describe('cancelPlacement', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const confirmed = confirmPlacement(gs, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelPlacement(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.PLACEMENT);
    });

    it('returns the same reference when player was not confirmed', () => {
        const result = cancelPlacement(gs, 0);
        expect(result).toBe(gs);
    });

    it('throws when called outside PLACEMENT phase', () => {
        expect(() => cancelPlacement(beginKeepPhase(gs), 0)).toThrow();
    });
});

describe('cancelKeep', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const confirmed = confirmKeep(inKeep, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelKeep(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('returns the same reference when player was not confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const result = cancelKeep(inKeep, 0);
        expect(result).toBe(inKeep);
    });

    it('throws when called outside KEEP phase', () => {
        expect(() => cancelKeep(gs, 0)).toThrow();
    });
});

describe('cancelAssignment', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inAssign = beginAssignPhase(gs);
        const confirmed = confirmAssignment(inAssign, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelAssignment(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.ASSIGN);
    });

    it('returns the same reference when player was not confirmed', () => {
        const inAssign = beginAssignPhase(gs);
        const result = cancelAssignment(inAssign, 0);
        expect(result).toBe(inAssign);
    });

    it('throws when called outside ASSIGN phase', () => {
        expect(() => cancelAssignment(gs, 0)).toThrow();
    });
});
```

- [ ] **Step 1.2: Run test — verify FAIL**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest tests/GameLoop.service.spec.ts --forceExit 2>&1 | tail -15
```

Expected: FAIL — `cancelPlacement is not a function`

- [ ] **Step 1.3: Implement cancel functions in `GameLoop.service.ts`**

Add a private `unmarkPlayerReady` function after the existing `markPlayerReady` (line ~14), and export the three cancel functions after `confirmAssignment`:

```ts
function unmarkPlayerReady(gs: GameState, playerIndex: PlayerIndex): GameState {
    const ready: [boolean, boolean] = [gs.playersReady[0], gs.playersReady[1]];
    ready[playerIndex] = false;
    return { ...gs, playersReady: ready };
}
```

```ts
export function cancelPlacement(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.PLACEMENT);
    if (!gs.playersReady[playerIndex]) return gs;
    return unmarkPlayerReady(gs, playerIndex);
}

export function cancelKeep(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.KEEP);
    if (!gs.playersReady[playerIndex]) return gs;
    return unmarkPlayerReady(gs, playerIndex);
}

export function cancelAssignment(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.ASSIGN);
    if (!gs.playersReady[playerIndex]) return gs;
    return unmarkPlayerReady(gs, playerIndex);
}
```

- [ ] **Step 1.4: Run test — verify PASS**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest tests/GameLoop.service.spec.ts --forceExit 2>&1 | tail -15
```

Expected: PASS — all tests including the 9 new ones.

---

### Task 2: Remove single-confirm notifications + add cancel coordinator methods

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`

- [ ] **Step 2.1: Update the three existing "first to confirm" tests**

In `tests/GameCoordinator.service.spec.ts`, update these three tests:

**Line 193 — `confirmPlacement`:** rename and remove socket emit assertion:
```ts
it('saves state silently when first to confirm', () => {
    coordinator.confirmPlacement(SOCKET_0);
    expect(mockRoom.updateGameState).toHaveBeenCalled();
    expect(mockWs.emitToSocket).not.toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
    expect(mockWs.emitToRoom).not.toHaveBeenCalled();
});
```

**Line 235 — `confirmKeep`:** rename and remove socket emit assertion:
```ts
it('saves state silently when first to confirm', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
    coordinator.confirmKeep(SOCKET_0);
    expect(mockRoom.updateGameState).toHaveBeenCalled();
    expect(mockWs.emitToSocket).not.toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
    expect(mockWs.emitToRoom).not.toHaveBeenCalled();
});
```

**Line 293 — `confirmAssignment`:** rename and remove socket emit assertion:
```ts
it('saves state silently when first to confirm', () => {
    mockRoom.getRoom.mockReturnValue(makeRoom(assignGs));
    coordinator.confirmAssignment(SOCKET_0);
    expect(mockRoom.updateGameState).toHaveBeenCalled();
    expect(mockWs.emitToSocket).not.toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
    expect(mockWs.emitToRoom).not.toHaveBeenCalled();
});
```

- [ ] **Step 2.2: Add cancel coordinator tests**

Append at the end of `tests/GameCoordinator.service.spec.ts`:

```ts
describe('cancelPlacement', () => {
    it('resets ready state silently when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('does not save when not confirmed (no-op)', () => {
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('emits error when not in PLACEMENT phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('cancelKeep', () => {
    it('resets ready state silently when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.cancelKeep(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('does not save when not confirmed (no-op)', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.cancelKeep(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('emits error when not in KEEP phase', () => {
        coordinator.cancelKeep(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('cancelAssignment', () => {
    it('resets ready state silently when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
        coordinator.cancelAssignment(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('does not save when not confirmed (no-op)', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(assignGs));
        coordinator.cancelAssignment(SOCKET_0);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
    });

    it('emits error when not in ASSIGN phase', () => {
        coordinator.cancelAssignment(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2.3: Run tests — verify FAIL**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest tests/GameCoordinator.service.spec.ts --forceExit 2>&1 | tail -20
```

Expected: multiple failures — updated "first to confirm" tests now fail (still emitting), cancel methods don't exist yet.

- [ ] **Step 2.4: Update `GameCoordinator.service.ts`**

**A) Update the GameLoop import** to include the three cancel functions:

```ts
import {
    confirmPlacement, performRoll,
    confirmKeep,
    confirmAssignment as domainConfirmAssignment,
    cancelPlacement as domainCancelPlacement,
    cancelKeep as domainCancelKeep,
    cancelAssignment as domainCancelAssignment,
    performResolve,
} from '@domain/services/GameLoop.service';
```

**B) Remove the single-confirm emit from `confirmAction`.**

Current (lines ~66–70):
```ts
if (wasOtherReady) {
    this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
} else {
    this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
}
```

Replace with:
```ts
if (wasOtherReady) {
    this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
}
```

**C) Remove the single-confirm emit from `confirmAssignment`.**

Current early-return block (~lines 212–215):
```ts
if (!wasOtherReady) {
    this.roomPort.updateGameState(room.roomId, gs);
    this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
    return;
}
```

Replace with:
```ts
if (!wasOtherReady) {
    this.roomPort.updateGameState(room.roomId, gs);
    return;
}
```

**D) Add the three cancel methods** after `confirmAssignment`:

```ts
cancelPlacement(socketId: string): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        const gs = domainCancelPlacement(room.gameState, playerIndex);
        if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}

cancelKeep(socketId: string): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        const gs = domainCancelKeep(room.gameState, playerIndex);
        if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}

cancelAssignment(socketId: string): void {
    const ctx = this.getContext(socketId);
    if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
    const { room, playerIndex } = ctx;
    try {
        const gs = domainCancelAssignment(room.gameState, playerIndex);
        if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
    } catch (e: unknown) {
        this.emitError(socketId, (e as Error).message);
    }
}
```

- [ ] **Step 2.5: Run tests — verify PASS**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest tests/GameCoordinator.service.spec.ts --forceExit 2>&1 | tail -20
```

Expected: PASS — all tests.

- [ ] **Step 2.6: Run full suite — verify no regressions**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest --forceExit 2>&1 | tail -10
```

Expected: all suites pass (SessionCoordinator.service.spec.ts should also be green now).

---

### Task 3: Gateway handlers

**Files:**
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`

- [ ] **Step 3.1: Add three handlers to the gateway**

In `src/infrastructure/adapters/websocket/session.gateway.ts`, append the three handlers inside the class, after `handleConfirmAssignment`:

```ts
@SubscribeMessage('cancelPlacement')
handleCancelPlacement(@ConnectedSocket() client: Socket): void {
    this.gameCoordinator.cancelPlacement(client.id);
}

@SubscribeMessage('cancelKeep')
handleCancelKeep(@ConnectedSocket() client: Socket): void {
    this.gameCoordinator.cancelKeep(client.id);
}

@SubscribeMessage('cancelAssignment')
handleCancelAssignment(@ConnectedSocket() client: Socket): void {
    this.gameCoordinator.cancelAssignment(client.id);
}
```

- [ ] **Step 3.2: Compile check**

```bash
cd /home/lebih/projects/Goodlock-back && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3.3: Run full suite — final verification**

```bash
cd /home/lebih/projects/Goodlock-back && npx jest --forceExit 2>&1 | tail -10
```

Expected: all suites pass.
