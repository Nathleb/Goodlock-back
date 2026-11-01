import { DeckMapper } from '@application/mappers/DeckMapper';
import { CatalogId, DeckId, UserId } from '@shared/branded.types';

describe('DeckMapper', () => {
    it('sends the deck with its characters in order and ISO dates', () => {
        const ids = ['c2', 'c0', 'c1', 'c3', 'c5', 'c4'] as CatalogId[];
        const dto = DeckMapper.toDTO({
            id: 'd1' as DeckId, userId: 'alice' as UserId, name: 'Aggro', characterIds: ids,
            createdAt: new Date('2026-11-01T10:00:00Z'), updatedAt: new Date('2026-11-01T11:00:00Z'),
        });
        expect(dto).toEqual({ id: 'd1', name: 'Aggro', characterIds: ids, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T11:00:00.000Z' });
        expect(dto.characterIds).not.toBe(ids);
    });
});
