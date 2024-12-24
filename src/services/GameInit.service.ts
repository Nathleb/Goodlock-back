import GameState from "src/types/GameState.type";
import Player from "src/types/Player.type";
import { createPriorityQueue } from "./PriorityQueue.service";


export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        priorityQueue: createPriorityQueue(100),
        player1: player1,
        player2: player2
    };
}