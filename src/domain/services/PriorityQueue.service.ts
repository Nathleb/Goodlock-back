import PriorityQueue, { QueueEntry, ResolveStep, ResolvedEffect } from "../types/PriorityQueue.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
import GameState from "../types/GameState.type";
import { resolveTargets } from "./TargetResolution.service";

export function createPriorityQueue(): PriorityQueue {
    return [];
}

export function addEffectsToPriorityQueue(
    priorityQueue: PriorityQueue,
    dieFace: DieFace,
    characterId: string,
    baseSpeed: number
): PriorityQueue {
    const newEntry: QueueEntry = [dieFace, characterId, baseSpeed];
    return [...priorityQueue, newEntry];
}

export function addAllEffectsToPriorityQueue(gameState: GameState): GameState {
    let queue = gameState.priorityQueue;
    gameState.players.forEach(player => player.team.forEach(char => {
        queue = addEffectsToPriorityQueue(queue, char.face, char.id, char.baseSpeed);
    }));
    return { ...gameState, priorityQueue: queue };
}

export function resetPriorityQueue(gameState: GameState): GameState {
    return { ...gameState, priorityQueue: createPriorityQueue() };
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

// Pokemon-style ordering: bracket (face.priority) desc, then speed desc, then the
// initiative holder's actors first. A pure sort: no randomness, so the order is
// fully determined by the queue and the state.
function orderedForResolution(queue: PriorityQueue, state: GameState): QueueEntry[] {
    const holdsInitiative = (characterId: string): number =>
        state.players.some(p => p.playerIndex === state.initiativePlayerIndex && p.team.some(c => c.id === characterId)) ? 0 : 1;
    return [...queue].sort(
        (a, b) => (b[0].priority - a[0].priority)
            || (b[2] - a[2])
            || (holdsInitiative(a[1]) - holdsInitiative(b[1]))
    );
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    // Order is computed once up front. State mutations inside the loop (hp, shield,
    // positions) never re-order resolution — the bracket/speed/initiative sort is fixed here.
    for (const [face, characterId] of orderedForResolution(state.priorityQueue, state)) {
        if (!isAlive(state, characterId) || findCharacter(state, characterId) === undefined) {
            log.push({ characterId, skipped: true, effects: [], changes: [] });
            continue;
        }

        const affectedIds = new Set<string>();
        const effects: ResolvedEffect[] = [];
        for (const faceEffect of face.effects) {
            // Cells are resolved just before each effect, from the actor's *current*
            // position — an earlier swap (this face or another actor's) shifts them.
            const actor = findCharacter(state, characterId)!;
            const targets = resolveTargets(faceEffect.targets, actor.position);
            effects.push({ effect: faceEffect.label, targets });
            if (targets.length === 0) continue;
            const { state: newState, affected } = faceEffect.impl.solve(state, targets, characterId);
            state = newState;
            affected.forEach(id => affectedIds.add(id));
        }

        const changes = [...affectedIds]
            .map(id => findCharacter(state, id))
            .filter((c): c is Character => c !== undefined)
            .map(c => ({ characterId: c.id, character: c }));

        log.push({ characterId, skipped: false, effects, changes });
    }

    return { state: resetPriorityQueue(state), log };
}
