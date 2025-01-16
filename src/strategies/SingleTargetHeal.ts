import { gainHp } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Location.service";
import Coordinate from "src/types/Coordinate";
import GameState from "src/types/GameState.type";
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

    solve(gameState: GameState, targetedLocation: Coordinate) {
        const targetedCharacters = this.findTargets(gameState, targetedLocation);

        const updatedCharacters = targetedCharacters.map(chara => gainHp(chara, this.amount));
    }
}
