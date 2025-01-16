import { TargetingFunction } from "src/strategies/TargetType.type";
import GameState from "./GameState.type";

type Effect = {
    priority: number;
    findTargets: TargetingFunction;

    solve(gameState: GameState, target: Location): GameState;
};

export default Effect;