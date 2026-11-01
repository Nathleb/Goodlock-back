import { TEST_CATALOG_ID } from './helpers/catalog';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { rollDie } from '@domain/services/Character.service';

afterEach(() => jest.restoreAllMocks());

describe('rollDie', () => {
    it('shows the face the roll lands on', () => {
        const faces = generateFullDie(Array.from({ length: 6 }, (_, i) => ({ description: `face ${i}`, priority: 0, effects: [] })) as unknown as BaseDieInstructions);
        const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 10, baseSpeed: 1, baseDie: faces, position: { playerIndex: 0, slot: 0 } });
        jest.spyOn(Math, 'random').mockReturnValue(0.99);

        expect(rollDie(character).face.description).toBe('face 5');
    });
});
