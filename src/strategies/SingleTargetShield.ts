import { gainShield } from "src/services/Character.service";
import Character from "src/types/Character.type";
import Effect from "../types/Effect.type";


export default class SingleTargetShield implements Effect {
    readonly priority: number;
    readonly amount: number;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(targetedCharacter: Character): void {
        gainShield(targetedCharacter, this.amount);
    }
}
