import PriorityQueue, { QueueEntry, ResolveStep, ResolvedEffect } from "../types/PriorityQueue.type";
import DieFace from "../types/DieFace.type";
import Character from "../types/Character.type";
import GameState from "../types/GameState.type";
import { resolveTargets } from "./TargetResolution.service";
import { stateValue } from "./Character.service";
import { effectFor } from "../strategies/effectFor";
import { checkMatchEnd } from "./Round.service";
import { PlayerIndex } from "../types/Position.type";
import { CharacterId } from "@shared/branded.types";

export function createPriorityQueue(): PriorityQueue {
    return [];
}

export function addEffectsToPriorityQueue(
    priorityQueue: PriorityQueue,
    dieFace: DieFace,
    characterId: CharacterId,
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

/** A character on the board. A dead one has left it (DEAD-1). */
function findCharacter(gameState: GameState, characterId: CharacterId): Character | undefined {
    for (const player of gameState.players) {
        const char = player.team.find(c => c.id === characterId);
        if (char) return char;
    }
    return undefined;
}

/** A character on the board, or one that fell: the log shows the killing blow with 0 HP. */
function findOnBoardOrFallen(gameState: GameState, characterId: CharacterId): Character | undefined {
    return findCharacter(gameState, characterId)
        ?? gameState.players.flatMap(p => p.fallen ?? []).find(c => c.id === characterId);
}

// Tie-break keys, captured when RESOLVE starts so that a Swap during the round does not
// reshuffle ties: the initiative holder first, then the slot (0 -> 4).
type TieKeys = ReadonlyMap<CharacterId, { readonly initiative: number; readonly slot: number }>;

function captureTieKeys(state: GameState, characterIds: readonly CharacterId[]): TieKeys {
    const keys = new Map<CharacterId, { initiative: number; slot: number }>();
    for (const characterId of characterIds) {
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
type Actor = { readonly id: CharacterId; readonly bracket: number; readonly speed: number };

function compareActors(state: GameState, tieKeys: TieKeys) {
    const speedRank = (characterId: CharacterId): number => {
        const self = findCharacter(state, characterId);
        const speed = self ? stateValue(self, 'SPEED') : 0;
        return speed > 0 ? 0 : speed < 0 ? 2 : 1;
    };
    return (a: Actor, b: Actor): number =>
        (b.bracket - a.bracket)
        || (speedRank(a.id) - speedRank(b.id))
        || (b.speed - a.speed)
        || (tieKeys.get(a.id)!.initiative - tieKeys.get(b.id)!.initiative)
        || (tieKeys.get(a.id)!.slot - tieKeys.get(b.id)!.slot);
}

const entryActor = ([face, id, speed]: QueueEntry): Actor => ({ id, bracket: face.priority, speed });

/** The characters on the board in resolution order without the bracket: the order of the start-of-round effects (UPK-1). */
export function startOfRoundOrder(state: GameState): CharacterId[] {
    const actors = state.players.flatMap(p => p.team).map(c => ({ id: c.id, bracket: 0, speed: c.baseSpeed }));
    const tieKeys = captureTieKeys(state, actors.map(a => a.id));
    return actors.sort(compareActors(state, tieKeys)).map(a => a.id);
}

export function unstackPriorityQueueWithLog(gameState: GameState): { state: GameState; log: ResolveStep[] } {
    let state = gameState;
    const log: ResolveStep[] = [];

    // Each entry is consumed once. Before every step the entries that have not played yet are
    // sorted again, so only a SPEED change can reorder them; hp, shield and positions never do.
    const tieKeys = captureTieKeys(state, state.priorityQueue.map(([, id]) => id));
    const remaining = [...state.priorityQueue];
    while (remaining.length > 0 && state.winner === undefined) {
        const compare = compareActors(state, tieKeys);
        remaining.sort((a, b) => compare(entryActor(a), entryActor(b)));
        const [face, characterId] = remaining.shift()!;
        const self = findCharacter(state, characterId);
        // A stun is read when the turn comes: one landing before the action cancels it, like death.
        if (self === undefined || stateValue(self, 'STUN') > 0) {
            log.push({ characterId, skipped: true, effects: [], changes: [] });
            continue;
        }

        const affectedIds = new Set<CharacterId>();
        const effects: ResolvedEffect[] = [];
        for (const faceEffect of face.effects) {
            // Cells are resolved just before each effect, from the actor's *current*
            // position — an earlier swap (this face or another actor's) shifts them.
            const actor = findCharacter(state, characterId);
            // DEAD-3: an actor who died during its own action stops it.
            if (actor === undefined) break;
            const targets = resolveTargets(faceEffect.targets, actor.position);
            effects.push({ effect: faceEffect.label, targets });
            if (targets.length === 0) continue;
            const { state: newState, affected } = effectFor(faceEffect).solve(state, targets, characterId);
            // END-2: deaths are checked after each effect; the match ends at once (END-1).
            state = checkMatchEnd(newState, actor.position.playerIndex as PlayerIndex);
            affected.forEach(id => affectedIds.add(id));
            if (state.winner !== undefined) break;
        }

        const changes = [...affectedIds]
            .map(id => findOnBoardOrFallen(state, id))
            .filter((c): c is Character => c !== undefined)
            .map(c => ({ characterId: c.id, character: c }));

        log.push({ characterId, skipped: false, effects, changes });
    }

    return { state: resetPriorityQueue(state), log };
}
