/**
 * Pure random utility functions.
 * Domain-specific random functions (like rollRandomPosition)
 * remain in the domain layer.
 */

/**
 * Rolls a die with the specified number of sides.
 * @param size - The number of sides on the die
 * @returns A random integer from 0 to size-1 (inclusive)
 */
export function roll1D(size: number): number {
  return Math.floor(Math.random() * size);
}

/**
 * Rolls a 6-sided die.
 * @returns A random integer from 0 to 5 (inclusive)
 */
export function roll1D6(): number {
  return roll1D(6);
}

/**
 * Generates a random integer within a range.
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns A random integer between min and max
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffles an array using Fisher-Yates algorithm.
 * Returns a new array without mutating the original.
 * @param array - The array to shuffle
 * @returns A new shuffled array
 */
export function shuffle<T>(array: ReadonlyArray<T>): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Picks a random element from an array.
 * @param array - The array to pick from
 * @returns A random element or undefined if array is empty
 */
export function pickRandom<T>(array: ReadonlyArray<T>): T | undefined {
  if (array.length === 0) return undefined;
  return array[roll1D(array.length)];
}
