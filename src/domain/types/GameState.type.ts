import GamePhase from "./GamePhase.type";
import PriorityQueue from "./PriorityQueue.type";
import { Player } from "./Player.type";

type GameState = {
    phase: GamePhase;
    currentRound: number;
    rollsLeft: number;
    priorityQueue: PriorityQueue;
    players: [Player, Player];
};

export default GameState;
