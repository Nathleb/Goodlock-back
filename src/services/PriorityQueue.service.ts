import PriorityQueue from "src/types/PriorityQueue.type";
import { getCharacterAtTargetPosition } from "./Target.service";
import { SingleTarget } from "./../strategies/TargetType.type";
import Target from "./../types/Target.type";
import Character from "src/types/Character.type";
import DieFace from "src/types/DieFace.type";
import GameState from "src/types/GameState.type";
import Effect from "src/types/Effect.type";


export function createPriorityQueue(length: number) {
    return Array.from({ length }, () => []);
}

export function addEffectsToPriorityQueue(priorityQueue: PriorityQueue, dieFace: DieFace, target: Target) {
    dieFace.forEach(effect => {
        priorityQueue[effect.priority].push([effect, target]);
    });
}

export function resetPriorityQueue(gameState: GameState): void {
    gameState.priorityQueue.forEach((queue) => queue.length = 0);
}

export function unstackPriorityQueue(gameState: GameState) {

    for (let i = gameState.priorityQueue.length - 1; i >= 0; i--) {
        const queue = gameState.priorityQueue[i];
        const targetedCharacterQueue: [Effect, Character][] = [];

        while (queue.length > 0) {
            const [effect, target] = queue.shift()!;
            targetedCharacterQueue.push(...findTargetedCharacters(gameState, effect, target));
        }

        while (targetedCharacterQueue.length > 0) {
            const [effect, character] = targetedCharacterQueue.shift()!;
            effect.solve(character);
        }
    }
};

function findTargetedCharacters(gameState: GameState, effect: Effect, target: Target): [Effect, Character][] {
    if (effect.type === "SingleTarget") {
        return findTargetedCharactersForSingleTargetEffect(gameState, effect, target);
    }
    else if (effect.type === "CleaveTarget") { return []; }
    else if (effect.type === "AllCharacterTarget") { return []; }
    else if (effect.type === "TeamTarget") { return []; }
    else {
        const exhaustiveCheck: never = effect.type;
        throw new Error(exhaustiveCheck);
    }
};

function findTargetedCharactersForSingleTargetEffect(gameState: GameState, effect: Effect, target: Target): [Effect, Character][] {
    return [[effect, getCharacterAtTargetPosition(gameState, target)]];
};