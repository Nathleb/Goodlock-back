import { dealDamage } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import Character from "src/types/Character.type";
import Effect from "../types/Effect.type";
import { TargetingFunction } from "./TargetType.type";


export default class SingleTargetDamage implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position) {
        return dealDamage(targetedCharacter, this.amount);
    }
}
