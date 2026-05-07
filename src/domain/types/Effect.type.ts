import TargetingFunction from "./TargetingFunction.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

type Effect = {
    findTargets: TargetingFunction;
    solve(gameState: GameState, target: Position, actorId: string): GameState;
};

export default Effect;
