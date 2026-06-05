import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { SlotIndex } from '@domain/types/Position.type';
import GamePhase from '@domain/types/GamePhase.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createGameState, buildEffectFactory } from '@domain/services/GameInit.service';
import { createPlayer } from '@domain/services/Player.service';
import { beginKeepPhase, beginAssignPhase } from '@domain/services/Phase.service';
import TargetConstraint from '@domain/types/TargetConstraint.type';
import { Player } from '@domain/types/Player.type';
import { UserId } from '@shared/branded.types';
import { EFFECT_FACTORY } from '@application/ports/tokens';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SOCKET_0 = 'socket-0';
const SOCKET_1 = 'socket-1';
const USER_ID_0 = 'user-uuid-0' as UserId;
const USER_ID_1 = 'user-uuid-1' as UserId;
const SESSION_0: Session = { sessionId: 'p0', socketId: SOCKET_0, userId: USER_ID_0, roomId: 'room-1' };
const SESSION_1: Session = { sessionId: 'p1', socketId: SOCKET_1, userId: USER_ID_1, roomId: 'room-1' };

const factory = buildEffectFactory();

const die = generateFullDie([
    { description: 'A', priority: 1, effects: [] },
    { description: 'B', priority: 1, effects: [] },
    { description: 'C', priority: 1, effects: [] },
    { description: 'D', priority: 1, effects: [] },
    { description: 'E', priority: 1, effects: [] },
    { description: 'F', priority: 1, effects: [] },
] satisfies BaseDieInstructions, factory);

const makeTeam = (pi: 0 | 1): Player =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter('C', 100, 1, die, { playerIndex: pi, slot: i as SlotIndex })), pi);

const baseGs = createGameState(makeTeam(0), makeTeam(1));
const keepGs  = beginKeepPhase(baseGs);
const assignGs = beginAssignPhase(baseGs);

const p0Ready = (gs: typeof baseGs) => ({ ...gs, playersReady: [true, false] as [boolean, boolean] });
const p1Ready = (gs: typeof baseGs) => ({ ...gs, playersReady: [false, true] as [boolean, boolean] });

const withDeadEnemies = (gs: typeof baseGs) => ({
    ...gs,
    players: [gs.players[0], { ...gs.players[1], team: gs.players[1].team.map((c, i) => i < 3 ? { ...c, hp: 0 } : c) }] as [Player, Player],
});

const makeRoom = (gameState: typeof baseGs): Room => ({
    roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true, gameState,
});

const lobbyRoom: Room = { roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false };
const singlePlayerRoom: Room = { ...lobbyRoom, playersId: ['p0'] };

// Builds a valid 5-entry targets payload: player 0 targets all enemies at matching slot indices
const makeTargets = (gs: typeof assignGs) =>
    gs.players[0].team.map(c => ({
        characterId: c.id,
        target: { playerIndex: 1 as const, slot: c.position.slot as number },
    }));

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom    = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn() };
const mockWs      = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn() };

let coordinator: GameCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: EFFECT_FACTORY, useValue: factory },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    // Default: player 0 acting, room has a game in PLACEMENT
    mockSession.getSession.mockReturnValue(SESSION_0);
    mockRoom.getRoom.mockReturnValue(makeRoom(baseGs));
});

// ── No-context guards ────────────────────────────────────────────────────────

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

// ── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
    beforeEach(() => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
    });

    it('does nothing when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.startGame(SOCKET_0);
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });

    it('emits error when caller is not the room owner', () => {
        mockSession.getSession.mockReturnValue(SESSION_1);
        coordinator.startGame(SOCKET_1);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_1, 'error', expect.anything());
        expect(mockRoom.startGame).not.toHaveBeenCalled();
    });

    it('emits error when room is not ready (only 1 player)', () => {
        mockRoom.getRoom.mockReturnValue(singlePlayerRoom);
        coordinator.startGame(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('starts the game and emits gameStateUpdated to the room', () => {
        mockRoom.startGame.mockReturnValue({ ...lobbyRoom, isStarted: true });
        coordinator.startGame(SOCKET_0);
        expect(mockRoom.startGame).toHaveBeenCalledWith('room-1', expect.anything());
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.anything());
    });
});

// ── rearrangeTeam ────────────────────────────────────────────────────────────

