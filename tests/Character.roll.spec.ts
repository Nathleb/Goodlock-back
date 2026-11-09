import { TEST_CATALOG_ID } from './helpers/catalog';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { rollDie, rollForTurn } from '@domain/services/Character.service';

afterEach(() => jest.restoreAllMocks());

describe('rollDie', () => {
    it('shows the face the roll lands on', () => {
        const faces = generateFullDie(Array.from({ length: 6 }, (_, i) => ({ description: `face ${i}`, priority: 0, effects: [] })) as unknown as BaseDieInstructions);
        const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 10, baseSpeed: 1, baseDie: faces, position: { playerIndex: 0, slot: 0 } });
        jest.spyOn(Math, 'random').mockReturnValue(0.99);

        expect(rollDie(character).face.description).toBe('face 5');
    });
});

describe('rollForTurn', () => {
    const faces = generateFullDie(Array.from({ length: 6 }, (_, i) => ({ description: `face ${i}`, priority: 0, effects: [] })) as unknown as BaseDieInstructions);
    const make = (isFaceLocked: boolean, keptAtLastRoll: boolean) => ({
        ...createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 10, baseSpeed: 1, baseDie: faces, position: { playerIndex: 0, slot: 0 } }),
        isFaceLocked,
        keptAtLastRoll,
    });

    it('ROLL-2: remembers that the die was kept at this Roll, and keeps its face', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.99);
        const rolled = rollForTurn(make(true, false));
        expect(rolled.keptAtLastRoll).toBe(true);
        expect(rolled.face.description).toBe('face 0');
    });

    it('ROLL-2, KEEP-1: a die kept at the previous Roll then released is remembered as rolled', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.99);
        const rolled = rollForTurn(make(false, true));
        expect(rolled.keptAtLastRoll).toBe(false);
        expect(rolled.face.description).toBe('face 5');
    });
});
