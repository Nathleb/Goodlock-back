# Session Security & Action Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce three security layers: `assertNotReady` prevents double-confirms and post-confirm mutations; game context failures emit a generic error; a NestJS `SessionGuard` blocks sockets without a session.

**Architecture:** `assertNotReady` is a pure domain function in `Phase.service.ts` (co-located with `assertPhase`). The `SessionGuard` is intentionally thin — it only checks session existence and is designed to be replaced/extended when account authentication is added later. The coordinator changes are purely additive.

**Tech Stack:** NestJS `@nestjs/common`, Socket.IO, Jest

---

### Task 1: `assertNotReady` pure domain function

**Files:**
- Modify: `src/domain/services/Phase.service.ts`
- Modify: `tests/Phase.service.spec.ts`

- [ ] **Step 1.1: Write the failing test**

In `tests/Phase.service.spec.ts`, add `assertNotReady` and `PlayerIndex` to the existing import from `@domain/services/Phase.service` and `@domain/types/Position.type`, then append a new describe block at the end of the file:

```ts
// add to existing import:
import { assertPhase, assertNotReady, ... } from "@domain/services/Phase.service";
import { SlotIndex, PlayerIndex } from "@domain/types/Position.type";
```

```ts
describe('assertNotReady', () => {
    it('does not throw when player has not confirmed', () => {
        expect(() => assertNotReady(gs, 0 as PlayerIndex)).not.toThrow();
        expect(() => assertNotReady(gs, 1 as PlayerIndex)).not.toThrow();
    });

    it('throws when player 0 has already confirmed', () => {
        const ready = { ...gs, playersReady: [true, false] as [boolean, boolean] };
        expect(() => assertNotReady(ready, 0 as PlayerIndex))
            .toThrow('Player has already confirmed');
    });

    it('throws when player 1 has already confirmed', () => {
        const ready = { ...gs, playersReady: [false, true] as [boolean, boolean] };
        expect(() => assertNotReady(ready, 1 as PlayerIndex))
            .toThrow('Player has already confirmed');
    });

    it('does not throw for the other player when one has confirmed', () => {
        const ready = { ...gs, playersReady: [true, false] as [boolean, boolean] };
        expect(() => assertNotReady(ready, 1 as PlayerIndex)).not.toThrow();
    });
});
```

Note: `gs` is already defined at the top of `Phase.service.spec.ts` as the result of `createGameState(...)` — it has `playersReady: [false, false]` by default.

- [ ] **Step 1.2: Run test — verify FAIL**

```bash
npx jest tests/Phase.service.spec.ts --forceExit
```

Expected: FAIL — `assertNotReady is not a function`

- [ ] **Step 1.3: Implement `assertNotReady` in `Phase.service.ts`**

Replace the entire file content:

```ts
import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";

export function assertPhase(gameState: GameState, expected: GamePhase): void {
    if (gameState.phase !== expected) {
        throw new Error(`Expected phase ${expected}, got ${gameState.phase}`);
    }
}

export function assertNotReady(gs: GameState, playerIndex: PlayerIndex): void {
    if (gs.playersReady[playerIndex]) throw new Error('Player has already confirmed');
}

export const beginPlacementPhase = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.PLACEMENT });
export const beginRollPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.ROLL });
export const beginKeepPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.KEEP });
export const beginAssignPhase    = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.ASSIGN });
export const beginResolvePhase   = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESOLVE });
export const beginResultPhase    = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESULT });
```

- [ ] **Step 1.4: Run test — verify PASS**

```bash
npx jest tests/Phase.service.spec.ts --forceExit
```

Expected: PASS — all tests including the 4 new ones.

- [ ] **Step 1.5: Commit**

```bash
git add src/domain/services/Phase.service.ts tests/Phase.service.spec.ts
git commit -m "feat: add assertNotReady domain guard to Phase.service"
```

---

### Task 2: Wire `assertNotReady` into GameLoop confirm functions (double-confirm prevention)

**Files:**
- Modify: `src/domain/services/GameLoop.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`

- [ ] **Step 2.1: Write the failing tests**

In `tests/GameCoordinator.service.spec.ts`, append a new describe block after the existing `confirmAssignment` suite. The spec already has `p0Ready`, `keepGs`, and `assignGs` helpers defined at the top:

