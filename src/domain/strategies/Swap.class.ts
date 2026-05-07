import { executeSwap, SwapDirection } from "../services/Player.service";
import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import TargetingFunction from "../types/TargetingFunction.type";

export default class SwapEffect implements Effect {
    readonly direction: SwapDirection;
    readonly findTargets: TargetingFunction = () => [];

    constructor(direction: SwapDirection) {
        this.direction = direction;
    }

    solve(gameState: GameState, _target: Position, actorId: string): GameState {
        return executeSwap(gameState, actorId, this.direction);
    }
}
