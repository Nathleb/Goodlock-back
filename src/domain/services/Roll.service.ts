import GameState from "../types/GameState.type";
import { PlayerIndex } from "../types/Position.type";
import { rollDiceForTurn } from "./Player.service";

export function canReroll(gameState: GameState): boolean {
    return gameState.rollsLeft > 0;
}

export function reroll(gameState: GameState, playerIndex: PlayerIndex): GameState {
    const updatedPlayers = [...gameState.players] as typeof gameState.players;
    updatedPlayers[playerIndex] = rollDiceForTurn(gameState.players[playerIndex]);
    return { ...gameState, rollsLeft: gameState.rollsLeft - 1, players: updatedPlayers };
}
