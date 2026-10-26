import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position, { SlotIndex } from "../types/Position.type";
import { Player } from "../types/Player.type";
import { stateValue } from "../services/Character.service";

/**
 * Exchanges the occupants of two cells of one team, looked up by slot. When one
 * cell is empty its occupant simply moves there; two empty cells fizzle. The
 * team stays ordered by slot.
 */
export function swapSlotsOnSameTeam(
    gameState: GameState,
    playerIndex: number,
    slotA: SlotIndex,
    slotB: SlotIndex,
): { state: GameState; affected: string[] } {
    if (slotA === slotB) return { state: gameState, affected: [] };

    const player = gameState.players[playerIndex];
    const atA = player.team.find(c => c.position.slot === slotA);
    const atB = player.team.find(c => c.position.slot === slotB);
    if (!atA && !atB) return { state: gameState, affected: [] };
    // A rooted character cannot be moved, nor move: any Swap involving its cell fizzles.
    if ([atA, atB].some(c => c !== undefined && stateValue(c, 'ROOT') > 0)) return { state: gameState, affected: [] };

    const newTeam = player.team
        .map(c => {
            if (c === atA) return { ...c, position: { ...c.position, slot: slotB } };
            if (c === atB) return { ...c, position: { ...c.position, slot: slotA } };
            return c;
        })
        .sort((x, y) => x.position.slot - y.position.slot);

    const players = [...gameState.players] as [Player, Player];
    players[playerIndex] = { ...player, team: newTeam };

    return {
        state: { ...gameState, players },
        affected: [atA, atB].filter(c => c !== undefined).map(c => c.id),
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
