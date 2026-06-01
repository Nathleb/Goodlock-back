import GameState from "../types/GameState.type";
import { Player } from "../types/Player.type";
import { PlayerIndex } from "../types/Position.type";
import { rollDiceForTurn } from "./Player.service";

export function canReroll(gameState: GameState): boolean {
    return gameState.rollsLeft > 0;
}

export function reroll(gameState: GameState, playerIndex: PlayerIndex): GameState {
    if (!canReroll(gameState)) throw new Error('No rolls left');

    const updatedPlayers = [...gameState.players] as [Player, Player];
    updatedPlayers[playerIndex] = rollDiceForTurn(gameState.players[playerIndex]);
    return { ...gameState, rollsLeft: gameState.rollsLeft - 1, players: updatedPlayers };
}
