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

    it('carries stat and duration on an ApplyStat effect, and nothing extra on others', () => {
        const buffFace = { description: 'buff', priority: 0, effects: [
            { effect: 'ApplyStat', stat: 'POWER', magnitude: -3, duration: 2, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] },
            { effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] },
        ] };
        const buffer = { ...template, baseDieInstructions: [buffFace, buffFace, buffFace, buffFace, buffFace, buffFace] } as unknown as CharacterTemplate;

        const effects = CatalogMapper.toDTO(buffer).baseDie[0].effects;

        expect(effects[0]).toMatchObject({ effect: 'ApplyStat', magnitude: -3, stat: 'POWER', duration: 2 });
        expect('stat' in effects[1]).toBe(false);
        expect('duration' in effects[1]).toBe(false);
    });

    it('describes an ApplyState effect with its state and duration, magnitude 0', () => {
        const stunFace = { description: 'stun', priority: 0, effects: [
            { effect: 'ApplyState', state: 'STUN', duration: 1, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] },
        ] };
        const stunner = { ...template, baseDieInstructions: [stunFace, stunFace, stunFace, stunFace, stunFace, stunFace] } as unknown as CharacterTemplate;

        const [effect] = CatalogMapper.toDTO(stunner).baseDie[0].effects;

        expect(effect).toMatchObject({ effect: 'ApplyState', magnitude: 0, state: 'STUN', duration: 1 });
        expect('stat' in effect).toBe(false);
    });
});

describe('CatalogMapper without targets', () => {
    it('describes an effect with no target groups as an empty list', () => {
        const bare = { ...template, baseDieInstructions: Array(6).fill({ description: 'wait', priority: 0, effects: [{ effect: 'Shield', magnitude: 1 }] }) } as unknown as CharacterTemplate;
        expect(CatalogMapper.toDTO(bare).baseDie[0].effects[0].targets).toEqual([]);
    });
});
