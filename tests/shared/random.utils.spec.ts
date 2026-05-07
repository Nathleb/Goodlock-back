import {
  roll1D,
  roll1D6,
  randomInt,
  shuffle,
  pickRandom,
} from '@shared/utils/random.utils';

describe('Random Utils', () => {
  describe('roll1D()', () => {
    it('should return values within range [0, size-1]', () => {
      const size = 10;
      for (let i = 0; i < 100; i++) {
        const result = roll1D(size);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(size);
      }
    });

    it('should return integers', () => {
      for (let i = 0; i < 100; i++) {
        const result = roll1D(6);
        expect(Number.isInteger(result)).toBe(true);
      }
    });
  });

  describe('roll1D6()', () => {
    it('should return values within range [0, 5]', () => {
      for (let i = 0; i < 100; i++) {
        const result = roll1D6();
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('randomInt()', () => {
    it('should return values within the specified range (inclusive)', () => {
      const min = 5;
      const max = 15;
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max);
        expect(result).toBeGreaterThanOrEqual(min);
        expect(result).toBeLessThanOrEqual(max);
      }
    });

    it('should return integers', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomInt(1, 100);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should handle min equal to max', () => {
      const result = randomInt(5, 5);
      expect(result).toBe(5);
    });
  });

  describe('shuffle()', () => {
    it('should return a new array', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle(original);
      expect(shuffled).not.toBe(original);
    });

    it('should not mutate the original array', () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      shuffle(original);
      expect(original).toEqual(copy);
    });

    it('should contain the same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle(original);
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should handle empty arrays', () => {
      const result = shuffle([]);
      expect(result).toEqual([]);
    });

    it('should handle single-element arrays', () => {
      const result = shuffle([1]);
      expect(result).toEqual([1]);
    });
  });

  describe('pickRandom()', () => {
    it('should return an element from the array', () => {
      const array = [1, 2, 3, 4, 5];
      for (let i = 0; i < 100; i++) {
        const result = pickRandom(array);
        expect(array).toContain(result);
      }
    });

    it('should return undefined for empty arrays', () => {
      const result = pickRandom([]);
      expect(result).toBeUndefined();
    });

    it('should return the only element for single-element arrays', () => {
      const result = pickRandom([42]);
      expect(result).toBe(42);
    });
  });
});
