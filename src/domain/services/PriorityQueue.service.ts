import PriorityQueue, { QueueEntry, ResolveStep, ResolvedEffect } from "../types/PriorityQueue.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
import GameState from "../types/GameState.type";
import { resolveTargets } from "./TargetResolution.service";
import { stateValue } from "./Character.service";

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

// Tie-break keys, captured when RESOLVE starts so that a Swap during the round does not
// reshuffle ties: the initiative holder first, then the slot (0 -> 4).
type TieKeys = ReadonlyMap<string, { readonly initiative: number; readonly slot: number }>;

function captureTieKeys(state: GameState): TieKeys {
    const keys = new Map<string, { initiative: number; slot: number }>();
    for (const [, characterId] of state.priorityQueue) {
        const holds = state.players.some(p => p.playerIndex === state.initiativePlayerIndex && p.team.some(c => c.id === characterId));
        // An actor missing from the state sorts as a non-holder in slot 0.
        keys.set(characterId, { initiative: holds ? 0 : 1, slot: findCharacter(state, characterId)?.position.slot ?? 0 });
    }
    return keys;
}

// Pokemon-style ordering: bracket (face.priority) desc, then the SPEED state (hasted, neutral,
// slowed), then baseSpeed desc, then the initiative holder's actors first, then slot asc. A pure
// sort: no randomness. The SPEED state is read live, so a HASTE or SLOW landing during the round
// reorders the entries that have not played yet; the bracket is never crossed.
function compareEntries(state: GameState, tieKeys: TieKeys) {
    const speedRank = (characterId: string): number => {
        const self = findCharacter(state, characterId);
        const speed = self ? stateValue(self, 'SPEED') : 0;
        return speed > 0 ? 0 : speed < 0 ? 2 : 1;
    };
    return (a: QueueEntry, b: QueueEntry): number =>
        (b[0].priority - a[0].priority)
        || (speedRank(a[1]) - speedRank(b[1]))
        || (b[2] - a[2])
        || (tieKeys.get(a[1])!.initiative - tieKeys.get(b[1])!.initiative)
        || (tieKeys.get(a[1])!.slot - tieKeys.get(b[1])!.slot);
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    // Each entry is consumed once. Before every step the entries that have not played yet are
    // sorted again, so only a SPEED change can reorder them; hp, shield and positions never do.
    const tieKeys = captureTieKeys(state);
    const remaining = [...state.priorityQueue];
    while (remaining.length > 0) {
        remaining.sort(compareEntries(state, tieKeys));
        const [face, characterId] = remaining.shift()!;
        const self = findCharacter(state, characterId);
        // A stun is read when the turn comes: one landing before the action cancels it, like death.
        if (!isAlive(state, characterId) || self === undefined || stateValue(self, 'STUN') > 0) {
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
