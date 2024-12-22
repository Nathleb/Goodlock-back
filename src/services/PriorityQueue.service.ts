import PriorityQueue from "src/types/PriorityQueue.type";
import { getCharacterAtTargetPosition } from "./Target.service";
import { SingleTarget } from "./../strategies/TargetType.type";
import Target from "./../types/Target.type";
import Character from "src/types/Character.type";
import DieFace from "src/types/DieFace.type";
import GameState from "src/types/GameState.type";
import Effect from "src/types/Effect.type";


export function createPriorityQueue(length: number) {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, target?: Target) {
    dieFace.forEach(effect => {
        priorityQueue[effect.priority].push([effect, target]);
    });
}

export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue.forEach((queue) => queue.length = 0);
}

export function unstackPriorityQueue(priorityQueue: PriorityQueue) {
    for (let i = priorityQueue.length - 1; i >= 0; i--) {
        const queue = priorityQueue[i];

        while (queue.length > 0) {
            const [effect, target] = queue.shift()!;
            solveEffect(effect, target);
        }
    }
};

function solveEffect(effect: Effect, target: Target) {
    switch (effect.type) {
        case "SingleTarget":

            break;
        default:
            break;
    }
};

function solveSingleTargetEffect(effect: Effect, target: Target) {
    getCharacterAtTargetPosition(target);
};