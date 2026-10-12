import { CatalogMapper } from '@application/mappers/CatalogMapper';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CatalogId } from '@shared/branded.types';

const face = { description: 'hit', priority: 1, effects: [{ effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0, 1] }] }] };
const template = {
    id: 'hitter' as CatalogId, name: 'Hitter', maxHp: 12, baseSpeed: 7,
    baseDieInstructions: [face, face, face, face, face, face],
} as unknown as CharacterTemplate;

describe('CatalogMapper', () => {
    it('describes a catalog character with its full die and targeting', () => {
        const dto = CatalogMapper.toDTO(template);
        expect(dto).toEqual({
            id: 'hitter', name: 'Hitter', maxHp: 12, baseSpeed: 7,
            baseDie: Array(6).fill({ description: 'hit', priority: 1, effects: [{ effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0, 1] }] }] }),
        });
    });

    it('copies target cells instead of sharing the template arrays', () => {
        const dto = CatalogMapper.toDTO(template);
        expect(dto.baseDie[0].effects[0].targets[0].n).not.toBe(face.effects[0].targets[0].n);
    });
});
