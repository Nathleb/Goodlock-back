import { resolveTargets, validateEffectTargets } from "@domain/services/TargetResolution.service";
import Position from "@domain/types/Position.type";
import TargetGroup from "@domain/types/TargetGroup.type";
import { enemyAbs, allyAbs, enemyRel, allyRel } from "./helpers/targets";

const p0s2: Position = { playerIndex: 0, slot: 2 };
const p1s0: Position = { playerIndex: 1, slot: 0 };

describe('resolveTargets', () => {
    it('maps ALLY to the actor team and ENEMY to the other team', () => {
        expect(resolveTargets([allyAbs(3)], p0s2)).toEqual([{ playerIndex: 0, slot: 3 }]);
        expect(resolveTargets([enemyAbs(3)], p0s2)).toEqual([{ playerIndex: 1, slot: 3 }]);
        expect(resolveTargets([enemyAbs(3)], p1s0)).toEqual([{ playerIndex: 0, slot: 3 }]);
    });

    it('ABSOLUTE ignores the actor slot', () => {
        expect(resolveTargets([enemyAbs(0, 4)], p0s2)).toEqual([
            { playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 4 },
        ]);
    });

    it('RELATIVE adds the offset to the actor slot', () => {
        expect(resolveTargets([enemyRel(-1, 0, 1)], p0s2)).toEqual([
            { playerIndex: 1, slot: 1 }, { playerIndex: 1, slot: 2 }, { playerIndex: 1, slot: 3 },
        ]);
        expect(resolveTargets([allyRel(0)], p0s2)).toEqual([{ playerIndex: 0, slot: 2 }]);
    });

    it('drops relative cells outside the board', () => {
        expect(resolveTargets([enemyRel(-1, 0, 1)], p1s0)).toEqual([
            { playerIndex: 0, slot: 0 }, { playerIndex: 0, slot: 1 },
        ]);
    });

    it('returns [] when every cell is off the board (fizzle)', () => {
        expect(resolveTargets([allyRel(-1)], p1s0)).toEqual([]);
        expect(resolveTargets([], p1s0)).toEqual([]);
    });

    it('flattens several groups, mixing sides and modes, preserving order', () => {
        expect(resolveTargets([enemyAbs(0, 1, 2), allyRel(0)], p0s2)).toEqual([
            { playerIndex: 1, slot: 0 }, { playerIndex: 1, slot: 1 }, { playerIndex: 1, slot: 2 },
            { playerIndex: 0, slot: 2 },
        ]);
    });

    it('keeps a cell reached several times, once per occurrence', () => {
        expect(resolveTargets([enemyRel(0), enemyAbs(2)], p0s2)).toEqual([
            { playerIndex: 1, slot: 2 }, { playerIndex: 1, slot: 2 },
        ]);
        expect(resolveTargets([enemyAbs(1, 1)], p0s2)).toEqual([
            { playerIndex: 1, slot: 1 }, { playerIndex: 1, slot: 1 },
        ]);
    });
});

describe('validateEffectTargets', () => {
    it('accepts valid groups', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(0, 1, 2), allyRel(0)])).toEqual([]);
        expect(validateEffectTargets('Heal', [allyRel(-4, 4)])).toEqual([]);
    });

    it('rejects an empty target list', () => {
        expect(validateEffectTargets('Damage', [])).not.toEqual([]);
    });

    it('rejects a group with no numbers', () => {
        expect(validateEffectTargets('Damage', [enemyAbs()])).not.toEqual([]);
    });

    it('rejects non-integer numbers', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(1.5)])).not.toEqual([]);
    });

    it('rejects ABSOLUTE slots outside 0..4', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(5)])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [enemyAbs(-1)])).not.toEqual([]);
    });

    it('rejects RELATIVE offsets outside -4..4', () => {
        expect(validateEffectTargets('Damage', [enemyRel(5)])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [enemyRel(-5)])).not.toEqual([]);
    });

    it('rejects an unknown side or mode', () => {
        const badSide = { side: 'FOE', mode: 'ABSOLUTE', n: [0] } as unknown as TargetGroup;
        const badMode = { side: 'ENEMY', mode: 'NEAR', n: [0] } as unknown as TargetGroup;
        expect(validateEffectTargets('Damage', [badSide])).not.toEqual([]);
        expect(validateEffectTargets('Damage', [badMode])).not.toEqual([]);
    });

    it('accepts repeated cells (they stack)', () => {
        expect(validateEffectTargets('Damage', [enemyAbs(1, 1)])).toEqual([]);
        expect(validateEffectTargets('Damage', [enemyAbs(1), enemyAbs(1)])).toEqual([]);
    });

    it('Swap needs exactly 2 numbers on one side (modes may differ)', () => {
        expect(validateEffectTargets('Swap', [allyRel(0), allyAbs(0)])).toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(0, 1)])).toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(0)])).not.toEqual([]);
        expect(validateEffectTargets('Swap', [enemyRel(-1, 0, 1)])).not.toEqual([]);
        expect(validateEffectTargets('Swap', [allyRel(0), enemyRel(0)])).not.toEqual([]);
    });
});
