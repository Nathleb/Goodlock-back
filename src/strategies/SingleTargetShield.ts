import { gainShield } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import Position from "src/types/Position";
import GameState from "src/types/GameState.type";
import Effect from "../types/Effect.type";
import { TargetingFunction } from "./TargetType.type";


export default class SingleTargetShield implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position) {
        return gainShield(targetedCharacter, this.amount);
    }
}
