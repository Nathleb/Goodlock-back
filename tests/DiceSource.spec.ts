import { RandomDiceSource } from '@infrastructure/adapters/dice/RandomDiceSource';
import { SeededDiceSource } from '@infrastructure/adapters/dice/SeededDiceSource';
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

afterEach(() => jest.restoreAllMocks());

describe('RandomDiceSource', () => {
    it.each([
        [0, 0],
        [0.5, 3],
        [0.999, 5],
    ])('maps Math.random() = %p to face index %p on a d6', (random, index) => {
        jest.spyOn(Math, 'random').mockReturnValue(random);
        expect(new RandomDiceSource().roll(6)).toBe(index);
    });

    it('draws within the size it is given', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.999);
        expect(new RandomDiceSource().roll(2)).toBe(1);
    });
});

describe('SeededDiceSource', () => {
    const draw = (source: SeededDiceSource, n: number) => Array.from({ length: n }, () => source.roll(6));

    it('replays the same draws for the same seed', () => {
        expect(draw(new SeededDiceSource(42), 50)).toEqual(draw(new SeededDiceSource(42), 50));
    });

    it('draws other values for another seed', () => {
        expect(draw(new SeededDiceSource(1), 50)).not.toEqual(draw(new SeededDiceSource(2), 50));
    });

    it('stays within the size it is given and reaches every index', () => {
        const seen = new Set<number>();
        const source = new SeededDiceSource(7);
        for (let i = 0; i < 500; i++) {
            const value = source.roll(6);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(6);
            seen.add(value);
        }
        expect(seen.size).toBe(6);
    });

    it('refuses a seed that is not an integer', () => {
        expect(() => new SeededDiceSource(NaN)).toThrow('seed must be an integer');
        expect(() => new SeededDiceSource(1.5)).toThrow('seed must be an integer');
    });

    it('does not mix the draws of two sources', () => {
        const a = new SeededDiceSource(9);
        const b = new SeededDiceSource(9);
        a.roll(6);
        expect(b.roll(6)).toBe(new SeededDiceSource(9).roll(6));
    });
});

describe('ScriptedDiceSource', () => {
    it('returns the scripted indices in order', () => {
        const source = new ScriptedDiceSource([3, 0, 5]);
        expect([source.roll(6), source.roll(6), source.roll(6)]).toEqual([3, 0, 5]);
    });

    it('refuses a draw once the script is used up', () => {
        const source = new ScriptedDiceSource([1]);
        source.roll(6);
        expect(() => source.roll(6)).toThrow('script is used up');
    });

    it('refuses a scripted index outside the size drawn', () => {
        expect(() => new ScriptedDiceSource([6]).roll(6)).toThrow('outside 0..5');
        expect(() => new ScriptedDiceSource([2]).roll(2)).toThrow('outside 0..1');
        expect(() => new ScriptedDiceSource([-1]).roll(6)).toThrow('outside 0..5');
        expect(() => new ScriptedDiceSource([1.5]).roll(6)).toThrow('outside 0..5');
    });

    it('always() repeats one index, or the last one of whatever size is drawn', () => {
        const fixed = ScriptedDiceSource.always(2);
        expect([fixed.roll(6), fixed.roll(6), fixed.roll(2 + 1)]).toEqual([2, 2, 2]);
        const last = ScriptedDiceSource.always('last');
        expect([last.roll(6), last.roll(2)]).toEqual([5, 1]);
    });

    it('always() still refuses an index outside the size drawn', () => {
        expect(() => ScriptedDiceSource.always(4).roll(2)).toThrow('outside 0..1');
    });

    it('draws the fallback every time once a non-empty script is used up', () => {
        const source = new ScriptedDiceSource([1], 3);
        expect([source.roll(6), source.roll(6), source.roll(6)]).toEqual([1, 3, 3]);
    });

    it('records the size of every draw', () => {
        const source = ScriptedDiceSource.always(0);
        source.roll(6);
        source.roll(2);
        expect(source.sizes).toEqual([6, 2]);
    });
});
