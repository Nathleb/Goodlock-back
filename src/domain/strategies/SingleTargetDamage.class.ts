import { dealDamage } from "../services/Character.service";
import { findSingleTarget } from "../services/Position.service";
import Effect from "../types/Effect.type";
import TargetingFunction from "../types/TargetingFunction.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class SingleTargetDamage implements Effect {
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number) {
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position, _actorId: string): GameState {
        const targetedCharacters = this.findTargets(gameState.players, target);
        const updatedPlayers = applyEffectToTargets(gameState.players, targetedCharacters, (character) => dealDamage(character, this.amount));
        return { ...gameState, players: updatedPlayers };
    }
}
