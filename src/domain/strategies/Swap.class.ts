import { executeSwap, SwapDirection } from "../services/Player.service";
import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

export default class SwapEffect implements Effect {
    constructor(private readonly direction: SwapDirection) {}

    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        return executeSwap(gameState, actorId, this.direction);
    }
}
