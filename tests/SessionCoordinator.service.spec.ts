import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CLAIM_CONFIG } from '@application/ports/tokens';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { UserId } from '@shared/branded.types';

const SOCKET = 'socket-0';
const USER_ID = 'user-uuid-1' as UserId;
const SESSION: Session = { sessionId: 'p0', socketId: SOCKET, userId: USER_ID };
const SESSION_WITH_ROOM: Session = { ...SESSION, roomId: 'room-1' };

const ROOM: Room = { roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false };
const ROOM_SINGLE: Room = { ...ROOM, playersId: ['p0'] };

const GS: GameState = {
    phase: GamePhase.KEEP,
    currentRound: 1,
    rollsLeft: 2,
    playersReady: [false, false],
    priorityQueue: [],
    players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }],
};

const STARTED_ROOM: Room = {
    roomId: 'room-1',
    ownerId: 'p0',
    playersId: ['p0', 'p1'],
    isStarted: true,
    gameState: GS,
    playerOrder: ['p0', 'p1'],
    presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }],
    phaseStartedAt: 0,
};

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), listOpenRooms: jest.fn(), setPresence: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };

let coordinator: SessionCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            SessionCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
            { provide: CLAIM_CONFIG, useValue: { graceMs: 60_000, afkLimitMs: 120_000 } },
        ],
    }).compile();
    coordinator = module.get(SessionCoordinatorService);
});

describe('handleConnect', () => {
    it('creates a new session without joining a WS room when not in any room', () => {
        mockSession.createOrReconnectSession.mockReturnValue({ session: SESSION, evictedSocketId: null });
        coordinator.handleConnect(SOCKET, USER_ID);
        expect(mockSession.createOrReconnectSession).toHaveBeenCalledWith(SOCKET, USER_ID);
        expect(mockWs.joinRoom).not.toHaveBeenCalled();
    });

    it('re-joins the WS room when reconnecting with an existing roomId', () => {
        mockSession.createOrReconnectSession.mockReturnValue({ session: SESSION_WITH_ROOM, evictedSocketId: null });
        mockRoom.getRoom.mockReturnValue(ROOM);
        coordinator.handleConnect(SOCKET, USER_ID);
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
    });
});

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

describe('handleDisconnect', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.handleDisconnect(SOCKET);
        expect(mockSession.disconnectSession).not.toHaveBeenCalled();
    });

    it('only disconnects the session when not in any room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        coordinator.handleDisconnect(SOCKET);
        expect(mockSession.disconnectSession).toHaveBeenCalledWith(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });

    it('quits the room and notifies the remaining player on disconnect', () => {
        mockSession.getSession.mockReturnValue(SESSION_WITH_ROOM);
        mockRoom.getRoom.mockReturnValue(ROOM);
        mockRoom.quitRoom.mockReturnValue(ROOM);
        coordinator.handleDisconnect(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
        expect(mockSession.disconnectSession).toHaveBeenCalledWith(SOCKET);
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, undefined);
    });

    it('does not emit roomUpdated when the last player disconnects', () => {
        mockSession.getSession.mockReturnValue(SESSION_WITH_ROOM);
        mockRoom.getRoom.mockReturnValue(ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.handleDisconnect(SOCKET);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
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
