import { P0, P1, asSession } from './helpers/ids';
import { createRoom, addPlayerToRoom, startRoom, resolvePlayerIndex } from '@domain/services/Room.service';
import { unwrap } from './helpers/result';
import GameState from '@domain/types/GameState.type';

const GS = {} as GameState; // startRoom stores it opaquely

function startedRoom() {
    return unwrap(startRoom(unwrap(addPlayerToRoom(createRoom(P0), P1)), GS));
}

describe('startRoom playerOrder', () => {
    it('snapshots playerOrder from playersId', () => {
        expect(startedRoom().playerOrder).toEqual([P0, P1]);
    });
});

describe('resolvePlayerIndex', () => {
    it('uses playerOrder for started rooms even after playersId changes', () => {
        const room = { ...startedRoom(), playersId: [P1] };
        expect(resolvePlayerIndex(room, P1)).toBe(1);
        expect(resolvePlayerIndex(room, P0)).toBe(0);
    });

    it('falls back to playersId for lobby rooms', () => {
        const room = unwrap(addPlayerToRoom(createRoom(P0), P1));
        expect(resolvePlayerIndex(room, P1)).toBe(1);
    });

    it('returns -1 for unknown ids', () => {
        expect(resolvePlayerIndex(startedRoom(), asSession('stranger'))).toBe(-1);
    });
});
