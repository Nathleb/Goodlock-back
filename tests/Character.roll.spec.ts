import { TEST_CATALOG_ID } from './helpers/catalog';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { rollDie, rollForTurn } from '@domain/services/Character.service';
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

describe('rollDie', () => {
    it('shows the face the roll lands on', () => {
        const faces = generateFullDie(Array.from({ length: 6 }, (_, i) => ({ description: `face ${i}`, priority: 0, effects: [] })) as unknown as BaseDieInstructions);
        const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 10, baseSpeed: 1, baseDie: faces, position: { playerIndex: 0, slot: 0 } });
        expect(rollDie(character, ScriptedDiceSource.always('last')).face.description).toBe('face 5');
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
        const rolled = rollForTurn(make(true, false), ScriptedDiceSource.always('last'));
        expect(rolled.keptAtLastRoll).toBe(true);
        expect(rolled.face.description).toBe('face 0');
    });

    it('ROLL-2, KEEP-1: a die kept at the previous Roll then released is remembered as rolled', () => {
        const rolled = rollForTurn(make(false, true), ScriptedDiceSource.always('last'));
        expect(rolled.keptAtLastRoll).toBe(false);
        expect(rolled.face.description).toBe('face 5');
    });
});

describe('faceIndex: the index of the current face in the die, since a die can hold identical faces', () => {
    const faces = generateFullDie(Array.from({ length: 6 }, (_, i) => ({ description: `face ${i}`, priority: 0, effects: [] })) as unknown as BaseDieInstructions);
    const make = (die = faces) => createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 10, baseSpeed: 1, baseDie: die, position: { playerIndex: 0, slot: 0 } });

    it('starts on face 0', () => {
        const character = make();
        expect(character.faceIndex).toBe(0);
        expect(character.face).toBe(character.baseDie[0]);
    });

    it('is the index of the face the roll lands on', () => {
        const rolled = rollDie(make(), new ScriptedDiceSource([4]));
        expect(rolled.faceIndex).toBe(4);
        expect(rolled.baseDie[rolled.faceIndex]).toBe(rolled.face);
    });

    it('a rolled face identical to an earlier one keeps its own index', () => {
        const twin = faces[0];
        const die = [twin, twin, faces[2], faces[3], faces[4], faces[5]] as typeof faces;
        const rolled = rollDie(make(die), new ScriptedDiceSource([1]));
        expect(rolled.faceIndex).toBe(1);
        expect(rolled.face).toBe(twin);
    });

    it('rolls with a single draw', () => {
        const dice = new ScriptedDiceSource([2]);
        rollDie(make(), dice);
        expect(dice.sizes).toEqual([6]);
    });

    it('a kept die keeps its index', () => {
        const rolled = rollForTurn({ ...rollDie(make(), new ScriptedDiceSource([5])), isFaceLocked: true }, ScriptedDiceSource.always(0));
        expect(rolled.faceIndex).toBe(5);
    });
});
