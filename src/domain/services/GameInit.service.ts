import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import EffectLabel from "../types/EffectLabels.type";
import { createPriorityQueue } from "./PriorityQueue.service";
import { Player } from "../types/Player.type";
import { PlayerIndex } from "../types/Position.type";
import EffectFactory from "../factories/EffectFactory.class";
import ApplyStat from "../strategies/ApplyStat.class";
import Damage from "../strategies/Damage.class";
import FixedDamage from "../strategies/FixedDamage.class";
import Heal from "../strategies/Heal.class";
import Shield from "../strategies/Shield.class";
import Swap from "../strategies/Swap.class";

export function createGameState(player1: Player, player2: Player, initiativePlayerIndex: PlayerIndex = 0): GameState {
    return {
        phase: GamePhase.PLACEMENT,
        currentRound: 0,
        initiativePlayerIndex,
        rollsLeft: 2,
        playersReady: [false, false],
        priorityQueue: createPriorityQueue(),
        players: [player1, player2],
    };
}

export function buildEffectFactory(): EffectFactory {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Damage, (amount) => new Damage(amount));
    factory.registerEffect(EffectLabel.FixedDamage, (amount) => new FixedDamage(amount));
    factory.registerEffect(EffectLabel.Heal,   (amount) => new Heal(amount));
    factory.registerEffect(EffectLabel.Shield, (amount) => new Shield(amount));
    factory.registerEffect(EffectLabel.Swap,   () => new Swap());
    factory.registerEffect(EffectLabel.ApplyStat, (amount, params) => new ApplyStat(params!.stat!, amount, params!.duration!));
    return factory;
}
