import { dealDamage } from "src/services/Character.service";
import Character from "src/types/Character.type";
import Effect from "../types/Effect.type";
import { SingleTarget } from "./TargetType.type";


export default class SingleTargetDamage implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly type: SingleTarget = "SingleTarget";

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(targetedCharacter: Character): void {
        dealDamage(targetedCharacter, this.amount);
    }
}