```ts
describe('double-confirm guards', () => {
    it('emits error on second confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error on second confirmKeep', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error on second confirmAssignment', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
        coordinator.confirmAssignment(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2.2: Run test — verify FAIL**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: FAIL — 3 new tests. The second confirm currently succeeds instead of throwing.

- [ ] **Step 2.3: Add `assertNotReady` to the three confirm functions in `GameLoop.service.ts`**

Update the import line (add `assertNotReady`):

```ts
import { assertPhase, assertNotReady, beginRollPhase, beginKeepPhase, beginAssignPhase, beginResolvePhase, beginResultPhase } from "./Phase.service";
```

Add `assertNotReady` immediately after `assertPhase` in each function:

```ts
export function confirmPlacement(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.PLACEMENT);
    assertNotReady(gs, playerIndex);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;
    return resetReady(beginRollPhase(updated));
}
```

```ts
export function confirmKeep(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.KEEP);
    assertNotReady(gs, playerIndex);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;

    const bothLocked = allDiceLocked(updated.players[0]) && allDiceLocked(updated.players[1]);
    if (updated.rollsLeft === 0 || bothLocked) {
        return resetReady(beginAssignPhase(updated));
    }

    return resetReady({ ...rerollBothPlayers(updated), rollsLeft: updated.rollsLeft - 1 });
}
```

```ts
export function confirmAssignment(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.ASSIGN);
    assertNotReady(gs, playerIndex);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;
    return resetReady(beginResolvePhase(updated));
}
```

- [ ] **Step 2.4: Run test — verify PASS**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 2.5: Commit**

```bash
git add src/domain/services/GameLoop.service.ts tests/GameCoordinator.service.spec.ts
git commit -m "feat: prevent double-confirm via assertNotReady in GameLoop confirm functions"
```

---

### Task 3: Wire `assertNotReady` into coordinator mutation handlers (post-confirm prevention)

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`

- [ ] **Step 3.1: Write the failing tests**

Append another describe block in `tests/GameCoordinator.service.spec.ts`:

```ts
describe('post-confirm mutation guards', () => {
    it('emits error when rearrangeTeam called after confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.rearrangeTeam(SOCKET_0, ['id0', 'id1', 'id2', 'id3', 'id4']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when toggleDieLock called after confirmKeep', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.toggleDieLock(SOCKET_0, 'any-char-id');
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when selectTarget called after confirmAssignment', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
        coordinator.selectTarget(SOCKET_0, 'any-char-id', { playerIndex: 1, slot: 0 });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
```

Note: `assertNotReady` fires before character-lookup validation in these handlers, so the character IDs / target values above do not need to be valid — the throw happens first.

- [ ] **Step 3.2: Run test — verify FAIL**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: FAIL — 3 new tests. Mutations currently succeed instead of throwing.

- [ ] **Step 3.3: Add `assertNotReady` to the three mutation handlers in `GameCoordinator.service.ts`**

Update the import (add `assertNotReady`):

```ts
import { assertPhase, assertNotReady, beginRollPhase } from '@domain/services/Phase.service';
```

In `rearrangeTeam`, add the call after `assertPhase` (line ~121):

```ts
try {
    assertPhase(room.gameState, GamePhase.PLACEMENT);
    assertNotReady(room.gameState, playerIndex);
    const player = room.gameState.players[playerIndex];
    // ... rest unchanged
```

In `toggleDieLock`, add after `assertPhase` (line ~153):

```ts
try {
    assertPhase(room.gameState, GamePhase.KEEP);
    assertNotReady(room.gameState, playerIndex);
    const player = room.gameState.players[playerIndex];
    // ... rest unchanged
```

In `selectTarget`, add after `assertPhase` (line ~178):

```ts
try {
    assertPhase(room.gameState, GamePhase.ASSIGN);
    assertNotReady(room.gameState, playerIndex);
    const player = room.gameState.players[playerIndex];
    // ... rest unchanged
```

