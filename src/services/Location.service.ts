import GameState from "src/types/GameState.type";
import Location from "src/types/Location.type";
import Player from "src/types/Player.type";

export function getPlayer(gameState: GameState, player: 0 | 1): Player {
    if (player === 0) return gameState.player1;
    return gameState.player2;
}


export function getCharacterAtTargetLocation(gameState: GameState, target: Location) {
    return getPlayer(gameState, target.player).team[target.position];
}