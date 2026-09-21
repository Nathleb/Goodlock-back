import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import EffectLabel from "../types/EffectLabels.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { Player } from "../types/Player.type";
import EffectFactory from "../factories/EffectFactory.class";
import Damage from "../strategies/Damage.class";
import Heal from "../strategies/Heal.class";
import Shield from "../strategies/Shield.class";
import Swap from "../strategies/Swap.class";
import Character from "../types/Character.type";
import { createCharacterFromJsonTemplate } from "./CharacterGeneration.service";

export function createGameState(player1: Player, player2: Player): GameState {
    return {
        phase: GamePhase.PLACEMENT,
        currentRound: 0,
        rollsLeft: 2,
        playersReady: [false, false],
        priorityQueue: createPriorityQueue(),
        players: [player1, player2],
    };
}

export function createTeamsFromTemplates(templateContents: string[], factory: EffectFactory): Character[] {
    return templateContents.map(t => createCharacterFromJsonTemplate(t, factory));
}

export function buildEffectFactory(): EffectFactory {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Damage, (amount) => new Damage(amount));
    factory.registerEffect(EffectLabel.Heal,   (amount) => new Heal(amount));
    factory.registerEffect(EffectLabel.Shield, (amount) => new Shield(amount));
    factory.registerEffect(EffectLabel.Swap,   () => new Swap());
    return factory;
}
