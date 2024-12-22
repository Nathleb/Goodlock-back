import Character from "src/types/Character.type";
import { addEffectsToPriorityQueue, createPriorityQueue } from "./PriorityQueue.service";
import GameState from "src/types/GameState.type";
import Position from "src/types/Position.type";
import Target from "src/types/Target.type";
import Player from "src/types/Player.type";

export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        priorityQueue: createPriorityQueue(100),
        player1: player1,
        player2: player2
    };
}

export function getPlayer(gameState: GameState, player: 0 | 1): Player {
    if (player === 0) return gameState.player1;
    return gameState.player2;
}

export function addAllEffectsToPriorityQueue(gameState: GameState): void {
    const { player1, player2, priorityQueue } = gameState;
    player1.team.forEach((char) =>
        addEffectsToPriorityQueue(priorityQueue, char.currentFace, char.currentTarget)
    );
    player2.team.forEach((char, index: Position) =>
        addEffectsToPriorityQueue(priorityQueue, char.currentFace, char.currentTarget)
    );
}

