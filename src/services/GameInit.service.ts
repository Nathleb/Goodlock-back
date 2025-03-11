import GameState from "src/types/GameState.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { Player } from "src/types/Player.type";
import { readFileSync } from "fs";
import EffectFactory from "src/factories/EffectFactory";
import SingleTargetDamage from "src/strategies/SingleTargetDamage";
import SingleTargetHeal from "src/strategies/SingleTargetHeal";
import SingleTargetShield from "src/strategies/SingleTargetshield";
import Character from "src/types/Character.type";
import { createCharacterFromJsonTemplate } from "./CharacterGeneration.service";

export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        priorityQueue: createPriorityQueue(100),
        players: [player1, player2],
    };
}

export function createTeamsFromTemplates(templatePaths: string[]): Character[] {
    const team: Character[] = [];
    templatePaths.forEach((templatePath) => {
        const jsonCharacterTemplate = readFileSync(templatePath, 'utf-8');
        team.push(createCharacterFromJsonTemplate(jsonCharacterTemplate));
    });
    return team;
}

export function initializeEffects() {
    EffectFactory.registerEffect("SingleTargetDamage", (amount, priority) => new SingleTargetDamage(amount, priority));
    EffectFactory.registerEffect("SingleTargetHeal", (amount, priority) => new SingleTargetHeal(amount, priority));
    EffectFactory.registerEffect("SingleTargetShield", (amount, priority) => new SingleTargetShield(amount, priority));
}
