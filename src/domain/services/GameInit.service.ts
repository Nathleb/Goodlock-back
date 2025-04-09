import GameState from "../types/GameState.type";
import { createPriorityQueue } from "./priorityQueue.service";
import { Player } from "../types/Player.type";
import EffectFactory from "../factories/EffectFactory.class";
import SingleTargetDamage from "../strategies/SingleTargetDamage.class";
import SingleTargetHeal from "../strategies/SingleTargetHeal.class";
import SingleTargetShield from "../strategies/SingleTargetShield.class";
import Character from "../types/Character.type";
import { createCharacterFromJsonTemplate } from "./characterGeneration.service";

export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        rollsLeft: 3,
        priorityQueue: createPriorityQueue(100),
        players: [player1, player2],
    };
}

export function createTeamsFromTemplates(templateContents: string[]): Character[] {
    const team: Character[] = [];
    templateContents.forEach((jsonCharacterTemplate) => {
        team.push(createCharacterFromJsonTemplate(jsonCharacterTemplate));
    });
    return team;
}

export function initializeEffects() {
    EffectFactory.registerEffect("SingleTargetDamage", (amount, priority) => new SingleTargetDamage(amount, priority));
    EffectFactory.registerEffect("SingleTargetHeal", (amount, priority) => new SingleTargetHeal(amount, priority));
    EffectFactory.registerEffect("SingleTargetShield", (amount, priority) => new SingleTargetShield(amount, priority));
}
