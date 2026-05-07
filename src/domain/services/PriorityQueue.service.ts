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

export function unstackPriorityQueue(gameState: GameState): GameState {
    let state = gameState;

    for (let i = state.priorityQueue.length - 1; i >= 0; i--) {
        for (const [effect, targetedPosition, characterId] of shuffled(state.priorityQueue[i])) {
            if (isActorAlive(state, characterId)) {
                ({ state } = effect.solve(state, targetedPosition, characterId));
            }
        }
    }

    return resetPriorityQueue(state);
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    for (let i = state.priorityQueue.length - 1; i >= 0; i--) {
        for (const [effect, targetedPosition, characterId] of shuffled(state.priorityQueue[i])) {
            const actor = findCharacter(state, characterId);
            const actorName = actor?.name ?? '';
            const effectDescription = actor?.face.description ?? '';
            const alive = isActorAlive(state, characterId);

            if (!alive) {
                log.push({ actorId: characterId, actorName, effectDescription, skipped: true, changes: [] });
                continue;
            }

            const { state: newState, affected } = effect.solve(state, targetedPosition, characterId);
            const changes = affected
                .map(id => findCharacter(newState, id))
                .filter((c): c is Character => c !== undefined)
                .map(c => ({ characterId: c.id, character: c }));

            state = newState;
            log.push({ actorId: characterId, actorName, effectDescription, skipped: false, changes });
        }
    }

    return { state: resetPriorityQueue(state), log };
}
