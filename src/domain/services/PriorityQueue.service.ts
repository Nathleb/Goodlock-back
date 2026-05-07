import PriorityQueue from "../types/PriorityQueue.type";
import Position from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import GameState from "../types/GameState.type";

export function createPriorityQueue(length: number): PriorityQueue {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, target: Position, characterId: string, baseSpeed: number): void {
    const finalPriority = dieFace.priority + baseSpeed;
    dieFace.effects.forEach(effect => {
        priorityQueue[finalPriority].push([effect, target, characterId]);
    });
}

export function addAllEffectsToPriorityQueue(gameState: GameState): void {
    const { players, priorityQueue } = gameState;
    players.forEach((player) => player.team.forEach(char => {
        if (char.target !== null) {
            addEffectsToPriorityQueue(priorityQueue, char.face, char.target, char.id, char.baseSpeed);
        }
    }));
}

export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue.forEach((queue) => queue.length = 0);
}

function isActorAlive(gameState: GameState, characterId: string): boolean {
    return gameState.players.some(player =>
        player.team.some(char => char.id === characterId && char.hp > 0)
    );
}

export function unstackPriorityQueue(gameState: GameState): GameState {
    for (let i = gameState.priorityQueue.length - 1; i >= 0; i--) {
        const queue = gameState.priorityQueue[i];

        for (let j = queue.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [queue[j], queue[k]] = [queue[k], queue[j]];
        }

        for (const [effect, targetedPosition, characterId] of queue) {
            if (isActorAlive(gameState, characterId)) {
                gameState = effect.solve(gameState, targetedPosition, characterId);
            }
        }
    }

    resetPriorityQueue(gameState);
    return gameState;
}
