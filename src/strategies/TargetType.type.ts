
import Coordinate from "../types/Coordinate";
import Character from "src/types/Character.type";
import GameState from "src/types/GameState.type";


export type TargetingFunction = (gameState: GameState, target: Coordinate) => Character[];