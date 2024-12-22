import PriorityQueue from "src/types/PriorityQueue.type";
import Player from "./Player.type";

type GameState = {
    currentRound: number;
    priorityQueue: PriorityQueue;
    player1: Player;
    player2: Player;
};

export default GameState;
