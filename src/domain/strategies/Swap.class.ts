import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { Player } from "../types/Player.type";

export function swapSlotsOnSameTeam(
    gameState: GameState,
    playerIndex: number,
    slotA: number,
    slotB: number,
): { state: GameState; affected: string[] } {
    if (slotA === slotB) return { state: gameState, affected: [] };

    const player = gameState.players[playerIndex];
    const newTeam = [...player.team];
    newTeam[slotA] = { ...player.team[slotB], position: player.team[slotA].position };
    newTeam[slotB] = { ...player.team[slotA], position: player.team[slotB].position };

    const players = [...gameState.players] as [Player, Player];
    players[playerIndex] = { ...player, team: newTeam };

    return {
        state: { ...gameState, players },
        affected: [player.team[slotA].id, player.team[slotB].id],
    };
}

/** Exchanges the occupants of exactly 2 cells on the same team; anything else fizzles. */
export default class Swap implements Effect {
    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        if (targets.length !== 2) return { state: gameState, affected: [] };
        const [a, b] = targets;
        if (a.playerIndex !== b.playerIndex) return { state: gameState, affected: [] };
        return swapSlotsOnSameTeam(gameState, a.playerIndex, a.slot, b.slot);
    }
}
