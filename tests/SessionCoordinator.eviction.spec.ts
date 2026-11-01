import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { SocketId, UserId } from '@shared/branded.types';
import { unwrap } from './helpers/result';

// Real managers, mocked transport: the eviction story spans SessionManager, RoomManager and
// the coordinator, and only their combination shows what the evicted socket's disconnect does.
const OLD_SOCKET = 'phone-socket' as SocketId;
const NEW_SOCKET = 'tablet-socket' as SocketId;
const OPPONENT_SOCKET = 'opponent-socket' as SocketId;

const placement: GameState = {
    phase: GamePhase.PLACEMENT, currentRound: 1, initiativePlayerIndex: 0, rollsLeft: 2, playersReady: [false, false], priorityQueue: [],
    players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }],
};

function setUp() {
    const sessions = new SessionManager();
    const rooms = new RoomManager();
    const ws: jest.Mocked<WebSocketPort> = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };
    const coordinator = new SessionCoordinatorService(sessions, rooms, ws, { graceMs: 60_000, afkLimitMs: 120_000 });

    coordinator.handleConnect(OLD_SOCKET, 'player' as UserId);
    coordinator.handleConnect(OPPONENT_SOCKET, 'opponent' as UserId);
    const player = sessions.getSession(OLD_SOCKET)!;
    const opponent = sessions.getSession(OPPONENT_SOCKET)!;
    const room = rooms.createRoom(player.sessionId);
    unwrap(rooms.joinRoom(opponent.sessionId, room.roomId));
    unwrap(rooms.startGame(room.roomId, placement));
    sessions.setSessionRoom(OLD_SOCKET, room.roomId);
    sessions.setSessionRoom(OPPONENT_SOCKET, room.roomId);
    jest.clearAllMocks();
    return { sessions, rooms, ws, coordinator, roomId: room.roomId, sessionId: player.sessionId };
}

describe('a signed-in-elsewhere eviction during a match', () => {
    afterEach(() => jest.restoreAllMocks());

    it('kicks the old socket and keeps the player seated on the new one', () => {
        const { sessions, ws, coordinator, sessionId } = setUp();

        coordinator.handleConnect(NEW_SOCKET, 'player' as UserId);

        expect(ws.emitToSocket).toHaveBeenCalledWith(OLD_SOCKET, 'sessionEvicted', { reason: 'signed-in-elsewhere' });
        expect(ws.disconnectSocket).toHaveBeenCalledWith(OLD_SOCKET);
        expect(sessions.getSession(NEW_SOCKET)?.sessionId).toBe(sessionId);
    });

    it("the old socket's disconnect leaves the presence, the room and the new session untouched", () => {
        const { sessions, rooms, ws, coordinator, roomId, sessionId } = setUp();
        coordinator.handleConnect(NEW_SOCKET, 'player' as UserId);
        ws.emitToRoom.mockClear();

        coordinator.handleDisconnect(OLD_SOCKET);

        const room = rooms.getRoom(roomId)!;
        expect(room.presence?.[0]).toEqual(expect.objectContaining({ connected: true }));
        expect(room.playersId).toContain(sessionId);
        expect(sessions.getSession(NEW_SOCKET)).toEqual(expect.objectContaining({ sessionId, roomId }));
        expect(ws.emitToRoom).not.toHaveBeenCalled();
        expect(ws.leaveRoom).not.toHaveBeenCalled();
    });
});
