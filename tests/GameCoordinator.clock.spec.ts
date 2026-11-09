import { P0, P1, asRoom } from './helpers/ids';
import { CatalogId, SocketId } from '@shared/branded.types';
import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CATALOG_PORT, MATCH_TIMER_PORT } from '@application/ports/tokens';
import { makeTestCatalog } from './helpers/catalog';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { createClocks } from '@domain/services/Clock.service';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { ok } from '@shared/result.type';

const NOW = 1_000_000;
const SECOND = 1000;
const SOCKET_0 = 'sock-0' as SocketId;
const SOCKET_1 = 'sock-1' as SocketId;

const mockSession = { getSession: jest.fn(), getSessionById: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), closeRoom: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };
const mockTimer = { schedule: jest.fn(), cancel: jest.fn() };

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    return {
        phase, currentRound: 1, rollsLeft: 2, initiativePlayerIndex: 0, playersReady, priorityQueue: [],
        clocks: createClocks(), clockUpdatedAt: NOW,
        players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }],
    } as unknown as GameState;
}

function room(overrides: Partial<Room>): Room {
    return {
        roomId: asRoom('room-1'), ownerId: P0, playersId: [P0, P1], isStarted: true,
        playerOrder: [P0, P1],
        gameState: gs(GamePhase.KEEP, [false, false]),
        ...overrides,
    } as Room;
}

const sessionOf = (socketId: SocketId, sessionId: typeof P0) => ({ sessionId, socketId, userId: 'u', roomId: asRoom('room-1') });
const savedState = (): GameState => mockRoom.updateGameState.mock.calls.at(-1)[1];

let coordinator: GameCoordinatorService;
let now = NOW;

beforeEach(async () => {
    jest.clearAllMocks();
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const module = await Test.createTestingModule({
        providers: [
            GameCoordinatorService,
            MatchLifecycleService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: CATALOG_PORT, useValue: makeTestCatalog(10) },
            { provide: MATCH_TIMER_PORT, useValue: mockTimer },
        ],
    }).compile();
    coordinator = module.get(GameCoordinatorService);
    mockSession.getSession.mockImplementation((socket: string) => socket === SOCKET_1 ? sessionOf(SOCKET_1, P1) : sessionOf(SOCKET_0, P0));
    mockSession.getSessionById.mockImplementation((id: string) => id === P0 ? sessionOf(SOCKET_0, P0) : id === P1 ? sessionOf(SOCKET_1, P1) : undefined);
    mockRoom.closeRoom.mockImplementation(() => room({}));
});

afterEach(() => jest.restoreAllMocks());

describe('SEL-1: the clocks start with the match', () => {
    it('stamps them with the start of Selection and wakes the server up when the first one would run out', () => {
        const deck = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] as CatalogId[];
        const lobby = room({ isStarted: false, playerOrder: undefined, gameState: undefined, deckSelections: { [P0]: deck, [P1]: deck } });
        mockRoom.getRoom.mockReturnValue(lobby);
        mockRoom.startGame.mockImplementation((_id: string, state: GameState) => {
            const started = room({ gameState: state });
            mockRoom.getRoom.mockReturnValue(started);
            return ok(started);
        });

        coordinator.startGame(SOCKET_0);

        const started: GameState = mockRoom.startGame.mock.calls[0][1];
        expect(started.clocks).toEqual(createClocks());
        expect(started.clockUpdatedAt).toBe(NOW);
        expect(mockTimer.schedule).toHaveBeenCalledWith('room-1', NOW + 600_000, expect.any(Function));
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'gameStateUpdated', expect.objectContaining({ clocks: expect.any(Array) }));
    });
});

describe('CLOCK-2: every action settles the clocks, and a confirmation pauses the confirmer', () => {
    beforeEach(() => mockRoom.getRoom.mockReturnValue(room({ gameState: gs(GamePhase.PLACEMENT, [false, false]) })));

    it('charges the time since the last action to both players, then pauses the one who confirms', () => {
        now = NOW + 5 * SECOND;

        coordinator.confirmPlacement(SOCKET_0);

        const saved = savedState();
        expect(saved.clocks.map(c => c.remainingMs)).toEqual([595_000, 595_000]);
        expect(saved.clockUpdatedAt).toBe(NOW + 5 * SECOND);
        expect(saved.playersReady).toEqual([true, false]);
    });

    it('does not charge the player who has confirmed while the other one thinks', () => {
        mockRoom.getRoom.mockReturnValue(room({ gameState: { ...gs(GamePhase.PLACEMENT, [true, false]), clocks: [{ ...createClocks()[0], remainingMs: 595_000 }, { ...createClocks()[1], remainingMs: 595_000 }] as GameState['clocks'] } }));
        now = NOW + 10 * SECOND;

        coordinator.confirmPlacement(SOCKET_1);

        expect(savedState().clocks.map(c => c.remainingMs)).toEqual([595_000, 585_000]);
    });

    it('wakes the server up at the moment the clock of the player who still thinks would run out', () => {
        now = NOW + 5 * SECOND;

        coordinator.confirmPlacement(SOCKET_0);

        expect(mockTimer.schedule).toHaveBeenLastCalledWith('room-1', NOW + 600_000, expect.any(Function));
    });
});

describe('CLOCK-3: a player whose clock has run out loses at once', () => {
    it('ends the match when they act too late, and the action is not played', () => {
        const clocks: GameState['clocks'] = [{ ...createClocks()[0], remainingMs: 3000 }, createClocks()[1]];
        mockRoom.getRoom.mockReturnValue(room({ gameState: { ...gs(GamePhase.PLACEMENT, [false, false]), clocks } }));
        now = NOW + 10 * SECOND;

        coordinator.confirmPlacement(SOCKET_1);

        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 1, reason: 'clock' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
        expect(mockRoom.closeRoom).toHaveBeenCalledWith('room-1');
    });
});

describe('AWAY-1: concede', () => {
    it.each([[SOCKET_0, 1], [SOCKET_1, 0]] as const)('%s concedes: the other player wins, by concession', (socket, winner) => {
        mockRoom.getRoom.mockReturnValue(room({}));

        coordinator.concede(socket);

        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner, reason: 'concede' });
        expect(mockRoom.closeRoom).toHaveBeenCalledWith('room-1');
    });

    it('is refused for a player with no match to concede', () => {
        mockSession.getSession.mockReturnValue({ sessionId: P0, socketId: SOCKET_0, userId: 'u' });

        coordinator.concede(SOCKET_0);

        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET_0, 'error', { code: 'ACTION_NOT_AVAILABLE', message: 'Action not available' });
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('stable player identity', () => {
    it('resolves playerIndex from playerOrder even when playersId shrank', () => {
        mockRoom.getRoom.mockReturnValue(room({ playersId: [P0] }));

        coordinator.concede(SOCKET_0);

        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'gameOver', { winner: 1, reason: 'concede' });
    });
});
