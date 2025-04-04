import TargetingFunction from "../strategies/TargetType.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

type Effect = {
    priority: number;
    findTargets: TargetingFunction;

    solve(gameState: GameState, target: Position): GameState;
};

export default Effect;