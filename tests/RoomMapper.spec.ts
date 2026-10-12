import { RoomMapper } from '@application/mappers/RoomMapper';
import { Room } from '@domain/types/Room.type';
import { CatalogId } from '@shared/branded.types';

describe('RoomMapper', () => {
    it("says who has chosen a deck, without revealing the deck", () => {
        const room: Room = {
            roomId: 'r1', ownerId: 'p0', playersId: ['p0', 'p1'], isStarted: false,
            deckSelections: { p0: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as CatalogId[] },
        };
        const dto = RoomMapper.toDTO(room);
        expect(dto.players).toEqual([
            { playerId: 'p0', isOwner: true, hasDeck: true },
            { playerId: 'p1', isOwner: false, hasDeck: false },
        ]);
        expect(JSON.stringify(dto)).not.toContain('"a"');
    });
});
