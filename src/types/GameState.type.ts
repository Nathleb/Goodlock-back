import PriorityQueue from "src/types/PriorityQueue.type";
import Character from "./Character.type";
import Position from "./Position.type";
import { Player } from "./Player.type";


type GameState = {
    currentRound: number;
    priorityQueue: PriorityQueue;
    players: [Player, Player];
};

export default GameState;
