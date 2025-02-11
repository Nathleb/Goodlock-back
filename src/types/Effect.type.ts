import { TargetingFunction } from "src/strategies/TargetType.type";
import GameState from "./GameState.type";
import Position from "./Position.type";

type Effect = {
    priority: number;
    findTargets: TargetingFunction;

    solve(gameState: GameState, target: Position): GameState;
};

export default Effect;