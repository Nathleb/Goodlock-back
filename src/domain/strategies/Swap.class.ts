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

export default class SwapAlly implements Effect {
    solve(gameState: GameState, target: Position, actorId: string): { state: GameState; affected: string[] } {
        let actorSlot: number | undefined;
        let actorPlayerIndex: number | undefined;

        for (let pi = 0; pi < gameState.players.length; pi++) {
            const idx = gameState.players[pi].team.findIndex(c => c.id === actorId);
            if (idx !== -1) { actorSlot = idx; actorPlayerIndex = pi; break; }
        }

        if (actorSlot === undefined || actorPlayerIndex === undefined) return { state: gameState, affected: [] };

        return swapSlotsOnSameTeam(gameState, actorPlayerIndex, actorSlot, target.slot);
    }
}