- [ ] **Step 3.4: Run test — verify PASS**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 3.5: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts
git commit -m "feat: prevent post-confirm mutations via assertNotReady in GameCoordinator"
```

---

### Task 4: `getContext()` null → emit generic error

**Files:**
- Modify: `src/application/services/GameCoordinator.service.ts`
- Modify: `tests/GameCoordinator.service.spec.ts`

- [ ] **Step 4.1: Update the existing no-context tests to expect error emission**

In `tests/GameCoordinator.service.spec.ts`, update the describe block `no-context guards (tested via rearrangeTeam)`. Rename it to `context guards (tested via rearrangeTeam)`. For each of the 5 tests: rename the test from `does nothing when…` to `emits error when…` and add the assertion. Example — all 5 follow this pattern:

```ts
describe('context guards (tested via rearrangeTeam)', () => {
    it('emits error when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room is not found', () => {
        mockRoom.getRoom.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when room has no game state', () => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error when sessionId is not in room.playersId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, sessionId: 'unknown' });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Action not available' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 4.2: Run test — verify FAIL**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: FAIL — 5 tests now expect an error emission that doesn't happen yet.

- [ ] **Step 4.3: Change all `if (!ctx) return;` in `GameCoordinator.service.ts`**

There are 5 occurrences. Change each one from:

```ts
if (!ctx) return;
```

to:

```ts
if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
```

The 5 locations are:
1. `confirmAction` (line 58)
2. `rearrangeTeam` (line 118)
3. `toggleDieLock` (line 150)
4. `selectTarget` (line 175)
5. `confirmAssignment` (line 202)

- [ ] **Step 4.4: Run test — verify PASS**

```bash
npx jest tests/GameCoordinator.service.spec.ts --forceExit
```

Expected: PASS — all tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/application/services/GameCoordinator.service.ts tests/GameCoordinator.service.spec.ts
git commit -m "feat: emit generic error on missing game context instead of silent drop"
```

---

### Task 5: `SessionGuard` + registration

**Files:**
- Create: `src/infrastructure/adapters/websocket/guards/Session.guard.ts`
- Create: `tests/SessionGuard.spec.ts`
- Modify: `src/app.module.ts`
- Modify: `src/infrastructure/adapters/websocket/session.gateway.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/SessionGuard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SessionGuard } from '../src/infrastructure/adapters/websocket/guards/Session.guard';
import { SESSION_PORT } from '../src/application/ports/tokens';

const mockSessionPort = {
    getSession: jest.fn(),
    createOrReconnectSession: jest.fn(),
    setSessionRoom: jest.fn(),
    disconnectSession: jest.fn(),
    deleteSession: jest.fn(),
};

function makeContext(socketId: string): { ctx: ExecutionContext; emit: jest.Mock } {
    const emit = jest.fn();
    const ctx = {
        switchToWs: () => ({ getClient: () => ({ id: socketId, emit }) }),
    } as unknown as ExecutionContext;
    return { ctx, emit };
}

describe('SessionGuard', () => {
    let guard: SessionGuard;

    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                SessionGuard,
                { provide: SESSION_PORT, useValue: mockSessionPort },
            ],
        }).compile();
        guard = module.get(SessionGuard);
    });

    it('returns true when session exists', () => {
        mockSessionPort.getSession.mockReturnValue({ sessionId: 'p0', socketId: 'socket-0', deviceIdentifier: 'dev-0' });
        const { ctx, emit } = makeContext('socket-0');
        expect(guard.canActivate(ctx)).toBe(true);
        expect(emit).not.toHaveBeenCalled();
    });

    it('returns false and emits error when session does not exist', () => {
        mockSessionPort.getSession.mockReturnValue(undefined);
        const { ctx, emit } = makeContext('socket-0');
        expect(guard.canActivate(ctx)).toBe(false);
        expect(emit).toHaveBeenCalledWith('error', { message: 'Not connected' });
    });
});
```

- [ ] **Step 5.2: Run test — verify FAIL**

```bash
npx jest tests/SessionGuard.spec.ts --forceExit
```

Expected: FAIL — `Cannot find module '../src/infrastructure/adapters/websocket/guards/Session.guard'`

- [ ] **Step 5.3: Implement `Session.guard.ts`**

Create `src/infrastructure/adapters/websocket/guards/Session.guard.ts`:

```ts
import { Injectable, Inject, CanActivate, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import { SESSION_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(@Inject(SESSION_PORT) private readonly sessionPort: SessionPort) {}

    canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient();
        const session = this.sessionPort.getSession(client.id);
        if (!session) {
            client.emit('error', { message: 'Not connected' });
            return false;
        }
        return true;
    }
}
```

- [ ] **Step 5.4: Run guard test — verify PASS**

```bash
npx jest tests/SessionGuard.spec.ts --forceExit
```

Expected: PASS — 2 tests.

- [ ] **Step 5.5: Register `SessionGuard` in `AppModule`**

Replace `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ROOM_PORT, SESSION_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';
import { SessionGuard } from '@infrastructure/adapters/websocket/guards/Session.guard';

@Module({
    imports: [],
    providers: [
        { provide: ROOM_PORT, useClass: RoomManager },
        { provide: SESSION_PORT, useClass: SessionManager },
        { provide: WEBSOCKET_PORT, useClass: WebSocketService },
        SharedWebSocketService,
        RoomCoordinatorService,
        SessionCoordinatorService,
        GameCoordinatorService,
        SessionGateway,
        SessionGuard,
    ],
})
export class AppModule {}
```

- [ ] **Step 5.6: Apply `@UseGuards(SessionGuard)` to the gateway**

In `src/infrastructure/adapters/websocket/session.gateway.ts`, add the `UseGuards` import and decorator:

```ts
import {
    WebSocketGateway,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    UseGuards,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SharedWebSocketService } from './services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { SessionGuard } from './guards/Session.guard';
import { JoinRoomPayload } from './payloads/JoinRoom.payload';
import { RearrangeTeamPayload } from './payloads/RearrangeTeam.payload';
import { ToggleDieLockPayload } from './payloads/ToggleDieLock.payload';
import { SelectTargetPayload } from './payloads/SelectTarget.payload';

@UseGuards(SessionGuard)
@WebSocketGateway({ cors: { origin: '*' } })
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    // ... constructor and all handlers unchanged
```

`@UseGuards` on the class applies to all `@SubscribeMessage()` handlers. It does NOT apply to `handleConnection` or `handleDisconnect` (lifecycle hooks), which is the correct behaviour.

- [ ] **Step 5.7: Run full test suite — verify PASS**

```bash
npx jest --forceExit
```

Expected: PASS — all suites.

- [ ] **Step 5.8: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.9: Commit**

```bash
git add src/infrastructure/adapters/websocket/guards/Session.guard.ts tests/SessionGuard.spec.ts src/app.module.ts src/infrastructure/adapters/websocket/session.gateway.ts
git commit -m "feat: add SessionGuard to enforce session existence on all WebSocket handlers"
```
