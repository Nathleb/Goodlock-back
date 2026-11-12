import { RoomId } from '@shared/branded.types';
import { createClocks } from '@domain/services/Clock.service';
import { P0, P1, P2, asRoom, asSession } from './helpers/ids';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { CatalogId } from '@shared/branded.types';
import { unwrap, unwrapErr } from './helpers/result';

function gs(phase: GamePhase, rollsLeft: number): GameState {
    return { phase, currentRound: 1, initiativePlayerIndex: 0, rollsLeft, playersReady: [false, false], priorityQueue: [], clocks: createClocks(), clockUpdatedAt: 0, players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

function startedRoom(manager: RoomManager): RoomId {
    const room = manager.createRoom(P0);
    unwrap(manager.joinRoom(P1, room.roomId));
    unwrap(manager.startGame(room.roomId, gs(GamePhase.PLACEMENT, 2)));
    return room.roomId;
}

afterEach(() => jest.restoreAllMocks());

describe('updateGameState', () => {
    it('ignores lobby rooms', () => {
        const manager = new RoomManager();
        const room = manager.createRoom(P0);
        manager.updateGameState(room.roomId, gs(GamePhase.KEEP, 2));
        expect(manager.getRoom(room.roomId)!.gameState).toBeUndefined();
    });

    it('replaces the game of a started room', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 1));
        expect(manager.getRoom(roomId)!.gameState?.phase).toBe(GamePhase.KEEP);
    });
});

describe('joinRoom', () => {
    it('returns ROOM_NOT_FOUND for an unknown room', () => {
        expect(unwrapErr(new RoomManager().joinRoom(P1, asRoom('nope'))).code).toBe('ROOM_NOT_FOUND');
    });

    it('refuses a third player and does not register him in the room', () => {
        const manager = new RoomManager();
        const room = manager.createRoom(P0);
        unwrap(manager.joinRoom(P1, room.roomId));

        expect(unwrapErr(manager.joinRoom(P2, room.roomId)).code).toBe('ROOM_FULL');

        expect(manager.getRoom(room.roomId)!.playersId).toEqual([P0, P1]);
        expect(manager.quitRoom(P2)).toBeNull(); // p2 was never mapped to the room
    });
});

describe('startGame', () => {
    it('returns ROOM_NOT_FOUND for an unknown room', () => {
        expect(unwrapErr(new RoomManager().startGame(asRoom('nope'), gs(GamePhase.PLACEMENT, 2))).code).toBe('ROOM_NOT_FOUND');
    });

    it('refuses to start a room that is not ready and leaves it unstarted', () => {
        const manager = new RoomManager();
        const room = manager.createRoom(P0);

        expect(unwrapErr(manager.startGame(room.roomId, gs(GamePhase.PLACEMENT, 2))).code).toBe('ROOM_NOT_READY');

        expect(manager.getRoom(room.roomId)!.isStarted).toBe(false);
    });
});

describe('setDeckSelection', () => {
    const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as CatalogId[];

    it('stores the snapshot on the room and returns the updated room', () => {
        const manager = new RoomManager();
        const room = manager.createRoom(P0);
        const updated = unwrap(manager.setDeckSelection(room.roomId, P0, SEVEN));
        expect(updated.deckSelections).toEqual({ p0: SEVEN });
        expect(manager.getRoom(room.roomId)!.deckSelections).toEqual({ p0: SEVEN });
    });

    it('returns a ROOM_NOT_FOUND error for an unknown room', () => {
        expect(unwrapErr(new RoomManager().setDeckSelection(asRoom('nope'), P0, SEVEN)).code).toBe('ROOM_NOT_FOUND');
    });
});

describe('listOpenRooms', () => {
    it('ROOM-1: lists a room not started with a free seat, leaves out a full lobby room and a started room, even one a player left', () => {
        const manager = new RoomManager();
        const open = manager.createRoom(P2);
        const full = manager.createRoom(asSession('p3'));
        unwrap(manager.joinRoom(asSession('p4'), full.roomId));
        const started = startedRoom(manager);
        manager.quitRoom(P1);
        expect(manager.getRoom(started)!.playersId).toEqual([P0]);

        expect(manager.listOpenRooms().map(r => r.roomId)).toEqual([open.roomId]);
    });
});

describe('ROOM-6: closeRoom', () => {
    it('removes the room and returns it', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);

        const closed = manager.closeRoom(roomId);

        expect(closed?.roomId).toBe(roomId);
        expect(manager.getRoom(roomId)).toBeUndefined();
        expect(manager.listOpenRooms()).toEqual([]);
    });

    it('leaves the other rooms alone', () => {
        const manager = new RoomManager();
        const closing = startedRoom(manager);
        const other = manager.createRoom(P2);

        manager.closeRoom(closing);

        expect(manager.getRoom(other.roomId)).toBeDefined();
    });

    it('answers undefined for an unknown room', () => {
        expect(new RoomManager().closeRoom(asRoom('nope'))).toBeUndefined();
    });
});
