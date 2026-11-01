import { resolveTargets, validateEffectTargets, validateStatParams, validateStateParams } from "@domain/services/TargetResolution.service";
import { STAT_NAMES } from "@domain/types/Modifier.type";
import { STATE_NAMES } from "@domain/types/State.type";
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

describe('resolveTargets — upper edge', () => {
    it('drops relative cells past the last slot', () => {
        expect(resolveTargets([enemyRel(0, 1)], { playerIndex: 0, slot: 4 })).toEqual([{ playerIndex: 1, slot: 4 }]);
    });
});

// These messages are what a template author reads when a bad catalog stops the boot.
describe('validation messages', () => {
    it('names every problem of the target groups', () => {
        const bad = [
            { side: 'FOE', mode: 'NEAR', n: [0] },
            { side: 'ENEMY', mode: 'ABSOLUTE', n: [] },
            { side: 'ENEMY', mode: 'ABSOLUTE', n: [1.5, 5] },
            { side: 'ALLY', mode: 'RELATIVE', n: [-5] },
        ] as unknown as TargetGroup[];

        expect(validateEffectTargets('Damage', bad)).toEqual([
            'group 0: side must be ALLY or ENEMY',
            'group 0: mode must be ABSOLUTE or RELATIVE',
            'group 1: n must be a non-empty array',
            'group 2: 1.5 is not an integer',
            'group 2: 5 is outside 0..4',
            'group 3: -5 is outside -4..4',
        ]);
        expect(validateEffectTargets('Damage', [])).toEqual(['targets must be a non-empty array']);
    });

    it('names the Swap problems', () => {
        expect(validateEffectTargets('Swap', [allyRel(0), enemyRel(0, 1)])).toEqual([
            'Swap needs exactly 2 cells, got 3',
            'Swap cells must all be on the same side',
        ]);
    });

    it('names every problem of an ApplyStat entry', () => {
        expect(validateStatParams({ stat: 'LUCK', magnitude: 0, duration: 0 })).toEqual([
            `stat must be one of ${STAT_NAMES.join(', ')}`,
            'magnitude must be a non-zero integer',
            'duration must be an integer >= 1',
        ]);
    });

    it('names every problem of an ApplyState entry', () => {
        expect(validateStateParams({ state: 'ASLEEP', duration: 0, magnitude: 2, stat: 'POWER' })).toEqual([
            'a state has no magnitude',
            'a state has no stat',
            `state must be one of ${STATE_NAMES.join(', ')}`,
            'duration must be an integer >= 1',
        ]);
    });

    it('accepts a duration of exactly one round', () => {
        expect(validateStatParams({ stat: STAT_NAMES[0], magnitude: 1, duration: 1 })).toEqual([]);
        expect(validateStateParams({ state: STATE_NAMES[0], duration: 1 })).toEqual([]);
    });
});
