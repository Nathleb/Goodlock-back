import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';

const SOCKET = 'socket-0';
const SESSION: Session = { sessionId: 'p0', socketId: SOCKET, deviceIdentifier: 'dev-0' };
const SESSION_WITH_ROOM: Session = { ...SESSION, roomId: 'room-1' };

const ROOM: Room = { roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false };
const ROOM_SINGLE: Room = { ...ROOM, playersId: ['p0'] };

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn() };

let coordinator: SessionCoordinatorService;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        providers: [
            SessionCoordinatorService,
            { provide: SESSION_PORT, useValue: mockSession },
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: WEBSOCKET_PORT, useValue: mockWs },
        ],
    }).compile();
    coordinator = module.get(SessionCoordinatorService);
});

describe('handleConnect', () => {
    it('creates a new session without joining a WS room when not in any room', () => {
        mockSession.createOrReconnectSession.mockReturnValue(SESSION);
        coordinator.handleConnect(SOCKET, 'dev-0');
        expect(mockSession.createOrReconnectSession).toHaveBeenCalledWith(SOCKET, 'dev-0');
        expect(mockWs.joinRoom).not.toHaveBeenCalled();
    });

    it('re-joins the WS room when reconnecting with an existing roomId', () => {
        mockSession.createOrReconnectSession.mockReturnValue(SESSION_WITH_ROOM);
        coordinator.handleConnect(SOCKET, 'dev-0');
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
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
        mockRoom.quitRoom.mockReturnValue(ROOM);
        coordinator.handleDisconnect(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
        expect(mockSession.disconnectSession).toHaveBeenCalledWith(SOCKET);
    });

    it('does not emit roomUpdated when the last player disconnects', () => {
        mockSession.getSession.mockReturnValue(SESSION_WITH_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.handleDisconnect(SOCKET);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});
