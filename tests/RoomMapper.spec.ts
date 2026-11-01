import { P0, P1, asRoom } from './helpers/ids';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { Room } from '@domain/types/Room.type';
import { CatalogId } from '@shared/branded.types';

describe('RoomMapper', () => {
    it("says who has chosen a deck, without revealing the deck", () => {
        const room: Room = {
            roomId: asRoom('r1'), ownerId: P0, playersId: [P0, P1], isStarted: false,
            deckSelections: { p0: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as CatalogId[] },
        };
        const dto = RoomMapper.toDTO(room);
        expect(dto.players).toEqual([
            { playerId: P0, isOwner: true, hasDeck: true },
            { playerId: P1, isOwner: false, hasDeck: false },
        ]);
        expect(JSON.stringify(dto)).not.toContain('"a"');
    });
});

describe('RoomMapper before any deck choice', () => {
    it('says nobody has a deck when the room has no selections yet', () => {
        const room: Room = { roomId: asRoom('r1'), ownerId: P0, playersId: [P0, P1], isStarted: false };
        expect(RoomMapper.toDTO(room).players.map(p => p.hasDeck)).toEqual([false, false]);
    });
});
