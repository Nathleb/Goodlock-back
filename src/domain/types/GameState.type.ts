import GamePhase from "./GamePhase.type";
import PriorityQueue from "./PriorityQueue.type";
import { Player } from "./Player.type";

type GameState = {
    phase: GamePhase;
    currentRound: number;
    rollsLeft: number;
    playersReady: [boolean, boolean];
    priorityQueue: PriorityQueue;
    players: [Player, Player];
};

export default GameState;
