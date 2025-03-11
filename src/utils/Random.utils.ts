import Position from "src/types/Position.type";

/**
 * Rolls a 6-sided die and returns a value between 0 and 5.
 * @returns A random number between 0 and 5.
 */
export function roll1D6(): number {
    return roll1D(6);
}

/**
 * Rolls a random position for a character within a player's team.
 * @param playerIndex - The index of the player (0 or 1).
 * @returns A random position within the player's team.
 */
export function rollRandomPosition(playerIndex: 0 | 1): Position {
    return { playerIndex, characterIndex: roll1D(5) as 0 | 1 | 2 | 3 | 4 };
}

/**
 * Rolls a die with the specified number of sides and returns a value between 0 and size-1.
 * @param size - The number of sides on the die.
 * @returns A random number between 0 and size-1.
 */
export function roll1D(size: number): number {
    return Math.floor(Math.random() * size);
}