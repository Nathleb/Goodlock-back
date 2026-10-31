import { P0, P1, P2 } from './helpers/ids';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { CatalogId } from '@shared/branded.types';
import { unwrap, unwrapErr } from './helpers/result';

function gs(phase: GamePhase, rollsLeft: number): GameState {
    return { phase, currentRound: 1, initiativePlayerIndex: 0, rollsLeft, playersReady: [false, false], priorityQueue: [], players: [{ playerIndex: 0, team: [] }, { playerIndex: 1, team: [] }] };
}

function startedRoom(manager: RoomManager): string {
    const room = manager.createRoom(P0);
    unwrap(manager.joinRoom(P1, room.roomId));
    unwrap(manager.startGame(room.roomId, gs(GamePhase.PLACEMENT, 2)));
    return room.roomId;
}

afterEach(() => jest.restoreAllMocks());

describe('phaseStartedAt stamping', () => {
    it('stamps on startGame', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        expect(manager.getRoom(roomId)!.phaseStartedAt).toEqual(expect.any(Number));
    });

    it('re-stamps on phase change, not on same-phase same-rolls updates', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        jest.spyOn(Date, 'now').mockReturnValue(111_111);
        manager.updateGameState(roomId, gs(GamePhase.PLACEMENT, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).not.toBe(111_111);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(111_111);
    });

    it('re-stamps on rollsLeft change within KEEP (reroll sub-round)', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 2));
        jest.spyOn(Date, 'now').mockReturnValue(222_222);
        manager.updateGameState(roomId, gs(GamePhase.KEEP, 1));
        expect(manager.getRoom(roomId)!.phaseStartedAt).toBe(222_222);
    });

    it('ignores updateGameState for lobby rooms', () => {
        const manager = new RoomManager();
        const room = manager.createRoom(P0);
        manager.updateGameState(room.roomId, gs(GamePhase.KEEP, 2));
        expect(manager.getRoom(room.roomId)!.gameState).toBeUndefined();
        expect(manager.getRoom(room.roomId)!.phaseStartedAt).toBeUndefined();
    });
});

describe('setPresence', () => {
    it('updates presence and returns the updated room', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        const updated = manager.setPresence(roomId, 1, false, 5000);
        expect(updated!.presence![1]).toEqual({ connected: false, disconnectedAt: 5000 });
        expect(manager.getRoom(roomId)!.presence![1].connected).toBe(false);
    });

    it('returns undefined for unknown rooms', () => {
        expect(new RoomManager().setPresence('nope', 0, false, 0)).toBeUndefined();
    });
});

describe('sweepAbandonedRooms', () => {
    it('deletes started rooms where all players are disconnected past the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        manager.setPresence(roomId, 1, false, 2000);
        expect(manager.sweepAbandonedRooms(2000 + 600_000, 600_000)).toEqual([roomId]);
        expect(manager.getRoom(roomId)).toBeUndefined();
    });

    it('keeps rooms where any player is connected or within the threshold', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        expect(manager.sweepAbandonedRooms(700_000, 600_000)).toEqual([]);
        expect(manager.getRoom(roomId)).toBeDefined();
    });

    it('ignores lobby rooms (no presence)', () => {
        const manager = new RoomManager();
        manager.createRoom(P0);
        expect(manager.sweepAbandonedRooms(Number.MAX_SAFE_INTEGER, 0)).toEqual([]);
    });

    it('clears playerToRoom mappings for swept rooms', () => {
        const manager = new RoomManager();
        const roomId = startedRoom(manager);
        manager.setPresence(roomId, 0, false, 1000);
        manager.setPresence(roomId, 1, false, 2000);
        manager.sweepAbandonedRooms(2000 + 600_000, 600_000);
        // quitRoom resolves via playerToRoom; null proves the mapping is gone
        expect(manager.quitRoom(P0)).toBeNull();
    });
});

describe('joinRoom', () => {
    it('returns ROOM_NOT_FOUND for an unknown room', () => {
        expect(unwrapErr(new RoomManager().joinRoom(P1, 'nope')).code).toBe('ROOM_NOT_FOUND');
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
        expect(unwrapErr(new RoomManager().startGame('nope', gs(GamePhase.PLACEMENT, 2))).code).toBe('ROOM_NOT_FOUND');
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
        expect(unwrapErr(new RoomManager().setDeckSelection('nope', P0, SEVEN)).code).toBe('ROOM_NOT_FOUND');
    });
});
