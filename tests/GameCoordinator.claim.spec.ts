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
    return { phase, currentRound: 1, rollsLeft: 2, playersReady, priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] } as unknown as GameState;
}

function room(overrides: Partial<Room>): Room {
    return {
        roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: true,
        playerOrder: ['p0', 'p1'],
        presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
        phaseStartedAt: NOW - 1000,
        gameState: gs(GamePhase.KEEP, [false, false]),
        ...overrides,
    } as Room;
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

    it('rejects a claim after the game already ended', () => {
        const r = room({
            gameState: gs(GamePhase.RESULT, [false, false]),
            presence: [{ connected: true, disconnectedAt: null }, { connected: false, disconnectedAt: NOW - 999_999 }],
        });
        mockRoom.getRoom.mockReturnValue(r);
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
