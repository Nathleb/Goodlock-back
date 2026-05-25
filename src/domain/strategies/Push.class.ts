import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { swapSlotsOnSameTeam } from "./Swap.class";

export default class Push implements Effect {
    constructor(private readonly delta: number) {}

    solve(gameState: GameState, target: Position, _actorId: string): { state: GameState; affected: string[] } {
        const player = gameState.players[target.playerIndex];
        const newSlot = target.slot + this.delta;

        if (newSlot < 0 || newSlot >= player.team.length) return { state: gameState, affected: [] };

        return swapSlotsOnSameTeam(gameState, target.playerIndex, target.slot, newSlot);
    }
}
