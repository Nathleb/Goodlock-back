import PriorityQueue from "src/types/PriorityQueue.type";
import { getCharacterAtTargetLocation } from "./Location.service";
import Location from "../types/Coordinate";
import Character from "src/types/Character.type";
import DieFace from "src/types/DieFace.type";
import GameState from "src/types/GameState.type";
import Effect from "src/types/Effect.type";
import Position from "src/types/Position.type";


export function createPriorityQueue(length: number) {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, target: Location) {
    dieFace.forEach(effect => {
        priorityQueue[effect.priority].push([effect, target]);
    });
}

export function addAllEffectsToPriorityQueue(gameState: GameState): void {
    const { player1, player2, priorityQueue } = gameState;
    player1.team.forEach((char) =>
        addEffectsToPriorityQueue(priorityQueue, char.currentFace, char.currentTarget)
    );
    player2.team.forEach((char, index: Position) =>
        addEffectsToPriorityQueue(priorityQueue, char.currentFace, char.currentTarget)
    );
}


export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue.forEach((queue) => queue.length = 0);
}

export function unstackPriorityQueue(gameState: GameState) {
    for (let i = gameState.priorityQueue.length - 1; i >= 0; i--) {
        const queue = gameState.priorityQueue[i];

        for (let j = queue.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [queue[j], queue[k]] = [queue[k], queue[j]];
        }

        for (const [effect, targetedLocation] of queue) {
            effect.solve(gameState, targetedLocation);
        }
    }

    resetPriorityQueue(gameState);
}
