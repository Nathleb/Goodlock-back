import PriorityQueue from "src/types/PriorityQueue.type";
import Character from "./Character.type";
import Position from "./Position.type";


type GameState = {
    currentRound: number;
    priorityQueue: PriorityQueue;
    characters: Map<Position, Character>;
};

export default GameState;
