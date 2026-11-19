import Character from "../types/Character.type";
import { Player } from "../types/Player.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { isDead } from "../services/Character.service";
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
 * DEAD-1: once an effect has applied, every character at 0 HP dies and leaves the board: it moves
 * from the team to the fallen of its player, and its cell becomes empty. Characters killed by the
 * same effect die at the same time.
 */
export function settleDeaths(gameState: GameState): GameState {
    if (!gameState.players.some(p => p.team.some(isDead))) return gameState;
    const players = gameState.players.map(player => {
        const dead = player.team.filter(isDead);
        if (dead.length === 0) return player;
        return { ...player, team: player.team.filter(c => !isDead(c)), fallen: [...(player.fallen ?? []), ...dead] };
    }) as unknown as readonly [Player, Player];
    return { ...gameState, players };
}

/**
 * Applies `fn` to the occupant of each position, once per occurrence and in
 * order: a position listed twice is applied twice (overlapping patterns stack).
 * Empty cells are skipped. A character brought to 0 HP stays on its cell: deaths settle once the
 * whole effect has applied (`settleDeaths`). `affected` lists each touched id once.
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
        players = applyEffectToTargets(players, [char], fn);
        if (!affected.includes(char.id)) affected.push(char.id);
    }
    return { state: { ...gameState, players }, affected };
}
