import PriorityQueue, { QueueEntry } from "../types/PriorityQueue.type";
import Position from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import GameState from "../types/GameState.type";

export function createPriorityQueue(length: number): PriorityQueue {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(
    priorityQueue: PriorityQueue,
    dieFace: DieFace,
    target: Position,
    characterId: string,
    baseSpeed: number
): PriorityQueue {
    const finalPriority = dieFace.priority + baseSpeed;
    const newEntries: QueueEntry[] = dieFace.effects.map(effect => [effect, target, characterId]);
    return priorityQueue.map((bucket, i) =>
        i === finalPriority ? [...bucket, ...newEntries] : bucket
    ) as PriorityQueue;
}

export function addAllEffectsToPriorityQueue(gameState: GameState): GameState {
    let queue = gameState.priorityQueue;
    gameState.players.forEach(player => player.team.forEach(char => {
        if (char.target !== null) {
            queue = addEffectsToPriorityQueue(queue, char.face, char.target, char.id, char.baseSpeed);
        }
    }));
    return { ...gameState, priorityQueue: queue };
}

export function resetPriorityQueue(gameState: GameState): GameState {
    return { ...gameState, priorityQueue: createPriorityQueue(gameState.priorityQueue.length) };
}

function isActorAlive(gameState: GameState, characterId: string): boolean {
    return gameState.players.some(player =>
        player.team.some(char => char.id === characterId && char.hp > 0)
    );
}

function shuffled<T>(arr: readonly T[]): T[] {
    return arr.reduce<T[]>((acc, item) => {
        const i = Math.floor(Math.random() * (acc.length + 1));
        return [...acc.slice(0, i), item, ...acc.slice(i)];
    }, []);
}

export function unstackPriorityQueue(gameState: GameState): GameState {
    let state = gameState;

    for (let i = state.priorityQueue.length - 1; i >= 0; i--) {
        for (const [effect, targetedPosition, characterId] of shuffled(state.priorityQueue[i])) {
            if (isActorAlive(state, characterId)) {
                state = effect.solve(state, targetedPosition, characterId);
            }
        }
    }

    return resetPriorityQueue(state);
}
