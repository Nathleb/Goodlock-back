import Character from "../types/Character.type";
import { Player } from "../types/Player.type";
import GameState from "../types/GameState.type";
import Position, { PlayerIndex } from "../types/Position.type";
import { CharacterId } from "@shared/branded.types";

/**
 * Applies an effect to the targeted characters.
 * @param players - The players in the game.
 * @param targetedCharacters - The characters to apply the effect to.
 * @param effectCallback - The callback function to apply the effect.
 * @returns The updated players.
 */
function applyEffectToTargets(players: readonly [Player, Player], targetedCharacters: Character[], effectCallback: (character: Character) => Character): readonly [Player, Player] {
    const targetedCharacterIds = new Set(targetedCharacters.map(character => character.id));

    return players.map((player) => {
        const updatedTeam = player.team.map((character) => {
            if (targetedCharacterIds.has(character.id)) {
                return effectCallback(character);
            }
            return character;
        });
        return { ...player, team: updatedTeam };
    }) as unknown as readonly [Player, Player];
}

/**
 * A character whose HP reached 0 leaves the board at once (DEAD-1): it moves from the team to
 * the fallen of its player, and its cell becomes empty.
 */
export function buryIfDead(players: readonly [Player, Player], playerIndex: PlayerIndex, characterId: CharacterId): readonly [Player, Player] {
    const player = players[playerIndex];
    const char = player.team.find(c => c.id === characterId);
    if (!char || char.hp > 0) return players;
    const buried: Player = { ...player, team: player.team.filter(c => c !== char), fallen: [...(player.fallen ?? []), char] };
    return (playerIndex === 0 ? [buried, players[1]] : [players[0], buried]) as readonly [Player, Player];
}

/**
 * Applies `fn` to the occupant of each position, once per occurrence and in
 * order: a position listed twice is applied twice (overlapping patterns stack).
 * Empty cells are skipped, and a character killed on a cell leaves the board before the next
 * one (DEAD-1). `affected` lists each touched id once.
 */
export function applyAtPositions(
    gameState: GameState,
    positions: readonly Position[],
    fn: (character: Character) => Character,
): { state: GameState; affected: CharacterId[] } {
    let players = gameState.players;
    const affected: CharacterId[] = [];
    for (const p of positions) {
        const char = players[p.playerIndex].team.find(c => c.position.slot === p.slot);
        if (!char) continue;
        players = buryIfDead(applyEffectToTargets(players, [char], fn), p.playerIndex, char.id);
        if (!affected.includes(char.id)) affected.push(char.id);
    }
    return { state: { ...gameState, players }, affected };
}
