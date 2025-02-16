import { gainHp } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import Position from "src/types/Position.type";
import Effect from "../types/Effect.type";
import TargetingFunction from "./TargetType.type";
import { Player } from "src/types/Player.type";



export default class SingleTargetHeal implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(players: [Player, Player], target: Position) {
        const targetedCharacters = this.findTargets(players, target);

        return targetedCharacters.map(chara => gainHp(chara, this.amount));
    }
}
