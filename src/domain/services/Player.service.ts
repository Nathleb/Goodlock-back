import Character from "../types/Character.type";
import { isDead, rollForTurn, setTarget, toggleIsFaceLocked, rollDie } from "./Character.service";
import { Player } from "../types/Player.type";
import Position from "../types/Position.type";
import CharacterIndex from "../types/CharacterIndex.type";
import PlayerIndex from "../types/PlayerIndex.type";

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
 * Selects the target of a character at a given position.
 * @param player - The player whose character's target is to be set.
 * @param characterIndex - The index of the character in the player's team.
 * @param target - The target position to be set.
 * @returns A new player object with the updated team.
 */
export function selectTargetOfCharacter(player: Player, characterIndex: CharacterIndex, target: Position): Player {
    const newTeam = player.team.map((char) =>
        char.position.characterIndex === characterIndex ? setTarget(char, target) : char
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
 * Unlock dice of all characters in the player's team.
 * @param player - The player whose team's dice are unlocked.
 * @returns A new player object with the updated team.
 */
export function unlockAllDice(player: Player): Player {
    const newTeam = player.team.map(char => char.isFaceLocked ? toggleIsFaceLocked(char) : char);
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

/**
 * Creates a player with the specified team.
 * @param team - The team of characters.
 * @returns A new player object.
 */
export function createPlayer(team: Character[], playerIndex: PlayerIndex): Player {
    team = team.map((char, index) => ({ ...char, position: { playerIndex, characterIndex: index }, face: char.baseDie[0] }));

    return {
        playerIndex,
        team
    };
}