import GameState from "src/types/GameState.type";
import { getPlayer } from "./GameLoop.service";
import Target from "src/types/Target.type";

export function getCharacterAtTargetPosition(gameState: GameState, target: Target) {
    return getPlayer(gameState, target.player).team[target.position];
}