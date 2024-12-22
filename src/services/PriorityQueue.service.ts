import PriorityQueue from "src/types/PriorityQueue.type";
import Target from "./../types/Target.type";
import Character from "src/types/Character.type";
import DieFace from "src/types/DieFace.type";
import GameState from "src/types/GameState.type";


export function createPriorityQueue(length: number) {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, target?: Target) {
    dieFace.forEach(effect => {
        priorityQueue[effect.priority].push([effect, target]);
    });
}

export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue = gameState.priorityQueue.map(_queue => []);
}