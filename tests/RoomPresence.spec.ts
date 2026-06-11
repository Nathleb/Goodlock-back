import { createRoom, addPlayerToRoom, startRoom, resolvePlayerIndex, setPresenceInRoom } from '@domain/services/Room.service';
import GameState from '@domain/types/GameState.type';

const GS = {} as GameState; // startRoom stores it opaquely

function startedRoom() {
    return startRoom(addPlayerToRoom(createRoom('p0'), 'p1'), GS);
}

describe('startRoom presence & playerOrder', () => {
    it('snapshots playerOrder from playersId', () => {
        expect(startedRoom().playerOrder).toEqual(['p0', 'p1']);
    });

    it('initializes both players as connected', () => {
        expect(startedRoom().presence).toEqual([
            { connected: true, disconnectedAt: null },
            { connected: true, disconnectedAt: null },
        ]);
    });
});

describe('resolvePlayerIndex', () => {
    it('uses playerOrder for started rooms even after playersId changes', () => {
        const room = { ...startedRoom(), playersId: ['p1'] };
        expect(resolvePlayerIndex(room, 'p1')).toBe(1);
        expect(resolvePlayerIndex(room, 'p0')).toBe(0);
    });

    it('falls back to playersId for lobby rooms', () => {
        const room = addPlayerToRoom(createRoom('p0'), 'p1');
        expect(resolvePlayerIndex(room, 'p1')).toBe(1);
    });

    it('returns -1 for unknown ids', () => {
        expect(resolvePlayerIndex(startedRoom(), 'stranger')).toBe(-1);
    });
});

describe('setPresenceInRoom', () => {
    it('marks a player disconnected with timestamp', () => {
        const room = setPresenceInRoom(startedRoom(), 1, false, 5000);
        expect(room.presence![1]).toEqual({ connected: false, disconnectedAt: 5000 });
        expect(room.presence![0].connected).toBe(true);
    });

    it('clears disconnectedAt on reconnect', () => {
        const room = setPresenceInRoom(setPresenceInRoom(startedRoom(), 1, false, 5000), 1, true, 9000);
        expect(room.presence![1]).toEqual({ connected: true, disconnectedAt: null });
    });

    it('is a no-op on rooms without presence (lobby)', () => {
        const lobby = createRoom('p0');
        expect(setPresenceInRoom(lobby, 0, false, 5000)).toBe(lobby);
    });

    it('is a no-op for out-of-range player indices', () => {
        const room = startedRoom();
        expect(setPresenceInRoom(room, -1, false, 5000)).toBe(room);
        expect(setPresenceInRoom(room, 2, false, 5000)).toBe(room);
    });

    it('does not mutate the input room', () => {
        const room = startedRoom();
        setPresenceInRoom(room, 1, false, 5000);
        expect(room.presence![1]).toEqual({ connected: true, disconnectedAt: null });
    });
});
