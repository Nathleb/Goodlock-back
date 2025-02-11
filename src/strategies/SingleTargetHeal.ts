import { gainHp } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import GameState from "src/types/GameState.type";
import Position from "src/types/Position.type";
import Effect from "../types/Effect.type";
import { TargetingFunction } from "./TargetType.type";



export default class SingleTargetHeal implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, position: Position) {
        const targetedCharacters = this.findTargets(gameState, position);

        const updatedCharacters = targetedCharacters.map(chara => gainHp(chara, this.amount));
    }
}
