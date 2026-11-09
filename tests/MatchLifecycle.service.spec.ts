import { P0, P1, asRoom } from './helpers/ids';
import { SocketId } from '@shared/branded.types';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { createGameState } from './helpers/gameState';
import { createPlayer } from '@domain/services/Player.service';
import { createClocks, setConnected } from '@domain/services/Clock.service';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { Room } from '@domain/types/Room.type';

const T0 = 1_000_000;
const SECOND = 1000;
const ROOM_ID = asRoom('room-1');
const SOCKET_0 = 'socket-0' as SocketId;
const SOCKET_1 = 'socket-1' as SocketId;

const mockRoom = { getRoom: jest.fn(), updateGameState: jest.fn(), closeRoom: jest.fn() };
const mockSession = { getSessionById: jest.fn(), setSessionRoom: jest.fn() };
const mockWs = { emitToRoom: jest.fn(), leaveRoom: jest.fn() };
const mockTimer = { schedule: jest.fn(), cancel: jest.fn() };

const keepGs = (): GameState => ({
    ...createGameState(createPlayer([], 0), createPlayer([], 1)),
    phase: GamePhase.KEEP,
    clocks: createClocks(),
    clockUpdatedAt: T0,
});
const roomOf = (gameState: GameState): Room => ({
    roomId: ROOM_ID, ownerId: P0, playersId: [P0, P1], isStarted: true, playerOrder: [P0, P1], gameState,
});

let lifecycle: MatchLifecycleService;

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    lifecycle = new MatchLifecycleService(mockRoom as never, mockSession as never, mockWs as never, mockTimer as never);
    mockSession.getSessionById.mockImplementation((id: string) => id === P0 ? { sessionId: P0, socketId: SOCKET_0 } : id === P1 ? { sessionId: P1, socketId: SOCKET_1 } : undefined);
    mockRoom.closeRoom.mockImplementation(() => roomOf(keepGs()));
});
afterEach(() => jest.useRealTimers());

describe('CLOCK-2: settled', () => {
    it('gives the game with its clocks charged up to now, without saving it', () => {
        const settled = lifecycle.settled(roomOf(keepGs()), T0 + 5 * SECOND);

        expect(settled?.clocks.map(c => c.remainingMs)).toEqual([595_000, 595_000]);
        expect(settled?.clockUpdatedAt).toBe(T0 + 5 * SECOND);
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });
});

describe('CLOCK-3, AWAY-3, END-3: a player who runs out of time loses at once', () => {
    it('ends the match instead of settling when a clock has run out, and answers null', () => {
        const gs = { ...keepGs(), clocks: [{ ...createClocks()[0], remainingMs: 3000 }, createClocks()[1]] as GameState['clocks'] };

        expect(lifecycle.settled(roomOf(gs), T0 + 10 * SECOND)).toBeNull();

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 1, reason: 'clock' });
    });

    it('says reconnection time when that is what ran out', () => {
        const away = setConnected({ ...keepGs(), playersReady: [true, true] }, 1, false, T0);

        expect(lifecycle.settled(roomOf(away), T0 + 181 * SECOND)).toBeNull();

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 0, reason: 'reconnection' });
    });

    it('expire ends the match when the moment has come, and says why', () => {
        const gs = { ...keepGs(), clocks: [createClocks()[0], { ...createClocks()[1], remainingMs: 4000 }] as GameState['clocks'] };
        mockRoom.getRoom.mockReturnValue(roomOf(gs));
        jest.setSystemTime(T0 + 4000);

        lifecycle.expire(ROOM_ID);

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 0, reason: 'clock' });
    });

    it('expire called too early waits for the real moment', () => {
        mockRoom.getRoom.mockReturnValue(roomOf(keepGs()));
        jest.setSystemTime(T0 + 1000);

        lifecycle.expire(ROOM_ID);

        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
        expect(mockTimer.schedule).toHaveBeenCalledWith(ROOM_ID, T0 + 600_000, expect.any(Function));
    });

    it('expire does nothing for a room that is gone or a match already decided', () => {
        mockRoom.getRoom.mockReturnValueOnce(undefined);
        lifecycle.expire(ROOM_ID);
        mockRoom.getRoom.mockReturnValueOnce(roomOf({ ...keepGs(), winner: 0, endReason: 'elimination' }));
        lifecycle.expire(ROOM_ID);

        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('END-1: settled leaves a decided match alone', () => {
    it('does not announce the result twice', () => {
        const decided = { ...keepGs(), winner: 0 as const, endReason: 'elimination' as const };

        expect(lifecycle.settled(roomOf(decided), T0 + 5 * SECOND)).not.toBeNull();

        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('ROOM-6: when the match ends, both players go back to the room browser', () => {
    it('announces the result, stops the timer, closes the room and takes both players out of it', () => {
        const order: string[] = [];
        mockWs.emitToRoom.mockImplementation((_r: string, event: string) => order.push(event));
        mockRoom.closeRoom.mockImplementation(() => { order.push('closeRoom'); return roomOf(keepGs()); });

        lifecycle.finish(ROOM_ID, { ...keepGs(), winner: 1, endReason: 'elimination' });

        expect(order).toEqual(['gameOver', 'closeRoom']);
        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 1, reason: 'elimination' });
        expect(mockTimer.cancel).toHaveBeenCalledWith(ROOM_ID);
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET_0, undefined);
        expect(mockSession.setSessionRoom).toHaveBeenCalledWith(SOCKET_1, undefined);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET_0, ROOM_ID);
        expect(mockWs.leaveRoom).toHaveBeenCalledWith(SOCKET_1, ROOM_ID);
    });

    it('skips a player whose session is gone', () => {
        mockSession.getSessionById.mockImplementation((id: string) => id === P0 ? { sessionId: P0, socketId: SOCKET_0 } : undefined);

        lifecycle.finish(ROOM_ID, { ...keepGs(), winner: 1, endReason: 'concede' });

        expect(mockWs.leaveRoom).toHaveBeenCalledTimes(1);
    });

    it('refuses to finish a match nobody has won, or that says nothing of why: that is a bug', () => {
        expect(() => lifecycle.finish(ROOM_ID, keepGs())).toThrow('no winner');
        expect(() => lifecycle.finish(ROOM_ID, { ...keepGs(), winner: 0 })).toThrow('no winner');
        expect(() => lifecycle.finish(ROOM_ID, { ...keepGs(), endReason: 'concede' })).toThrow('no winner');
    });
});

describe('AWAY-1: concede', () => {
    it.each([0, 1] as const)('player %i concedes: the other wins, by concession', (conceder) => {
        mockRoom.getRoom.mockReturnValue(roomOf(keepGs()));

        lifecycle.concede(ROOM_ID, conceder);

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 1 - conceder, reason: 'concede' });
        expect(mockRoom.closeRoom).toHaveBeenCalledWith(ROOM_ID);
    });

    it('does nothing once the match is decided, or for a room that is gone', () => {
        mockRoom.getRoom.mockReturnValueOnce(roomOf({ ...keepGs(), winner: 0, endReason: 'elimination' }));
        lifecycle.concede(ROOM_ID, 1);
        mockRoom.getRoom.mockReturnValueOnce(undefined);
        lifecycle.concede(ROOM_ID, 1);

        expect(mockWs.emitToRoom).not.toHaveBeenCalled();
    });
});

