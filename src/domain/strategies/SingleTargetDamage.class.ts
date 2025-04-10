import { dealDamage } from "../services/Character.service";
import { findSingleTarget } from "../services/Position.service";
import Effect from "../types/Effect.type";
import TargetingFunction from "./TargetType.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "./TargetUtils";

export default class SingleTargetDamage implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position): GameState {
        const targetedCharacters = this.findTargets(gameState.players, target);

        const updatedPlayers = applyEffectToTargets(gameState.players, targetedCharacters, (character) => dealDamage(character, this.amount));

        return { ...gameState, players: updatedPlayers };
    }
}
