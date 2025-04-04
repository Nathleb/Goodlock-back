import PriorityQueue from "../types/PriorityQueue.type";
import Position from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import GameState from "../types/GameState.type";

/**
 * Creates a priority queue with the given length.
 * @param length - The length of the priority queue.
 * @returns A new priority queue.
 */
export function createPriorityQueue(length: number): PriorityQueue {
    return Array.from({ length }, () => []);
}

/**
 * Adds effects to the priority queue based on their priority.
 * @param priorityQueue - The priority queue to add effects to.
 * @param dieFace - The die face containing effects.
 * @param position - The position associated with the effects.
 */
export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, position: Position): void {
    dieFace.effects.forEach(effect => {
        priorityQueue[effect.priority].push([effect, position]);
    });
}

/**
 * Adds all effects from the game state characters to the priority queue.
 * @param gameState - The current game state.
 */
export function addAllEffectsToPriorityQueue(gameState: GameState): void {
    const { players, priorityQueue } = gameState;
    players.forEach((player) => player.team.forEach(char => {
        addEffectsToPriorityQueue(priorityQueue, char.face, char.target)
    })
    );
}

/**
 * Resets the priority queue by clearing all queues.
 * @param gameState - The current game state.
 */
export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue.forEach((queue) => queue.length = 0);
}

/**
 * Unstacks the priority queue by shuffling and resolving effects.
 * @param gameState - The current game state.
 * @returns The updated game state.
 */
export function unstackPriorityQueue(gameState: GameState): GameState {
    for (let i = gameState.priorityQueue.length - 1; i >= 0; i--) {
        const queue = gameState.priorityQueue[i];

        // Shuffle the queue
        for (let j = queue.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [queue[j], queue[k]] = [queue[k], queue[j]];
        }

        // Resolve effects
        for (const [effect, targetedPosition] of queue) {
            gameState = effect.solve(gameState, targetedPosition);
        }
    }

    resetPriorityQueue(gameState);
    return gameState;
}
