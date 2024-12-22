import PriorityQueue from "src/types/PriorityQueue.type";
import GameState from "src/types/GameState.type";
import Player from "src/types/Player.type";


export const createGame = (player1: Player, player2: Player, priorityQueue: PriorityQueue): GameState => {
    return { currentRound: 0, player1, player2, priorityQueue };
};
