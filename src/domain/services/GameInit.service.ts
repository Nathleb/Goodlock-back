import GameState from "../types/GameState.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { Player } from "../types/Player.type";
import EffectFactory from "../factories/EffectFactory.class";
import SingleTargetDamage from "../strategies/SingleTargetDamage.class";
import SingleTargetHeal from "../strategies/SingleTargetHeal.class";
import SingleTargetShield from "../strategies/SingleTargetShield.class";
import CleaveDamage from "../strategies/CleaveDamage.class";
import CleaveHeal from "../strategies/CleaveHeal.class";
import CleaveShield from "../strategies/CleaveShield.class";
import FullTeamDamage from "../strategies/FullTeamDamage.class";
import FullTeamHeal from "../strategies/FullTeamHeal.class";
import FullTeamShield from "../strategies/FullTeamShield.class";
import SwapEffect from "../strategies/Swap.class";
import Character from "../types/Character.type";
import { createCharacterFromJsonTemplate } from "./CharacterGeneration.service";

export function createGameState(player1: Player, player2: Player): GameState {
    return {
        currentRound: 0,
        rollsLeft: 3,
        priorityQueue: createPriorityQueue(100),
        players: [player1, player2],
    };
}

export function createTeamsFromTemplates(templateContents: string[]): Character[] {
    return templateContents.map(createCharacterFromJsonTemplate);
}

export function initializeEffects() {
    EffectFactory.registerEffect("SingleTargetDamage", (amount) => new SingleTargetDamage(amount));
    EffectFactory.registerEffect("SingleTargetHeal", (amount) => new SingleTargetHeal(amount));
    EffectFactory.registerEffect("SingleTargetShield", (amount) => new SingleTargetShield(amount));
    EffectFactory.registerEffect("CleaveDamage", (amount) => new CleaveDamage(amount));
    EffectFactory.registerEffect("CleaveHeal", (amount) => new CleaveHeal(amount));
    EffectFactory.registerEffect("CleaveShield", (amount) => new CleaveShield(amount));
    EffectFactory.registerEffect("FullTeamDamage", (amount) => new FullTeamDamage(amount));
    EffectFactory.registerEffect("FullTeamHeal", (amount) => new FullTeamHeal(amount));
    EffectFactory.registerEffect("FullTeamShield", (amount) => new FullTeamShield(amount));
    EffectFactory.registerEffect("SwapLeft", () => new SwapEffect("left"));
    EffectFactory.registerEffect("SwapRight", () => new SwapEffect("right"));
}
