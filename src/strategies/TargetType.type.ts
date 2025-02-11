
import Character from "src/types/Character.type";
import GameState from "src/types/GameState.type";
import Position from "src/types/Position.type";


export type TargetingFunction = (gameState: GameState, target: Position) => Character[];