describe('rearrangeTeam', () => {
    const validIds = () => baseGs.players[0].team.map(c => c.id);

    it('emits error when not in PLACEMENT phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.rearrangeTeam(SOCKET_0, validIds());
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when fewer than 5 IDs are provided', () => {
        coordinator.rearrangeTeam(SOCKET_0, validIds().slice(0, 4));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when duplicate IDs are provided', () => {
        const ids = validIds();
        ids[4] = ids[0];
        coordinator.rearrangeTeam(SOCKET_0, ids);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when an unknown character ID is provided', () => {
        const ids = validIds();
        ids[4] = 'unknown-id';
        coordinator.rearrangeTeam(SOCKET_0, ids);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('updates game state without emitting when valid', () => {
        coordinator.rearrangeTeam(SOCKET_0, validIds().reverse());
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

// ── confirmPlacement ─────────────────────────────────────────────────────────

describe('confirmPlacement', () => {
    it('saves state and emits masked gameStateUpdated to socket when first to confirm', () => {
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('auto-rolls and emits gameStateUpdated in KEEP phase when both confirm', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });
});

// ── confirmKeep ───────────────────────────────────────────────────────────────

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

// ── confirmAssignment ─────────────────────────────────────────────────────────

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

    it('resolves (does not get stuck) when a NONE-constraint face receives the frontend default target and both players confirm', () => {
        const noneDie = generateFullDie([
            { description: 'SelfThing', priority: 1, effects: [], targetConstraint: TargetConstraint.NONE },
            { description: 'B', priority: 1, effects: [] },
            { description: 'C', priority: 1, effects: [] },
            { description: 'D', priority: 1, effects: [] },
            { description: 'E', priority: 1, effects: [] },
            { description: 'F', priority: 1, effects: [] },
        ] satisfies BaseDieInstructions, factory);
        const mixedTeam = createPlayer(
            [0, 1, 2, 3, 4].map(i => createCharacter('C', 100, 1, i === 0 ? noneDie : die, { playerIndex: 0, slot: i as SlotIndex })),
            0,
        );
        const noneGs = beginAssignPhase(createGameState(mixedTeam, makeTeam(1)));
        // player 1 already ready — player 0 confirms second, triggering resolution.
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(noneGs)));
        // char[0] is NONE; the frontend sends it a default enemy target — must be ignored, not rejected.
        coordinator.confirmAssignment(SOCKET_0, makeTargets(noneGs));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
        expect(mockWs.emitToSocket).not.toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error (not roundResolved) when an enemy target violates ALLY_ONLY constraint and both players confirm', () => {
        const allyDie = generateFullDie([
            { description: 'AllyHeal', priority: 1, effects: [], targetConstraint: TargetConstraint.ALLY_ONLY },
            { description: 'B', priority: 1, effects: [] },
            { description: 'C', priority: 1, effects: [] },
            { description: 'D', priority: 1, effects: [] },
            { description: 'E', priority: 1, effects: [] },
            { description: 'F', priority: 1, effects: [] },
        ] satisfies BaseDieInstructions, factory);
        const mixedTeam = createPlayer(
            [0, 1, 2, 3, 4].map(i => createCharacter('C', 100, 1, i === 0 ? allyDie : die, { playerIndex: 0, slot: i as SlotIndex })),
            0,
        );
        const constraintGs = beginAssignPhase(createGameState(mixedTeam, makeTeam(1)));
        // player 1 already ready — player 0 confirms second, triggering resolution
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(constraintGs)));
        // char[0] has ALLY_ONLY; default enemy target violates it → resolve must not run
        coordinator.confirmAssignment(SOCKET_0, makeTargets(constraintGs));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
        expect(mockWs.emitToRoom).not.toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
    });
});

// ── double-confirm guards ────────────────────────────────────────────────────

describe('double-confirm guards', () => {
    it('emits error on second confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error on second confirmKeep', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0, []);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('emits error on second confirmAssignment', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(assignGs)));
        coordinator.confirmAssignment(SOCKET_0, makeTargets(assignGs));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('post-confirm mutation guards', () => {
    it('emits error when rearrangeTeam called after confirmPlacement', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.rearrangeTeam(SOCKET_0, ['id0', 'id1', 'id2', 'id3', 'id4']);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { message: 'Player has already confirmed' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });


});

describe('cancelPlacement', () => {
    it('resets ready state and emits masked gameStateUpdated to socket when confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p0Ready(baseGs)));
        coordinator.cancelPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.anything());
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
