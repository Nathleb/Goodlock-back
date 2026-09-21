import { resolveTargets } from "@domain/services/TargetResolution.service";
import Position from "@domain/types/Position.type";
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
