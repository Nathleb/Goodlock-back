import { TEST_CATALOG_ID } from './helpers/catalog';
import { createCharacter } from "@domain/services/CharacterGeneration.service";
import { netStat } from "@domain/services/Character.service";
import Character from "@domain/types/Character.type";
import Die from "@domain/types/Die.type";
import Modifier from "@domain/types/Modifier.type";

const EMPTY_DIE = Array.from({ length: 6 }, () => ({ description: '', priority: 0, effects: [] })) as unknown as Die;
const base = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'C', maxHp: 20, baseSpeed: 1, baseDie: EMPTY_DIE, position: { playerIndex: 0, slot: 0 } });
const instance = (value: number, stat: Modifier['stat'] = 'POWER'): Modifier => ({ stat, value, roundsLeft: 2, appliedRound: 0 });
const withModifiers = (modifiers: readonly Modifier[]): Character => ({ ...base, modifiers });

describe('netStat', () => {
    it('is 0 for a character with no instance', () => {
        expect(netStat(base, 'POWER')).toBe(0);
    });

    it('sums the instances of the stat, opposite values cancelling', () => {
        expect(netStat(withModifiers([instance(3), instance(2), instance(-4)]), 'POWER')).toBe(1);
    });

    it('ignores instances of other stats', () => {
        const other = { ...instance(5), stat: 'ARMOR' } as unknown as Modifier;
        expect(netStat(withModifiers([instance(2), other]), 'POWER')).toBe(2);
    });

    it('is capped at +9', () => {
        expect(netStat(withModifiers([instance(6), instance(6)]), 'POWER')).toBe(9);
    });

    it('is capped at -9', () => {
        expect(netStat(withModifiers([instance(-6), instance(-6)]), 'POWER')).toBe(-9);
    });

    it('caps the sum, not each instance: an oversized instance is not trimmed before the opposite one cancels it', () => {
        expect(netStat(withModifiers([instance(15), instance(-3)]), 'POWER')).toBe(9);
        expect(netStat(withModifiers([instance(15), instance(-15)]), 'POWER')).toBe(0);
    });

    describe('ARMOR', () => {
        const armor = (value: number) => instance(value, 'ARMOR');

        it('sums only its own instances, whatever POWER holds', () => {
            const c = withModifiers([armor(3), armor(-1), instance(5)]);
            expect(netStat(c, 'ARMOR')).toBe(2);
            expect(netStat(c, 'POWER')).toBe(5);
        });

        it('is capped at +9 and -9 like any stat', () => {
            expect(netStat(withModifiers([armor(6), armor(6)]), 'ARMOR')).toBe(9);
            expect(netStat(withModifiers([armor(-6), armor(-6)]), 'ARMOR')).toBe(-9);
        });
    });
});
