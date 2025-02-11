import PriorityQueue from "src/types/PriorityQueue.type";
import Position from "./../types/Position.type";
import DieFace from "src/types/DieFace.type";
import GameState from "src/types/GameState.type";


export function createPriorityQueue(length: number) {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, position: Position) {
    dieFace.forEach(effect => {
        priorityQueue[effect.priority].push([effect, position]);
    });
}

export function addAllEffectsToPriorityQueue(gameState: GameState): void {
    const { characters, priorityQueue } = gameState;
    characters.forEach((char) =>
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

        for (const [effect, targetedPosition] of queue) {
            gameState = effect.solve(gameState, targetedPosition);
        }
    }

    resetPriorityQueue(gameState);
}
