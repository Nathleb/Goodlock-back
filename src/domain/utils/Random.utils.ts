import CharacterIndex from "../types/CharacterIndex.type";
import PlayerIndex from "../types/PlayerIndex.type";
import Position from "../types/Position.type";

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
export function rollRandomPosition(playerIndex: PlayerIndex): Position {
    return { playerIndex, characterIndex: roll1D(5) as CharacterIndex };
}

/**
 * Rolls a random position for a character within a player's team.
 * @param playerIndex - The index of the player (0 or 1).
 * @returns A random position within the player's team.
 */
export function rollRandomPosition3(playerIndex: PlayerIndex): Position {
    return { playerIndex, characterIndex: roll1D(3) as CharacterIndex };
}

/**
 * Rolls a die with the specified number of sides and returns a value between 0 and size-1.
 * @param size - The number of sides on the die.
 * @returns A random number between 0 and size-1.
 */
export function roll1D(size: number): number {
    return Math.floor(Math.random() * size);
}