import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import EffectLabel from "../types/EffectLabels.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { SwapDirection } from "./Player.service";
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
        phase: GamePhase.PLACEMENT,
        currentRound: 0,
        rollsLeft: 2,
        playersReady: [false, false],
        priorityQueue: createPriorityQueue(100),
        players: [player1, player2],
    };
}

export function createTeamsFromTemplates(templateContents: string[]): Character[] {
    return templateContents.map(createCharacterFromJsonTemplate);
}

export function initializeEffects() {
    EffectFactory.registerEffect(EffectLabel.SingleTargetDamage,  (amount) => new SingleTargetDamage(amount));
    EffectFactory.registerEffect(EffectLabel.SingleTargetHeal,    (amount) => new SingleTargetHeal(amount));
    EffectFactory.registerEffect(EffectLabel.SingleTargetShield,  (amount) => new SingleTargetShield(amount));
    EffectFactory.registerEffect(EffectLabel.CleaveDamage,        (amount) => new CleaveDamage(amount));
    EffectFactory.registerEffect(EffectLabel.CleaveHeal,          (amount) => new CleaveHeal(amount));
    EffectFactory.registerEffect(EffectLabel.CleaveShield,        (amount) => new CleaveShield(amount));
    EffectFactory.registerEffect(EffectLabel.FullTeamDamage,      (amount) => new FullTeamDamage(amount));
    EffectFactory.registerEffect(EffectLabel.FullTeamHeal,        (amount) => new FullTeamHeal(amount));
    EffectFactory.registerEffect(EffectLabel.FullTeamShield,      (amount) => new FullTeamShield(amount));
    EffectFactory.registerEffect(EffectLabel.SwapLeft,            () => new SwapEffect(SwapDirection.LEFT));
    EffectFactory.registerEffect(EffectLabel.SwapRight,           () => new SwapEffect(SwapDirection.RIGHT));
}
