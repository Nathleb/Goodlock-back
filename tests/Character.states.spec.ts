import { TEST_CATALOG_ID } from './helpers/catalog';
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { stateValue } from "@domain/services/Character.service";
import { STATE_AXES, STATE_DEFS, STATE_NAMES } from "@domain/types/State.type";
import Die from "@domain/types/Die.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const base = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: 0, slot: 0 } });

describe('states', () => {
    it('a new character has no state', () => {
        expect(base.states).toEqual({});
        for (const axis of STATE_AXES) expect(stateValue(base, axis)).toBe(0);
    });

    it('stateValue reads the signed counter of an axis', () => {
        const c = { ...base, states: { SPEED: { value: -2, touchedRound: 1 }, STUN: { value: 1, touchedRound: 1 } } };
        expect(stateValue(c, 'SPEED')).toBe(-2);
        expect(stateValue(c, 'STUN')).toBe(1);
        expect(stateValue(c, 'ROOT')).toBe(0);
    });

    it('maps every state to its axis and direction', () => {
        expect(STATE_DEFS).toEqual({
            HASTE: { axis: 'SPEED', sign: 1 }, SLOW: { axis: 'SPEED', sign: -1 },
            REGEN: { axis: 'VITALITY', sign: 1 }, POISON: { axis: 'VITALITY', sign: -1 },
            STUN: { axis: 'STUN', sign: 1 }, ROOT: { axis: 'ROOT', sign: 1 },
            DIVINE_SHIELD: { axis: 'DIVINE_SHIELD', sign: 1 },
        });
        expect([...STATE_NAMES].sort()).toEqual(['DIVINE_SHIELD', 'HASTE', 'POISON', 'REGEN', 'ROOT', 'SLOW', 'STUN']);
    });
});
