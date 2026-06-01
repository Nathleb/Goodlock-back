import GamePhase from "./GamePhase.type";
import PriorityQueue from "./PriorityQueue.type";
import { Player } from "./Player.type";

type GameState = {
    readonly phase: GamePhase;
    readonly currentRound: number;
    readonly rollsLeft: number;
    readonly playersReady: readonly [boolean, boolean];
    readonly priorityQueue: PriorityQueue;
    readonly players: readonly [Player, Player];
};

export default GameState;
