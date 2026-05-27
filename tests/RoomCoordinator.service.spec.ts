import { Test } from '@nestjs/testing';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { Session } from '@application/dtos/Session.dto';
import { Room } from '@domain/types/Room.type';
import { UserId } from '@shared/branded.types';

const SOCKET = 'socket-0';
const USER_ID = 'user-uuid-0' as UserId;
const SESSION: Session = { sessionId: 'p0', socketId: SOCKET, userId: USER_ID };
const SESSION_IN_ROOM: Session = { ...SESSION, roomId: 'old-room' };

const ROOM: Room = { roomId: 'room-1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false };
const OLD_ROOM: Room = { roomId: 'old-room', ownerId: 'p0', playersId: ['p0'], isStarted: false };

const mockSession = { getSession: jest.fn(), createOrReconnectSession: jest.fn(), setSessionRoom: jest.fn(), disconnectSession: jest.fn(), deleteSession: jest.fn() };
const mockRoom = { getRoom: jest.fn(), createRoom: jest.fn(), joinRoom: jest.fn(), quitRoom: jest.fn(), startGame: jest.fn(), updateGameState: jest.fn(), listOpenRooms: jest.fn() };
const mockWs = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn() };

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
});

describe('createRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.createRoom).not.toHaveBeenCalled();
    });

    it('creates room and emits roomCreated to the creator', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.createRoom).toHaveBeenCalledWith('p0');
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'roomCreated', expect.anything());
    });

    it('leaves the old room before creating a new one', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockRoom.createRoom).toHaveBeenCalled();
    });

    it('notifies the remaining player in the old room when leaving to create', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(OLD_ROOM);
        mockRoom.createRoom.mockReturnValue(ROOM);
        coordinator.createRoom(SOCKET);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('old-room', 'roomUpdated', expect.anything());
    });
});

describe('joinRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.joinRoom(SOCKET, 'room-1');
        expect(mockRoom.joinRoom).not.toHaveBeenCalled();
    });

    it('joins room and emits roomUpdated to the whole room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.joinRoom.mockReturnValue(ROOM);
        coordinator.joinRoom(SOCKET, 'room-1');
        expect(mockRoom.joinRoom).toHaveBeenCalledWith('p0', 'room-1');
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.joinRoom).toHaveBeenCalledWith(SOCKET, 'room-1');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
    });

    it('leaves the old room before joining a new one', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        mockRoom.joinRoom.mockReturnValue(ROOM);
        coordinator.joinRoom(SOCKET, 'room-1');
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockRoom.joinRoom).toHaveBeenCalled();
    });

    it('emits error to socket when joinRoom throws', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        mockRoom.joinRoom.mockImplementation(() => { throw new Error('Room not found'); });
        coordinator.joinRoom(SOCKET, 'bad-room');
        expect(mockWs.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { message: 'Room not found' });
    });
});

describe('getRooms', () => {
    it('emits roomList with all open rooms to the requesting socket', () => {
        const openRoom:   Room = { roomId: 'r1', ownerId: 'p0', playersId: ['p0'], isStarted: false };
        const startedRoom: Room = { roomId: 'r2', ownerId: 'p1', playersId: ['p1'], isStarted: true };
        mockRoom.listOpenRooms.mockReturnValue([openRoom, startedRoom]);
        coordinator.getRooms(SOCKET);
        const [, event, payload] = mockWs.emitToSocket.mock.calls[0];
        expect(event).toBe('roomList');
        expect(payload).toHaveLength(2);
    });
});

describe('quitRoom', () => {
    it('does nothing when session is not found', () => {
        mockSession.getSession.mockReturnValue(undefined);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
    });

    it('does nothing when session has no room', () => {
        mockSession.getSession.mockReturnValue(SESSION);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).not.toHaveBeenCalled();
    });

    it('quits room and notifies remaining player', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(ROOM);
        coordinator.quitRoom(SOCKET);
        expect(mockRoom.quitRoom).toHaveBeenCalledWith('p0');
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET, 'old-room');
        expect(mockWs.emitToRoom).toHaveBeenCalledWith('room-1', 'roomUpdated', expect.anything());
    });

    it('does not emit roomUpdated when the last player quits', () => {
        mockSession.getSession.mockReturnValue(SESSION_IN_ROOM);
        mockRoom.quitRoom.mockReturnValue(null);
        coordinator.quitRoom(SOCKET);
        expect(mockWs.leaveRoom).toHaveBeenCalled();
        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});
