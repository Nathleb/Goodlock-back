import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { SlotIndex } from '@domain/types/Position.type';
import GamePhase from '@domain/types/GamePhase.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createGameState, initializeEffects } from '@domain/services/GameInit.service';
import { createPlayer } from '@domain/services/Player.service';
import { beginKeepPhase, beginAssignPhase } from '@domain/services/Phase.service';
import { Player } from '@domain/types/Player.type';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SOCKET_0 = 'socket-0';
const SOCKET_1 = 'socket-1';
const SESSION_0: Session = { sessionId: 'p0', socketId: SOCKET_0, deviceIdentifier: 'dev-0', roomId: 'room-1' };
const SESSION_1: Session = { sessionId: 'p1', socketId: SOCKET_1, deviceIdentifier: 'dev-1', roomId: 'room-1' };

const die = generateFullDie([
    { description: 'A', priority: 1, effects: [] },
    { description: 'B', priority: 1, effects: [] },
    { description: 'C', priority: 1, effects: [] },
    { description: 'D', priority: 1, effects: [] },
    { description: 'E', priority: 1, effects: [] },
    { description: 'F', priority: 1, effects: [] },
] satisfies BaseDieInstructions);

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
    roomId: 'room-1', name: '', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true, gameState,
});

const lobbyRoom: Room = { roomId: 'room-1', name: '', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false };
const singlePlayerRoom: Room = { ...lobbyRoom, playersId: ['p0'] };

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom    = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn() };
const mockWs      = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn() };

let coordinator: GameCoordinatorService;

beforeAll(() => initializeEffects());

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    // Default: player 0 acting, room has a game in PLACEMENT
    mockSession.getSession.mockReturnValue(SESSION_0);
    mockRoom.getRoom.mockReturnValue(makeRoom(baseGs));
});

// ── No-context guards ────────────────────────────────────────────────────────

describe('no-context guards (tested via rearrangeTeam)', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('does nothing when session has no roomId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, roomId: undefined });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('does nothing when room is not found', () => {
        mockRoom.getRoom.mockReturnValue(undefined);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('does nothing when room has no game state', () => {
        mockRoom.getRoom.mockReturnValue(lobbyRoom);
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('does nothing when sessionId is not in room.playersId', () => {
        mockSession.getSession.mockReturnValue({ ...SESSION_0, sessionId: 'unknown' });
        coordinator.rearrangeTeam(SOCKET_0, ['a', 'b', 'c', 'd', 'e']);
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
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

// ── confirmPlacement ─────────────────────────────────────────────────────────

describe('confirmPlacement', () => {
    it('marks player ready but does not emit when the other has not confirmed', () => {
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('auto-rolls and emits gameStateUpdated in KEEP phase when both confirm', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(baseGs)));
        coordinator.confirmPlacement(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });
});

// ── toggleDieLock ─────────────────────────────────────────────────────────────

describe('toggleDieLock', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(makeRoom(keepGs)));

    it('emits error when not in KEEP phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(baseGs));
        coordinator.toggleDieLock(SOCKET_0, baseGs.players[0].team[0].id);
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when character ID is unknown', () => {
        coordinator.toggleDieLock(SOCKET_0, 'unknown-id');
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('updates game state without emitting when valid', () => {
        coordinator.toggleDieLock(SOCKET_0, keepGs.players[0].team[0].id);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

// ── confirmKeep ───────────────────────────────────────────────────────────────

describe('confirmKeep', () => {
    it('marks player ready but does not emit when the other has not confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.confirmKeep(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('rerolls and emits gameStateUpdated still in KEEP when both confirm with rollsLeft > 0', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(keepGs)));
        coordinator.confirmKeep(SOCKET_0);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });

    it('advances to ASSIGN and emits gameStateUpdated when both confirm with rollsLeft = 0', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready({ ...keepGs, rollsLeft: 0 })));
        coordinator.confirmKeep(SOCKET_0);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.ASSIGN }));
    });
});

// ── selectTarget ──────────────────────────────────────────────────────────────

describe('selectTarget', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(makeRoom(assignGs)));

    it('emits error when not in ASSIGN phase', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(keepGs));
        coordinator.selectTarget(SOCKET_0, assignGs.players[0].team[0].id, { playerIndex: 1, slot: 0 });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when character ID is unknown', () => {
        coordinator.selectTarget(SOCKET_0, 'unknown-id', { playerIndex: 1, slot: 0 });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when target playerIndex is invalid', () => {
        coordinator.selectTarget(SOCKET_0, assignGs.players[0].team[0].id, { playerIndex: 2, slot: 0 });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('emits error when target slot is out of bounds', () => {
        coordinator.selectTarget(SOCKET_0, assignGs.players[0].team[0].id, { playerIndex: 1, slot: 5 });
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', expect.anything());
    });

    it('updates game state without emitting when valid', () => {
        coordinator.selectTarget(SOCKET_0, assignGs.players[0].team[0].id, { playerIndex: 1, slot: 0 });
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

// ── confirmAssignment ─────────────────────────────────────────────────────────

describe('confirmAssignment', () => {
    it('marks player ready but does not emit when the other has not confirmed', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(assignGs));
        coordinator.confirmAssignment(SOCKET_0);
        expect(mockRoom.updateGameState).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('emits roundResolved then gameStateUpdated for a new round when no winner', () => {
        mockRoom.getRoom.mockReturnValue(makeRoom(p1Ready(assignGs)));
        coordinator.confirmAssignment(SOCKET_0);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.objectContaining({ resolveLog: expect.any(Array) }));
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.KEEP }));
    });

    it('emits roundResolved then gameOver when a winner is found', () => {
        const gameOverGs = withDeadEnemies(p1Ready(assignGs));
        mockRoom.getRoom.mockReturnValue(makeRoom(gameOverGs));
        coordinator.confirmAssignment(SOCKET_0);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roundResolved', expect.anything());
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 0 });
        const calls = mockWs.emitToRoom.mock.calls.map(([, event]) => event);
        expect(calls).not.toContain('gameStateUpdated');
    });
});
