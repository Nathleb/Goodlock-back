import Character from "../types/Character.type";
import { Player } from "../types/Player.type";

/**
 * Applies an effect to the targeted characters.
 * @param players - The players in the game.
 * @param targetedCharacters - The characters to apply the effect to.
 * @param effectCallback - The callback function to apply the effect.
 * @returns The updated players.
 */
export function applyEffectToTargets(players: [Player, Player], targetedCharacters: Character[], effectCallback: (character: Character) => Character): [Player, Player] {
    const targetedCharacterIds = new Set(targetedCharacters.map(character => character.id));

    return players.map((player) => {
        const updatedTeam = player.team.map((character) => {
            if (targetedCharacterIds.has(character.id)) {
                return effectCallback(character);
            }
            return character;
        });
        return { ...player, team: updatedTeam };
    }) as [Player, Player];
}
