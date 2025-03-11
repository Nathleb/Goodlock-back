import { gainHp } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import Position from "src/types/Position.type";
import Effect from "../types/Effect.type";
import TargetingFunction from "./TargetType.type";
import GameState from "src/types/GameState.type";
import { applyEffectToTargets } from "./TargetUtils";

export default class SingleTargetHeal implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position): GameState {
        const targetedCharacters = this.findTargets(gameState.players, target);

        const updatedPlayers = applyEffectToTargets(gameState.players, targetedCharacters, (character) => gainHp(character, this.amount));

        return { ...gameState, players: updatedPlayers };
    }
}
