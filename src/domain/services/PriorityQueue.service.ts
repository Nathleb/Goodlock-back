import PriorityQueue, { QueueEntry, ResolveStep } from "../types/PriorityQueue.type";
import Position from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
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
    const newEntry: QueueEntry = [dieFace, target, characterId];
    return priorityQueue.map((bucket, i) =>
        i === finalPriority ? [...bucket, newEntry] : bucket
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

function isAlive(gameState: GameState, characterId: string): boolean {
    return gameState.players.some(player =>
        player.team.some(char => char.id === characterId && char.hp > 0)
    );
}

function findCharacter(gameState: GameState, characterId: string): Character | undefined {
    for (const player of gameState.players) {
        const char = player.team.find(c => c.id === characterId);
        if (char) return char;
    }
    return undefined;
}

function shuffled<T>(arr: readonly T[]): T[] {
    return arr.reduce<T[]>((acc, item) => {
        const i = Math.floor(Math.random() * (acc.length + 1));
        return [...acc.slice(0, i), item, ...acc.slice(i)];
    }, []);
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    for (let i = state.priorityQueue.length - 1; i >= 0; i--) {
        for (const [face, targetedPosition, characterId] of shuffled(state.priorityQueue[i])) {
            if (!isAlive(state, characterId)) {
                log.push({ characterId, skipped: true, changes: [] });
                continue;
            }

            const affectedIds = new Set<string>();
            for (const effect of face.effects) {
                const { state: newState, affected } = effect.solve(state, targetedPosition, characterId);
                state = newState;
                affected.forEach(id => affectedIds.add(id));
            }

            const changes = [...affectedIds]
                .map(id => findCharacter(state, id))
                .filter((c): c is Character => c !== undefined)
                .map(c => ({ characterId: c.id, character: c }));

            log.push({ characterId, skipped: false, changes });
        }
    }

    return { state: resetPriorityQueue(state), log };
}
