import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

type Effect = {
    solve(gameState: GameState, target: Position, actorId: string): { state: GameState; affected: string[] };
};

export default Effect;
