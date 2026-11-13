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
import GameState from '@domain/types/GameState.type';
import { beginKeepPhase } from '@domain/services/Phase.service';
import { createSelectionState } from '@domain/services/GameLoop.service';
import { testTemplate } from './helpers/catalog';
import { CatalogId } from '@shared/branded.types';
import { SocketId, UserId } from '@shared/branded.types';
import { unwrap } from './helpers/result';

// Real managers and coordinators, mocked transport: AWAY-4 is a story that spans the session, the room
// and the game, and only their combination shows what a missing player does to a phase.
const FIRST_SOCKET = 'phone-socket' as SocketId;
const BACK_SOCKET = 'phone-socket-after-the-drop' as SocketId;
const OPPONENT_SOCKET = 'opponent-socket' as SocketId;

const deck = (prefix: string) => Array.from({ length: 6 }, (_, i) => testTemplate(`${prefix}${i}`));
const PICKS: Record<0 | 1, CatalogId[]> = { 0: ['a0', 'a1', 'a2', 'a3'] as CatalogId[], 1: ['b0', 'b1', 'b2', 'b3'] as CatalogId[] };
const empty = () => createGameState(createPlayer([], 0), createPlayer([], 1));

// One row per phase where the players confirm: the state the match starts in, how a player confirms there,
// and what shows that the phase has ended once both have.
const PHASES = [
    {
        name: 'Selection', start: () => createSelectionState([deck('a'), deck('b')], Date.now()),
        confirm: (game: GameCoordinatorService, socket: SocketId, seat: 0 | 1) => game.confirmSelection(socket, PICKS[seat]),
        ended: (state: GameState) => state.phase === GamePhase.PLACEMENT,
    },
    {
        name: 'Placement', start: () => ({ ...empty(), phase: GamePhase.PLACEMENT }),
        confirm: (game: GameCoordinatorService, socket: SocketId) => game.confirmPlacement(socket),
        ended: (state: GameState) => state.phase === GamePhase.KEEP,
    },
    {
        name: 'Keep', start: () => beginKeepPhase(empty()),
        confirm: (game: GameCoordinatorService, socket: SocketId) => game.confirmKeep(socket, []),
        ended: (state: GameState) => state.rollsLeft === 1, // both confirmed: the next Roll was played
    },
];

function setUp(start: GameState) {
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
    unwrap(rooms.startGame(room.roomId, start));
    sessions.setSessionRoom(FIRST_SOCKET, room.roomId);
    sessions.setSessionRoom(OPPONENT_SOCKET, room.roomId);
    jest.clearAllMocks();
    return { ws, rooms, sessionCoordinator, game, roomId: room.roomId };
}

describe.each(PHASES)('AWAY-4: the $name phase waits for a disconnected player', ({ start, confirm, ended }) => {
    it('keeps waiting while the player is away, and the match goes on when they come back in time', () => {
        const { ws, rooms, sessionCoordinator, game, roomId } = setUp(start());
        const state = () => rooms.getRoom(roomId)!.gameState!;
        const phaseAtStart = state().phase;

        confirm(game, OPPONENT_SOCKET, 1);
        sessionCoordinator.handleDisconnect(FIRST_SOCKET);

        // The phase waits for the missing player: nothing moves, nobody has won.
        expect(ended(state())).toBe(false);
        expect(state().phase).toBe(phaseAtStart);
        expect(state().playersReady).toEqual([false, true]);
        expect(state().clocks[0].connected).toBe(false);
        expect(ws.emitToRoom).not.toHaveBeenCalledWith(roomId, 'gameOver', expect.anything());

        // The dropped connection can no longer confirm for them.
        confirm(game, FIRST_SOCKET, 0);
        expect(ws.emitToSocket).toHaveBeenCalledWith(FIRST_SOCKET, 'error', expect.objectContaining({ code: 'ACTION_NOT_AVAILABLE' }));
        expect(ended(state())).toBe(false);

        // Back in time on a new connection: same seat, and they can confirm, which ends the phase.
        sessionCoordinator.handleConnect(BACK_SOCKET, 'player' as UserId);
        expect(ws.emitToRoom).toHaveBeenCalledWith(roomId, 'presenceChanged', expect.objectContaining({ playerIndex: 0, connected: true }));
        expect(ws.emitToSocket).toHaveBeenCalledWith(BACK_SOCKET, 'gameStateUpdated', expect.objectContaining({ phase: phaseAtStart }));
        expect(state().clocks[0].connected).toBe(true);

        confirm(game, BACK_SOCKET, 0);

        expect(ended(state())).toBe(true);
    });
});
