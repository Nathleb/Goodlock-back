import PriorityQueue from "src/types/PriorityQueue.type";
import { Player } from "./Player.type";


type GameState = {
    currentRound: number;
    priorityQueue: PriorityQueue;
    players: [Player, Player];
};

export default GameState;
