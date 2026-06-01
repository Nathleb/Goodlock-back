import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import EffectLabel from "../types/EffectLabels.type";
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
import SwapAlly from "../strategies/Swap.class";
import Push from "../strategies/Push.class";
import MoveToSlot from "../strategies/MoveToSlot.class";
import SelfDamage from "../strategies/SelfDamage.class";
import SelfHeal from "../strategies/SelfHeal.class";
import SelfShield from "../strategies/SelfShield.class";
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

export function createTeamsFromTemplates(templateContents: string[], factory: EffectFactory): Character[] {
    return templateContents.map(t => createCharacterFromJsonTemplate(t, factory));
}

export function buildEffectFactory(): EffectFactory {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.SingleTargetDamage,  (amount) => new SingleTargetDamage(amount));
    factory.registerEffect(EffectLabel.SingleTargetHeal,    (amount) => new SingleTargetHeal(amount));
    factory.registerEffect(EffectLabel.SingleTargetShield,  (amount) => new SingleTargetShield(amount));
    factory.registerEffect(EffectLabel.CleaveDamage,        (amount) => new CleaveDamage(amount));
    factory.registerEffect(EffectLabel.CleaveHeal,          (amount) => new CleaveHeal(amount));
    factory.registerEffect(EffectLabel.CleaveShield,        (amount) => new CleaveShield(amount));
    factory.registerEffect(EffectLabel.FullTeamDamage,      (amount) => new FullTeamDamage(amount));
    factory.registerEffect(EffectLabel.FullTeamHeal,        (amount) => new FullTeamHeal(amount));
    factory.registerEffect(EffectLabel.FullTeamShield,      (amount) => new FullTeamShield(amount));
    factory.registerEffect(EffectLabel.SwapAlly,    () => new SwapAlly());
    factory.registerEffect(EffectLabel.PushLeft,    (magnitude) => new Push(-magnitude));
    factory.registerEffect(EffectLabel.PushRight,   (magnitude) => new Push(magnitude));
    factory.registerEffect(EffectLabel.MoveToSlot,  (slot) => new MoveToSlot(slot));
    factory.registerEffect(EffectLabel.SelfDamage,  (amount) => new SelfDamage(amount));
    factory.registerEffect(EffectLabel.SelfHeal,    (amount) => new SelfHeal(amount));
    factory.registerEffect(EffectLabel.SelfShield,  (amount) => new SelfShield(amount));
    return factory;
}
