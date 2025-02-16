import Character from "src/types/Character.type";
import { isDead, rollForTurn, setCurrentTarget, toggleIsFaceLocked, rollDie } from "./Character.service";
import { Player } from "src/types/Player.type";
import Position from "src/types/Position.type";

/**
 * Toggles the die lock for a character at a given position.
 * @param player - The player whose character's die lock is to be toggled.
 * @param position - The position of the character.
 * @returns A new player object with the updated team.
 */
export function toggleDieLockForCharacter(player: Player, position: Position): Player {
    const newTeam = player.team.map((char, index) =>
        index === position.characterIndex ? toggleIsFaceLocked(char) : char
    );
    return { ...player, team: newTeam };
}

/**
 * Selects the current target of a character at a given position.
 * @param player - The player whose character's target is to be set.
 * @param position - The position of the character.
 * @param target - The target position to be set.
 * @returns A new player object with the updated team.
 */
export function selectCurrentTargetOfCharacter(player: Player, position: Position, target: Position): Player {
    const newTeam = player.team.map((char, index) =>
        index === position.characterIndex ? setCurrentTarget(char, target) : char
    );
    return { ...player, team: newTeam };
}

/**
 * Rolls dice for all characters in the player's team for the current turn.
 * @param player - The player whose team's dice are to be rolled.
 * @returns A new player object with the updated team.
 */
export function rollDiceForTurn(player: Player): Player {
    const newTeam = player.team.map(char => rollForTurn(char));
    return { ...player, team: newTeam };
}

/**
 * Checks if the player has lost the game.
 * @param player - The player to check.
 * @returns True if all characters in the player's team are dead, otherwise false.
 */
export function hasLost(player: Player): boolean {
    return player.team.every(char => isDead(char));
}

/**
 * Rolls the die for a character at a given position.
 * @param player - The player whose character's die is to be rolled.
 * @param position - The position of the character.
 * @returns A new player object with the updated team.
 */
export function rollDieFromPlayer(player: Player, position: Position): Player {
    const newTeam = player.team.map((char, index) =>
        index === position.characterIndex ? rollDie(char) : char
    );
    return { ...player, team: newTeam };
}