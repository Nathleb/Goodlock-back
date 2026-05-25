import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { swapSlotsOnSameTeam } from "./Swap.class";

export default class MoveToSlot implements Effect {
    constructor(private readonly destinationSlot: number) {}

    solve(gameState: GameState, target: Position, _actorId: string): { state: GameState; affected: string[] } {
        const player = gameState.players[target.playerIndex];

        if (this.destinationSlot < 0 || this.destinationSlot >= player.team.length) return { state: gameState, affected: [] };

        return swapSlotsOnSameTeam(gameState, target.playerIndex, target.slot, this.destinationSlot);
    }
}
