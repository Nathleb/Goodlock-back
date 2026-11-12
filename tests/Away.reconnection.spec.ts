import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { MatchTimerPort } from '@application/ports/MatchTimerPort';
import { createGameState } from './helpers/gameState';
import { createPlayer } from '@domain/services/Player.service';
import GamePhase from '@domain/types/GamePhase.type';
import { SocketId, UserId } from '@shared/branded.types';
import { unwrap } from './helpers/result';

// Real managers and coordinators, mocked transport: AWAY-4 is a story that spans the session, the room
// and the game, and only their combination shows what a missing player does to a phase.
const FIRST_SOCKET = 'phone-socket' as SocketId;
const BACK_SOCKET = 'phone-socket-after-the-drop' as SocketId;
const OPPONENT_SOCKET = 'opponent-socket' as SocketId;

function setUp() {
    const sessions = new SessionManager();
    const rooms = new RoomManager();
    const ws: jest.Mocked<WebSocketPort> = { joinRoom: jest.fn(), leaveRoom: jest.fn(), emitToSocket: jest.fn(), emitToRoom: jest.fn(), disconnectSocket: jest.fn() };
    const timer: MatchTimerPort = { schedule: jest.fn(), cancel: jest.fn() };
    const lifecycle = new MatchLifecycleService(rooms, sessions, ws, timer);
    const sessionCoordinator = new SessionCoordinatorService(sessions, rooms, ws, lifecycle);
    const game = new GameCoordinatorService(sessions, rooms, ws, { get: jest.fn() } as never, lifecycle);

    sessionCoordinator.handleConnect(FIRST_SOCKET, 'player' as UserId);
    sessionCoordinator.handleConnect(OPPONENT_SOCKET, 'opponent' as UserId);
    const player = sessions.getSession(FIRST_SOCKET)!;
    const opponent = sessions.getSession(OPPONENT_SOCKET)!;
    const room = rooms.createRoom(player.sessionId);
    unwrap(rooms.joinRoom(opponent.sessionId, room.roomId));
    unwrap(rooms.startGame(room.roomId, { ...createGameState(createPlayer([], 0), createPlayer([], 1)), phase: GamePhase.PLACEMENT }));
    sessions.setSessionRoom(FIRST_SOCKET, room.roomId);
    sessions.setSessionRoom(OPPONENT_SOCKET, room.roomId);
    jest.clearAllMocks();
    return { ws, rooms, sessionCoordinator, game, roomId: room.roomId };
}

describe('AWAY-4: a phase that waits for a disconnected player does not end', () => {
    it('keeps waiting while the player is away, and the match goes on when they come back in time', () => {
        const { ws, rooms, sessionCoordinator, game, roomId } = setUp();
        const state = () => rooms.getRoom(roomId)!.gameState!;

        game.confirmPlacement(OPPONENT_SOCKET);
        sessionCoordinator.handleDisconnect(FIRST_SOCKET);

        // The phase waits for the missing player: nothing moves, nobody has won.
        expect(state().phase).toBe(GamePhase.PLACEMENT);
        expect(state().playersReady).toEqual([false, true]);
        expect(state().clocks[0].connected).toBe(false);
        expect(ws.emitToRoom).not.toHaveBeenCalledWith(roomId, 'gameOver', expect.anything());

        // The dropped connection can no longer confirm for them.
        game.confirmPlacement(FIRST_SOCKET);
        expect(ws.emitToSocket).toHaveBeenCalledWith(FIRST_SOCKET, 'error', expect.objectContaining({ code: 'ACTION_NOT_AVAILABLE' }));
        expect(state().phase).toBe(GamePhase.PLACEMENT);

        // Back in time on a new connection: same seat, and they can confirm, which ends the phase.
        sessionCoordinator.handleConnect(BACK_SOCKET, 'player' as UserId);
        expect(ws.emitToRoom).toHaveBeenCalledWith(roomId, 'presenceChanged', expect.objectContaining({ playerIndex: 0, connected: true }));
        expect(ws.emitToSocket).toHaveBeenCalledWith(BACK_SOCKET, 'gameStateUpdated', expect.objectContaining({ phase: GamePhase.PLACEMENT }));
        expect(state().clocks[0].connected).toBe(true);

        game.confirmPlacement(BACK_SOCKET);

        expect(state().phase).toBe(GamePhase.KEEP);
    });
});
