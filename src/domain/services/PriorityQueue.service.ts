import PriorityQueue, { QueueEntry, ResolveStep } from "../types/PriorityQueue.type";
import Position, { PlayerIndex } from "../types/Position.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
import GameState from "../types/GameState.type";
import { validateTarget } from "./TargetValidator";
import TargetConstraint from "../types/TargetConstraint.type";

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
    if (finalPriority < 0 || finalPriority >= priorityQueue.length) {
        throw new Error(
            `finalPriority ${finalPriority} (face priority ${dieFace.priority} + baseSpeed ${baseSpeed}) ` +
            `is out of range for a queue of length ${priorityQueue.length} — check the character template values`
        );
    }
    const newEntry: QueueEntry = [dieFace, target, characterId];
    const newQueue = [...priorityQueue];
    newQueue[finalPriority] = [...newQueue[finalPriority], newEntry];
    return newQueue as PriorityQueue;
}

export function addAllEffectsToPriorityQueue(gameState: GameState): GameState {
    let queue = gameState.priorityQueue;
    gameState.players.forEach(player => player.team.forEach(char => {
        const target = char.face.targetConstraint === TargetConstraint.NONE
            ? char.position
            : char.target;
        if (target !== null) {
            queue = addEffectsToPriorityQueue(queue, char.face, target, char.id, char.baseSpeed);
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

function findActorPlayerIndex(state: GameState, characterId: string): PlayerIndex | undefined {
    for (let pi = 0; pi < state.players.length; pi++) {
        if (state.players[pi].team.some(c => c.id === characterId)) return pi as PlayerIndex;
    }
    return undefined;
}

function shuffled<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
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

            const actorPlayerIndex = findActorPlayerIndex(state, characterId);
            if (actorPlayerIndex === undefined) {
                log.push({ characterId, skipped: true, changes: [] });
                continue;
            }
            if (face.targetConstraint !== TargetConstraint.NONE) {
                validateTarget(face.targetConstraint, actorPlayerIndex, targetedPosition);
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
