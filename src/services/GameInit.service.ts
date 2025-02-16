import GameState from "src/types/GameState.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { Player } from "src/types/Player.type";


export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        priorityQueue: createPriorityQueue(100),
        players: [player1, player2],
    };
}