describe('AWAY-2: connectionChanged', () => {
    it('saves the game with the player disconnected, the clocks charged up to now, and answers their reconnection time', () => {
        mockRoom.getRoom.mockReturnValue(roomOf(keepGs()));

        const reconnectionMs = lifecycle.connectionChanged(ROOM_ID, 0, false, T0 + 5 * SECOND);

        expect(reconnectionMs).toBe(180_000);
        const saved: GameState = mockRoom.updateGameState.mock.calls[0][1];
        expect(saved.clocks[0]).toEqual({ remainingMs: 595_000, reconnectionMs: 180_000, connected: false, publishedMs: 600_000 });
        expect(mockTimer.schedule).toHaveBeenCalled();
    });

    it('charges what ran while the player was away when they come back', () => {
        const away = setConnected(keepGs(), 0, false, T0);
        mockRoom.getRoom.mockReturnValue(roomOf(away));

        const reconnectionMs = lifecycle.connectionChanged(ROOM_ID, 0, true, T0 + 20 * SECOND);

        expect(reconnectionMs).toBe(160_000);
        expect((mockRoom.updateGameState.mock.calls[0][1] as GameState).clocks[0].connected).toBe(true);
    });

    it('answers null, and ends the match, when the time had already run out', () => {
        const away = setConnected({ ...keepGs(), playersReady: [true, true] }, 0, false, T0);
        mockRoom.getRoom.mockReturnValue(roomOf(away));

        expect(lifecycle.connectionChanged(ROOM_ID, 0, true, T0 + 200 * SECOND)).toBeNull();

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 1, reason: 'reconnection' });
        expect(mockRoom.updateGameState).not.toHaveBeenCalled();
    });

    it('answers null for a room that is gone or has no game', () => {
        mockRoom.getRoom.mockReturnValueOnce(undefined);
        expect(lifecycle.connectionChanged(ROOM_ID, 0, false, T0)).toBeNull();
        mockRoom.getRoom.mockReturnValueOnce({ ...roomOf(keepGs()), gameState: undefined });
        expect(lifecycle.connectionChanged(ROOM_ID, 0, false, T0)).toBeNull();
    });
});

describe('CLOCK-3: schedule', () => {
    it('wakes the server up when the first clock runs out', () => {
        mockRoom.getRoom.mockReturnValue(roomOf(keepGs()));

        lifecycle.schedule(ROOM_ID);

        expect(mockTimer.schedule).toHaveBeenCalledWith(ROOM_ID, T0 + 600_000, expect.any(Function));
    });

    it('the wake-up ends the match', () => {
        mockRoom.getRoom.mockReturnValue(roomOf(keepGs()));
        lifecycle.schedule(ROOM_ID);
        const onExpire: () => void = mockTimer.schedule.mock.calls[0][2];
        jest.setSystemTime(T0 + 600_000);

        onExpire();

        expect(mockWs.emitToRoom).toHaveBeenCalledWith(ROOM_ID, 'gameOver', { winner: 1, reason: 'clock' });
    });

    it('cancels the timer when nothing runs', () => {
        mockRoom.getRoom.mockReturnValue(roomOf({ ...keepGs(), phase: GamePhase.ROLL }));

        lifecycle.schedule(ROOM_ID);

        expect(mockTimer.cancel).toHaveBeenCalledWith(ROOM_ID);
        expect(mockTimer.schedule).not.toHaveBeenCalled();
    });

    it('cancels the timer for a room that is gone', () => {
        mockRoom.getRoom.mockReturnValue(undefined);

        lifecycle.schedule(ROOM_ID);

        expect(mockTimer.cancel).toHaveBeenCalledWith(ROOM_ID);
    });
});
